import React, { Component } from 'react';
import { SelectWithInput } from '../../../shared';

const typeEditorMapping = {
    string: ['myw.BarcodeFieldEditor'],
    with_picklist: ['myw.DropdownFieldEditor'],
    image: ['myw.MapDoodleFieldEditor'],
    reference: ['myw.CurrentReferenceFieldEditor'],
    reference_set: ['myw.AttachmentsFieldEditor']
};

//Class to display a select box with a list of field editors (except default) compatible with the field type
export class FieldEditorSelect extends Component {
    render() {
        const { type } = this.props.data;
        const typeRoot = type?.split('(')[0];

        const mapKey = this.props.data.enum ? 'with_picklist' : typeRoot;
        const items = typeEditorMapping[mapKey] || [];

        return (
            <SelectWithInput
                {...this.props}
                items={items}
                className={'field-editor-select'}
            ></SelectWithInput>
        );
    }
}
