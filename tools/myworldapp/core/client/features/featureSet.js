// Copyright: IQGeo Limited 2010-2023
import { MywClass } from 'myWorld/base/class';
import { Feature } from './feature';

export class FeatureSet extends MywClass {
    static {
        this.prototype.type = 'features';
    }

    /**
     * @class  A set of {@link Feature}
     * @constructs
     */
    constructor(features) {
        super();
        this.items = [];
        this._itemsByUrn = {};

        if (features) this.addAll(features);
    }

    /**
     * set the array of filtred features
     * @param  {Array<string>} urns   feature urns
     */
    setFilteredItems(urns) {
        if (!urns) {
            //clear filter: .items becomes complete list
            this.items = Object.values(this._itemsByUrn);
        } else {
            this.items = urns.map(urn => this.getFeatureByUrn(urn));
        }
    }

    /**
     * Returns the feature associated with the given urn
     * @param  {string} urn
     * @return {Feature|undefined}
     */
    getFeatureByUrn(urn) {
        return this._itemsByUrn[urn];
    }

    /**
     * Checks for changes to urns of the features so that getFeatureByUrn() can be safely invoked
     */
    refresh() {
        for (const [urn, feature] of Object.entries(this._itemsByUrn)) {
            if (urn != feature.getUrn(true, true)) {
                this.remove(urn);
                this.add(feature);
            }
        }
    }

    /**
     * Adds a feature to the set
     * @param {Feature} feature
     */
    add(feature) {
        feature.index = this.items.length;
        this.items.push(feature);
        const urn = feature.getUrn(true, true); //include delta to support same feature in different deltas (forward view)
        this._itemsByUrn[urn] = feature;
    }

    /**
     * Adds a list of features to the set
     * @param {Array<Feature>} features
     */
    addAll(features) {
        // Add all of the provided features.
        for (let i = 0; i < features.length; i++) {
            this.add(features[i]);
        }
        this.totalCount = features.totalCount;
    }

    remove(urn) {
        if (Object.prototype.hasOwnProperty.call(this._itemsByUrn, urn))
            delete this._itemsByUrn[urn];
        this.setFilteredItems(Object.keys(this._itemsByUrn));
    }

    /**
     * Empties the set
     */
    removeAll() {
        // Remove all of the features.

        this.items = [];
        this._itemsByUrn = {};
    }

    /**
     * Returns true if feature is found within this FeatureSet
     * @param {string|Feature} featureOrfeatureUrn
     * @returns {Boolean}
     */
    contains(featureOrfeatureUrn) {
        let urn = undefined;
        if (featureOrfeatureUrn instanceof Feature) {
            urn = featureOrfeatureUrn.getUrn(true, true); //include delta to support same feature in different deltas (forward view)
        } else if (typeof featureOrfeatureUrn == 'string') {
            urn = featureOrfeatureUrn;
        } else {
            return false; //ENH: We won't be able to match whatever they passed, should we throw an exception?
        }
        return Object.prototype.hasOwnProperty.call(this._itemsByUrn, urn);
    }

    /**
     * Whether the set is empty
     * @return {Boolean}
     */
    isEmpty() {
        return this.items.length === 0;
    }

    /**
     * The size of the set
     * @return {number}
     */
    size() {
        return this.items.length;
    }

    /** shallow copy of self */
    clone() {
        const c = new FeatureSet();
        c.items = this.items;
        c._itemsByUrn = this._itemsByUrn;
        c.totalCount = this.totalCount;
        return c;
    }

    /**
     * Returns feature elements as a GeoJSON feature collection
     */
    asGeoJson() {
        return {
            type: 'FeatureCollection',
            features: this.items.map(item => item.asGeoJson())
        };
    }
}

export default FeatureSet;
