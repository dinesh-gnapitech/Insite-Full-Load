// Copyright: IQGeo Limited 2010-2023

/**
 * A composite style
 *
 * Internally composed of a list of {@link SimpleStyle}. Also supports OpenLayers styles
 */
export class Style {
    /**
     * Helper for combining a pair of OpenLayers styles
     * @param {ol/style/StyleLike} style1
     * @param {ol/styleStyleLike} style2
     */
    static concat(style1, style2) {
        if (!style1) return style2;
        if (!style2) return style1;

        return (...args) => {
            //handle styles to concatenate being functions. execute them and use results
            const s1 = typeof style1 == 'function' ? style1(...args) : style1;
            const s2 = typeof style2 == 'function' ? style2(...args) : style2;
            if (!s1) return s2;
            if (!s2) return s1;

            //handle styles being arrays of styles. we need to flatten them
            const sa1 = Array.isArray(s1) ? s1 : [s1];
            const sa2 = Array.isArray(s2) ? s2 : [s2];
            return [...sa1, ...sa2];
        };
    }

    /**
     * Construct from a list of styles
     * @param {...SimpleStyle} styles
     */
    constructor(...styles) {
        this.styles = [];
        for (let style of styles) {
            if (!style) continue;
            if (style instanceof Style) this.styles.push(...style.styles);
            else this.styles.push(style);
        }
    }

    /**
     * creates a copy of self
     */
    clone() {
        const clones = this.styles.map(style => style.clone());
        return new Style(...clones);
    }

    /**
     * Returns compound style built from self and 'other'
     * @param {SimpleStyle} other
     */
    // Jost for consistency with simple styles
    plus(other) {
        const style = new this(...this.styles);
        style.add(other);
        return style;
    }

    /**
     * Append 'styles' to self
     * @param {...SimpleStyle} styles
     */
    add(...styles) {
        for (const style of styles) {
            if (!style) continue;
            if (style instanceof Style) this.styles.push(...style.styles);
            else this.styles.push(style);
        }

        return this;
    }

    /**
     * @returns {string[]} Array with property names used for lookups
     */
    lookupProps() {
        if (!this._lookupProps) {
            this._lookupProps = [];
            for (let style of this.styles) {
                this._lookupProps.push(...style.lookupProps());
            }
        }
        return this._lookupProps;
    }

    /**
     * @returns {string[]} Array with property names used to render text, including any lookup properties
     */
    textProps() {
        if (!this._textProps) {
            let textProps = [];
            for (let style of this.styles) {
                textProps.push(...style.textProps());
            }
            this._textProps = [...new Set(textProps)];
        }
        return this._textProps;
    }

    /**
     * OpenLayers style for self
     * @param {ol/View|ol/Map} view
     */
    olStyle(view) {
        if (!this._olStyle) {
            if (view instanceof Map) view = view.getView();
            this._olStyle = this._getOlStyle(view); //ENH: cache for different views
        }
        return this._olStyle;
    }

    /*
     * OpenLayers style for self
     */
    _getOlStyle(view) {
        let olStyle;

        for (let style of this.styles) {
            style = style.olStyle?.(view) ?? style;
            olStyle = Style.concat(olStyle, style);
        }

        return olStyle;
    }
}

export default Style;
