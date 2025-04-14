// Copyright: IQGeo Limited 2010-2023

/**
 * Helper for extracting values from a style definition string
 */
export class StyleDefParser {
    constructor(defStr = '') {
        this.fields = defStr.split(':');
        this.iField = -1;
    }

    /**
     * Return next field from string, casting to 'type'
     */
    // ENH: Check enums, report errors, ...
    get(type = 'string', defaultVal = undefined) {
        // Check for no value
        if (++this.iField >= this.fields.length) return defaultVal;
        const val = this.fields[this.iField];
        if (val === '') return defaultVal;

        // Cast to requested type
        if (type == 'integer') return parseInt(val);
        if (type == 'float') return parseFloat(val);
        if (type == 'unit_value') return this.parseUnitItem(val);
        if (type == 'string_and_offset') return this.parseOffsetItem(val);
        return val;
    }

    /**
     * Parse a size specification with optional unit
     */
    parseUnitItem(val) {
        const res = val.match(/(\-?\d+\.?\d*)\s*(\w*)/);
        if (!res) return [];
        return [parseFloat(res[1]), res[2]];
    }

    /**
     * Parse alignment and offset from string 'val'
     */
    parseOffsetItem(val) {
        let align = val; //for situations where the offset is not defined
        let offset = 0;

        // ENH: Use a regexp
        if (val.includes('+')) {
            const parts = val.split('+');
            align = parts[0];
            offset = parseFloat(parts[1]);
        } else if (val.includes('-')) {
            const parts = val.split('-');
            align = parts[0];
            offset = -parseFloat(parts[1]);
        }

        return [align, offset];
    }
}

export default StyleDefParser;
