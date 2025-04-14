// Copyright: IQGeo Limited 2010-2023
//###############################################################################
// myWorld uniform resource name
//###############################################################################

/**
 * A reference to a myWorld database object
 *
 * Consists of a record identifier plus optional qualifiers
 * (c.f. a graph database attributed link).
 *
 * Provides facilities for parsing from a URN string
 */
export class Reference {
    /**
     * Build a reference from a myWorld URN string (uniform resource name)
     *
     * DATASOURCE is the default datasource to use if not present
     * in the URN. If format error raises ValueError or returns None
     * URN format is:
     *    [<datasource>] / <feature_type> / <id> [?<qualifier>=<value>] [&<qualifier>=<value>] ..
     *
     * @example
     *    copper_cable/1537684?from_pair=1&to_pair=3
     */
    static parseUrn = function (urn, datasource = 'myworld', errorIfBad = false) {
        const error = (...msg) => {
            if (errorIfBad) throw new Error(' '.join(msg));
        };

        // Extract qualifiers
        const qualifiers = {};
        let base;
        if (urn.includes('?')) {
            let qualifiersStr;
            [base, qualifiersStr] = urn.split('?');

            for (const qualifierStr of qualifiersStr.split('&')) {
                const [key, val] = qualifierStr.split('=');
                qualifiers[key] = val;
            }
        } else {
            base = urn;
        }

        // Extract feature type and ID
        const baseParts = base.split('/');
        const nParts = baseParts.length;

        if (nParts < 2 || nParts > 3) {
            error('Bad feature reference:', base);
            return undefined;
        }

        const featureId = baseParts.pop();
        const featureType = baseParts.pop();
        if (baseParts.length) {
            datasource = baseParts.pop();
        }

        return new Reference(datasource, featureType, featureId, qualifiers);
    };

    constructor(datasource, feature_type, id, qualifiers = {}) {
        this.datasource = datasource;
        this.feature_type = feature_type;
        this.id = id;
        this.qualifiers = qualifiers;
    }

    /**
     * Raise ValueError if self is not from the myWorld datasource
     */
    assert_myworld() {
        // ENH: Strictly, datasource None means same as owning record .. so this is not entirely correct
        if (this.datasource != 'myworld') {
            throw new Error('Not a myWorld feature: ' + this.base);
        }
    }

    /**
     * Self as a URN string
     */
    urn(include_qualifiers = true) {
        // Build base
        let urn = this.base;

        // Add qualifiers
        if (include_qualifiers) {
            let sep = '?';
            for (const [qual, val] of Object.entries(this.qualifiers)) {
                urn += `${sep}${qual}=${val}`;
                sep = '&';
            }
        }

        return urn;
    }

    /**
     * Self's unqualified URN
     */
    get base() {
        // Add datasource (if required)
        const dsPrefix = this.datasource != 'myworld' ? this.datasource + '/' : '';

        // Add feature ref
        return `${dsPrefix}${this.feature_type}/${this.id}`;
    }

    /**
     * String used to identify self in GUI
     */
    toString() {
        return `Reference(${this.urn()})`;
    }
}
