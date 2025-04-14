// Copyright: IQGeo Limited 2010-2023
import { EnumeratorFieldEditor } from './enumeratorFieldEditor';

/**
 * Editor for enumerator fields that forces the use of a dropdown<br/>
 * @name DropdownFieldEditor
 * @constructor
 * @extends {enumeratorFieldEditor}
 */
export class DropdownFieldEditor extends EnumeratorFieldEditor {
    static {
        this.mergeOptions({ limitForExpanded: 0 });
    }
}

export default DropdownFieldEditor;
