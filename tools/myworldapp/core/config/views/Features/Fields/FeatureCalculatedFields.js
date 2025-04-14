import React, { Component } from 'react';
import { Input } from 'antd';
import { FeatureFieldsTable } from './FeatureFieldsTable';
import { isCalculatedField, isNumberType, isStoredField } from '../utils';
import { FieldEditorSelect } from './FieldEditorSelect';
import { FieldViewerSelect } from './FieldViewerSelect';

import {
    localise,
    Picker,
    TypePickerItems,
    ValuePickerItems,
    MultiLanguageInput
} from '../../../shared';

//Component for the stored fields tab of the Feature editor
@localise('features')
export class FeatureCalculatedFields extends Component {
    constructor(props) {
        super(props);

        this.filter = field =>
            (field.isNew && field.fieldType == 'calculated') ||
            (isCalculatedField(field) && !isStoredField(field));
    }

    render() {
        const { msg, store } = this.props;
        const editable = store.ddStore.current.editable;

        const columns = [
            {
                className: 'table-column-wrapping',
                title: 'name',
                dataIndex: 'name',
                width: 160,
                fixed: 'left',
                getInput: record => record.isNew && <Input onMouseDown={e => e.target.focus()} />
            },
            {
                title: 'external_name',
                dataIndex: 'external_name',
                width: 160,
                component: <MultiLanguageInput className={'external_name'} />
            },
            {
                title: 'type',
                dataIndex: 'type',
                width: 160,
                component: (
                    <Picker
                        className="field-type-picker"
                        msg={msg}
                        items={TypePickerItems}
                        id={'type'}
                    />
                )
            },
            {
                title: 'value',
                dataIndex: 'value',
                component: <Picker msg={msg} items={ValuePickerItems} />
            },
            {
                title: 'viewer_class',
                dataIndex: 'viewer_class',
                width: 160,
                getInput: record => (
                    <FieldViewerSelect
                        key={'${record.internal_name}_${record.type}'}
                        data={record}
                    />
                )
            },
            ...(editable
                ? [
                      {
                          title: 'editor_class',
                          dataIndex: 'editor_class',
                          width: 160,
                          getInput: record => (
                              <FieldEditorSelect
                                  key={'${record.internal_name}_${record.type}'}
                                  data={record}
                              />
                          )
                      }
                  ]
                : []),
            {
                title: 'unit_scale',
                dataIndex: 'unit_scale',
                width: 100,
                getInput: record => (
                    <Input disabled={!isNumberType(record)} onMouseDown={e => e.target.focus()} />
                )
            },
            {
                title: 'unit',
                dataIndex: 'unit',
                width: 100,
                getInput: record => (
                    <Input disabled={!isNumberType(record)} onMouseDown={e => e.target.focus()} />
                )
            },
            {
                title: 'display_unit',
                dataIndex: 'display_unit',
                width: 100,
                getInput: record => (
                    <Input disabled={!isNumberType(record)} onMouseDown={e => e.target.focus()} />
                )
            },
            {
                title: 'display_format',
                dataIndex: 'display_format',
                width: 100,
                getInput: record => (
                    <Input disabled={!isNumberType(record)} onMouseDown={e => e.target.focus()} />
                )
            }
        ];
        columns.forEach(col => (col.title = msg(col.title)));

        return (
            <FeatureFieldsTable
                filter={this.filter}
                columns={columns}
                fieldType={'calculated'}
                sortable={true}
            />
        );
    }
}
