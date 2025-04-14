// Copyright: IQGeo Limited 2010-2023
import { isEqual } from 'underscore';
import { MywClass } from 'myWorld/base/class';
import StyleManager from 'myWorld/layers/styleManager';
import { latLngBounds } from 'myWorld/base/latLngBounds.js';

export class FeatureRepresentation extends MywClass {
    /**
     * Initializes a Map representation of FEATURE
     * @class  Representation of a feature on an OpenLayers map
     * Provides highlight behaviour
     * @param  {Feature}            feature       Feature of which to create a representation of
     * @param  {object}                  options
     * @constructs
     */

    constructor(feature, options) {
        super();
        this.options = options = options || {};

        /** The feature being represented.
         * @type {Feature} */
        this.feature = feature;
        const getGeom = this.feature.getGeometryFieldNameInWorld;

        /** The name of the world this map will be displaying.
         * @type {string} */
        this.worldName = options.worldName || 'geo';

        /** The name of the geometery field. If undefined then geometryFieldName is set to primary geometry
         * @type {string} */
        this.geometryFieldName =
            options.geomFieldName ||
            (getGeom && this.feature.getGeometryFieldNameInWorld(this.worldName));

        /** The map on which the feature is being displayed.
         * @type {MapControl} */
        this.map = null;

        const geomType = this.getGeometryType();
        /**  Styles to use when rendering the feature. If null, default styles from the configuration will be used
         * @type {styleDefinition}  */
        this.styles = options.styles || StyleManager.getDefaultStyles(geomType); // store the styles for the feature.

        // Dimensions of arrow in line weight units.
        this.arrowHeight = 5;
        this.arrowWidth = 4;

        this._vectorSource = options.vectorSource;
        this._olFeature = options.olFeature;

        // Bounds of this feature.
        this._bounds = null;
    }

    /**
     * Highlights self
     * Changes the style of self to the highlight style
     */
    highlight() {
        this.highlighted = true;
        this._updateStyle();
    }

    /**
     * Changes the style of self to the normal style
     */
    unHighlight() {
        this.highlighted = false;
        this._updateStyle();
    }

    /**
     * Adds self to a map
     * @param {MapControl} map The map on which to visualize self
     */
    addToMap(map) {
        this.map = map;
        if (this._olFeature) {
            this._vectorSource.addFeature(this._olFeature);
        } else {
            const geojsonFeature = {
                type: 'Feature',
                geometry: this.getGeometry(),
                properties: this.feature.properties
            };
            this._olFeature = this._vectorSource.addGeoJSON(geojsonFeature);
        }

        this._olFeature._rep = this;

        this._updateStyle();
    }

    /**
     * Remove self from its current map
     */
    removeFromMap() {
        const map = this.map;
        this.map = null;
        if (map) this._vectorSource.removeFeature(this._olFeature);
    }

    /**
     * Returns the geometry being represented by self
     */
    getGeometry() {
        if (this.geometryFieldName) {
            return this.feature.getGeometry(this.geometryFieldName);
        } else {
            return this.feature.getGeometryInWorld(this.worldName);
        }
    }

    /**
     * Refreshes the representation with the details from an updated feature
     * @param  {Feature} feature Updated feature
     */
    update(feature, olFeature = undefined) {
        //use format to convert geometry coordinates
        const propertiesUnchanged = feature && isEqual(feature.properties, this.feature.properties);
        //ENH: check only the geometry being represented
        const primaryGeomUnchanged = feature && isEqual(feature.geometry, this.feature.geometry);
        const secondaryGeomsUnchanged =
            feature && isEqual(feature.secondary_geometries, this.feature.secondary_geometries);

        if (propertiesUnchanged && primaryGeomUnchanged && secondaryGeomsUnchanged) return; //no changes that require rebuilding the overlay

        if (feature) this.feature = feature;

        const tempFeature =
            olFeature ??
            this._vectorSource.getFormat().readFeature({
                type: 'Feature',
                geometry: feature.getGeometry(this.geometryFieldName)
            });
        this._olFeature.setGeometry(tempFeature.getGeometry());
        this._olFeature.setProperties(feature.properties);

        this._updateStyle();
    }

    _updateStyle() {
        if (!this.styles || !this.map) return;
        const style = this.styles[this.highlighted ? 'highlight' : 'normal'];
        const olStyle =
            style && typeof style.olStyle == 'function'
                ? style.olStyle(this.map.getView()) //style is a myw style
                : style; // style should be an OL style
        this._olFeature.setStyle(olStyle);
    }

    /**
     * @return {LatLngBounds} the bounds of self
     */
    getBounds() {
        if (!this._bounds) {
            const bbox = this.getGeometry().bbox();
            this._bounds = latLngBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
        }

        return this._bounds;
    }

    /**
     * Returns the centre point of self.
     * @return {LatLng}
     */
    getCenter() {
        const bounds = this.getBounds();
        return bounds.getCenter();
    }

    enableDragging() {
        if (this._overlay.dragging) {
            this._overlay.dragging.enable();
        }
    }

    disableDragging() {
        if (this._overlay.dragging) {
            this._overlay.dragging.disable();
        }
    }

    /**
     * Binds a tooltip to self
     * Tooltip is shown on mouse over
     * @param  {String|HTMLElement|Function} labelText  If a Function is passed it will receive the layer as the first argument and should return a String or HTMLElement.
     */
    bindTooltip(labelText, options) {
        this._tooltipText = labelText;
    }

    getTooptip() {
        return this._tooltipText;
    }

    /**
     * @return {string}  geojson geometry type of this feature
     */
    getGeometryType() {
        const geom = this.getGeometry();
        return geom?.type;
    }

    /*
     * Returns whether or not this object should be sent to the back of the map after adding it
     */
    _shouldSendToBack() {
        const geomType = this.getGeometryType();
        return geomType == 'Polygon' || geomType == 'MultiPolygon';
    }
}

export default FeatureRepresentation;
