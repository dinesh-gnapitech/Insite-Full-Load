import { Reference } from './reference';

/**
 * A feature view with in-memory cache
 * Short lived, readonly object (does not support write-through)
 */
export class ReadonlyFeatureView {
    constructor(view, cacheMaxSize = 10000) {
        /* Note: this object is not exposed to other objects, to enforce
         * readonly-ness, required for cache validity.
         * @type {FeatureView} */
        this._dbView = view;

        // cache of feature records, keyed by URN
        this.features = {};
        this.maxSize = cacheMaxSize;
    }

    /**
     * Shared interface with FeatureView
     * @returns {ReadonlyFeatureView} self
     */
    getReadonlyView() {
        return this;
    }

    /**
     * Returns records referenced by REFS
     * Missing records are ignored. Order of result is undefined
     * @param {Array<string|Reference>} refs a list of References or URNs
     * @param {object} [options]
     * @param {boolean} [options.errorIfBad=false] If True, raises ValueError on malformed URNs
     * @returns {FeatureModel[]}
     */
    async getRecs(refs, options = {}) {
        if (refs.length == 1) {
            let rec = await this.get(refs[0], options);
            if (rec != null) {
                return [rec];
            }
            return [];
        }

        let recs = this._dbView.getRecs(refs, options);

        // if the cache is full, clear it out before adding a new entry:
        if (this.maxSize && Object.keys(this.features).length + recs.length > this.maxSize) {
            this.features = {};
        }

        // cache the recs from the db
        for (let rec in recs) {
            this.features[rec.urn] = rec;
        }

        return recs;
    }

    /**
     * Returns the record referenced by REF (a MywReference or URN) if there is one
     * @param {Array<string|Reference>} refs a list of References or URNs
     * @param {object} [options]
     * @param {boolean} [options.errorIfBad=false] If True, raises ValueError on malformed URNs
     * @returns {FeatureModel}
     */
    async get(ref, options = {}, dsName = 'myworld') {
        let urn;
        if (ref instanceof Reference) {
            urn = ref.urn();
        } else {
            urn = ref;
        }

        if (!(urn in this.features)) {
            if (this.maxSize && Object.keys(this.features).length >= this.maxSize) {
                // if the cache is full, clear it out before adding a new entry:
                this.features = {};
            }
            this.features[urn] = this._dbView.get(ref, options, dsName);
        }

        return this.features[urn];
    }

    async getUnitScale(unit) {
        return this._dbView.db.unitScale(unit);
    }
}
