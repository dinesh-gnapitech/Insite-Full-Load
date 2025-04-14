import React, { PureComponent } from 'react';
import { Input } from 'antd';
import { localise, Picker, MultiLanguageInput, DateDefaultPicker } from '../../../shared';
import { FeatureFieldsTable } from './FeatureFieldsTable';
import {
    isStoredField,
    isTitleField,
    isGeomField,
    isNumberType,
    isCalculatedField
} from '../utils';
import { EnumeratorSelect } from './EnumeratorSelect';
import { GeneratorSelect } from './GeneratorSelect';
import { FieldEditorSelect } from './FieldEditorSelect';
import { FieldViewerSelect } from './FieldViewerSelect';
import { TypePickerItems } from '../../../shared';
import { KeyOutlined } from '@ant-design/icons';

const getTextInput = function (record) {
    return (
        <Input
            style={{ width: '100%' }}
            disabled={!isNumberType(record)}
            onMouseDown={e => e.target.focus()}
        />
    );
};

//Component for the stored fields tab of the Feature editor
@localise('features')
export class FeatureStoredFields extends PureComponent {
    static enumeratorLoadAllPromise = null;

    constructor(props) {
        super(props);

        this.filter = field =>
            isStoredField(field) &&
            !isTitleField(field) &&
            !isGeomField(field) &&
            !isCalculatedField(field);

        this.state = {
            enums: null
        };
    }

    async componentDidMount() {
        const enumStore = this.props.store.enumeratorStore;
        if (!FeatureStoredFields.enumeratorLoadAllPromise) {
            FeatureStoredFields.enumeratorLoadAllPromise = enumStore.getAll();
        }
        await FeatureStoredFields.enumeratorLoadAllPromise;
        this.setState({
            enums: Object.keys(enumStore.store || []).sort()
        });
    }

    render() {
        const { msg, store, dsType, dsClass, data } = this.props;
        const { enums } = this.state;

        const editable = store.ddStore.current.editable;
        const generatorDisabled = data.datasource !== 'myworld';
        const loading = enums === null;
        //  Calculate the enumerators here once for optimization reasons

        const columns = [
            {
                className: 'table-column-wrapping',
                title: msg('name'),
                dataIndex: 'name',
                width: 160,
                fixed: 'left',
                getInput: record =>
                    (record.isNew && <Input onMouseDown={e => e.target.focus()} />) ||
                    (record.key && (
                        <span>
                            {record.name} <KeyOutlined />
                        </span>
                    ))
            },
            {
                title: msg('external_name'),
                dataIndex: 'external_name',
                width: 160,
                component: <MultiLanguageInput className={'external_name'} />
            },
            {
                title: msg('type'),
                dataIndex: 'type',
                width: 160,
                component: (
                    <Picker
                        className="field-type-picker"
                        msg={msg}
                        disabled={dsType !== 'myworld'}
                        items={TypePickerItems}
                        id={'type'}
                    />
                )
            },
            {
                title: msg('viewer_class'),
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
                          title: msg('editor_class'),
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
                title: msg('default'),
                dataIndex: 'default',
                width: 100,
                inputType: 'string',
                getInput: record =>
                    record.type === 'date' && (
                        <DateDefaultPicker
                            className="field-date-default-picker"
                            msg={msg}
                            disabled={dsType !== 'myworld'}
                        />
                    )
            },
            {
                title: msg('enumerator'),
                dataIndex: 'enum',
                width: 170,
                component: <EnumeratorSelect items={enums} />
            },
            {
                title: msg('generator'),
                dataIndex: 'generator',
                width: 110,
                getInput: record => <GeneratorSelect disabled={generatorDisabled} data={record} />
            },
            {
                title: msg('unit_scale'),
                dataIndex: 'unit_scale',
                width: 90,
                getInput: getTextInput
            },
            {
                title: msg('unit'),
                dataIndex: 'unit',
                width: 50,
                getInput: getTextInput
            },
            {
                title: msg('display_unit'),
                dataIndex: 'display_unit',
                width: 70,
                getInput: getTextInput
            },
            {
                title: msg('display_format'),
                dataIndex: 'display_format',
                width: 85,
                getInput: getTextInput
            },
            {
                title: msg('min_value'),
                dataIndex: 'min_value',
                width: 90,
                type: 'number',
                getInput: getTextInput
            },
            {
                title: msg('max_value'),
                dataIndex: 'max_value',
                width: 90,
                type: 'number',
                getInput: getTextInput
            },
            {
                title: msg('indexed'),
                dataIndex: 'indexed',
                inputType: 'checkbox',
                width: 80,
                className: 'text-center',
                type: 'boolean'
            }
        ];

        return (
            <FeatureFieldsTable
                loading={loading}
                dsClass={dsClass}
                filter={this.filter}
                columns={columns}
                fieldType={'stored'}
                sortable={true}
            />
        );
    }
}
