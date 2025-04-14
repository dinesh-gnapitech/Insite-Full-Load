// Copyright: IQGeo Limited 2010-2023
import SimpleStyle from './simpleStyle';
import StyleDefParser from './styleDefParser';

import { Style, Fill } from 'ol/style';

/**
 * A fill style
 *
 * Supports world size width, patterns, arrows, etc. Provides functions for
 * serialise/de-serialise from style string + building OpenLayers style
 * @extends SimpleStyle
 */
export class FillStyle extends SimpleStyle {
    /**
     * Construct from style definition string 'defStr'
     */
    static parse(defStr) {
        const parser = new StyleDefParser(defStr);

        // Parse values
        const opts = {};
        opts.color = parser.get();
        opts.opacity = parser.get('float');

        // Convert to internal values
        if (opts.opacity) opts.opacity /= 100.0;

        return new this(opts);
    }

    /**
     * Constructor
     * @param {object} options
     * @param {color} options.color Fill color
     * @param {number} [options.opacity=1] Opacity. Between 0 and 1
     */
    constructor(options) {
        super(options);
        this.color = options.color;
        this.opacity = options.opacity ?? 1.0;
    }

    /**
     * style definition string for self
     */
    defStr() {
        const fields = [];
        fields.push(this.color);
        if (this.opacity != 1.0) fields.push(this.opacity * 100);

        return fields.join(':');
    }

    /*
     * OpenLayers style for self
     */
    _getOlStyle(view) {
        const { color, opacity } = this;
        const fillColor = this._colorFromString(color, opacity);

        return new Style({ fill: new Fill({ color: fillColor }) });
    }
}

export default FillStyle;
