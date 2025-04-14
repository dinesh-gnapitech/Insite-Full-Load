import SimpleStyle from './simpleStyle';

/**
 * A style that depends on the value of a feature's property
 *
 * @extends SimpleStyle
 */
export class LookupStyle extends SimpleStyle {
    /**
     * Construct from style definition string
     * @param {string} defStr
     * @param {class} StyleClass Class to use to parse the mapped styles ()
     */
    static parse(defStr, StyleClass) {
        let data;
        //Check if styleString can be parsed into an object
        try {
            data = JSON.parse(defStr);
        } catch (e) {
            return;
        }

        //Determine lookup field for style.
        if (!('lookupProp' in data)) {
            console.error('No lookup field defined in style');
            return undefined;
        }

        const { lookupProp, pickList, defaultStyle: defaultStr, lookup: lookupData } = data;
        const defaultStyle = StyleClass.parse(defaultStr);
        const lookup = {};
        for (let [key, value] of Object.entries(lookupData)) {
            lookup[key] = StyleClass.parse(value);
        }
        const opts = { isLookup: true, lookupProp, defaultStyle, lookup, pickList };
        return new this(opts);
    }

    /**
     * Constructor
     * @param {object} options
     * @param {string} options.lookupProp Name of field/property to do the lookup on
     * @param {SimpleStyle} options.defaultStyle Default style to use if the property value doesn't exist in the lookup
     * @param {object} options.lookup Mapping from property value to style
     * @param {string} [options.pickList] Name of enumerator/picklist. Used for configuration but used for rendering
     */
    constructor(options) {
        super();
        const { lookupProp, defaultStyle, lookup, pickList, ...others } = options;
        if (others.length) console.warn(`Unexpected options for LookupStyle:`, Object.keys(others));

        Object.assign(this, { isLookup: true, lookupProp, defaultStyle, lookup, pickList });

        //cache of mapped OL styles. keyed on mapping value
        this._olStyles = {};
    }

    get opacity() {
        return this._opacity;
    }
    set opacity(value) {
        //lookup style doesn't have an opacity but it could be given one when the layer opacity is applied
        this._opacity = value;
        //propagate means merging with the opacity set on each lookup
        //to avoid compouding on multiple calls we need to store the original values
        if (this.defaultStyle) {
            if (this._originalDefaultOpacity === undefined)
                this._originalDefaultOpacity = this.defaultStyle.opacity ?? 1;
            this.defaultStyle.opacity = this._originalDefaultOpacity * value;
        }
        if (!this._originalOpacity) this._originalOpacity = {};
        for (let key in this.lookup) {
            if (this._originalOpacity[key] === undefined)
                this._originalOpacity[key] = this.lookup[key].opacity ?? 1;
            this.lookup[key].opacity = this._originalOpacity[key] * value;
        }
    }
    get orientationProp() {
        return this._orientationProp;
    }
    set orientationProp(value) {
        this._orientationProp = value;
        this._propagate('orientationProp', value);
    }
    get minArrowLength() {
        return this._minArrowLength;
    }
    set minArrowLength(value) {
        this._minArrowLength = value;
        this._propagate('minArrowLength', value);
    }

    /**
     * style definition string for self
     */
    defStr() {
        const { lookupProp, defaultStyle, lookup, pickList } = this;
        const lookupStrings = {};
        const defaultStyleStr = defaultStyle?.defStr();
        for (let [key, value] of Object.entries(lookup)) {
            lookupStrings[key] = value?.defStr();
        }
        return JSON.stringify({
            lookupProp,
            pickList,
            defaultStyle: defaultStyleStr,
            lookup: lookupStrings
        });
    }

    /**
     * @returns {string[]} Array with property name used for lookup
     */
    lookupProps() {
        return [this.lookupProp];
    }

    /**
     * @returns {string[]} Array with property names used to render text, including any lookup properties
     */
    textProps() {
        if (!this._textProps) {
            let textProps = [this.lookupProp];
            if (this?.defaultStyle?.textProp) textProps.push(this.defaultStyle.textProp);
            Object.values(this.lookup).forEach(style => {
                if (style?.textProp) textProps.push(style.textProp);
            });
            this._textProps = [...new Set(textProps)];
        }
        return this._textProps;
    }

    getStyleFor(feature) {
        let value = feature.getProperties()[this.lookupProp];
        return this.lookup[value] || this.defaultStyle;
    }

    /*
     * OpenLayers style for self
     */
    _getOlStyle(view) {
        const { lookupProp } = this;
        return (feature, resolution) => {
            let value = feature.getProperties()[lookupProp];

            let olStyle = this._olStyles[value];
            if (!olStyle) {
                const mywStyle = this.getStyleFor(feature);
                olStyle = mywStyle?.olStyle(view);
                //cache
                this._olStyles[value] = olStyle;
            }
            if (typeof olStyle == 'function') return olStyle(feature, resolution);
            return olStyle;
        };
    }

    _propagate(propName, value) {
        if (this.defaultStyle) this.defaultStyle[propName] = value;
        for (let key in this.lookup) {
            this.lookup[key][propName] = value;
        }
    }
}
export default LookupStyle;
