// Copyright: IQGeo Limited 2010-2023
// All styles
//
// Provided to simplify imports
export * from './index';
import * as styles from './index';
const { SymbolStyle, IconStyle, LineStyle, FillStyle, TextStyle, LookupStyle, Style } = styles;

//here to avoid circular dependency
Style.newFrom = function (options) {
    if (!options) return;
    else if (options.lookupProp || options.defaultStyle) {
        const { lookup: lookupData, ...others } = options;
        const lookup = {};
        for (let [key, value] of Object.entries(lookupData)) {
            lookup[key] = Style.newFrom(value);
        }
        return new LookupStyle({ ...others, lookup });
    } else if (options.iconUrl) return new IconStyle(options);
    else if (options.symbol) return new SymbolStyle(options);
    else if (options.lineStyle) return new LineStyle(options);
    else if (options.text || options.textProp) return new TextStyle(options);
    else return new FillStyle(options);
};

export default styles;
