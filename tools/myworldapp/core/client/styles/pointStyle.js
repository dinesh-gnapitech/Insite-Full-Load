// Copyright: IQGeo Limited 2010-2023
import SimpleStyle from './simpleStyle';
import SymbolStyle from './symbolStyle';
import IconStyle from './iconStyle';

/**
 * A point style.
 * Supports icons and pre-defined shapes
 */
export class PointStyle extends SimpleStyle {
    /**
     * Construct from style definition string
     * @param {string} defStr
     */
    static parse(defStr = '') {
        const field0 = defStr.split(':')[0];

        if (field0 in SymbolStyle.symbols) {
            return SymbolStyle.parse(defStr);
        } else {
            return IconStyle.parse(defStr);
        }
    }
}
export default PointStyle;
