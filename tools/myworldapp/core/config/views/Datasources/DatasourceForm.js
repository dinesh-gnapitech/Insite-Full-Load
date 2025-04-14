import React, { Component } from 'react';
import { Input, Select } from 'antd';
import { inject, observer } from 'mobx-react';
import { datasourceTypes } from 'myWorld/datasources';
import { FormBuilder, localise, Validators, MultiLanguageInput } from '../../shared';
const { Option } = Select;

@inject('store')
@localise('datasources')
@observer
export class DatasourceForm extends Component {
    onTypeChange = value => {
        this.props.data['type'] = value;
        this.forceUpdate();
    };
    render() {
        const { formRef, msg, edit, data } = this.props;
        const formItemLayout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 10 }
        };
        const dotAllowed = true;
        const onTypeChange = this.onTypeChange;
        let fields = [
            {
                id: 'name',
                component: <Input disabled={edit} />,
                tooltip: msg('name_help'),
                rules: [{ required: true }, { validator: Validators.internalName, msg, dotAllowed }]
            },
            {
                id: 'external_name',
                component: (
                    <MultiLanguageInput style={{ width: 300 }} className={'external_name'} />
                ),
                tooltip: msg('external_name_help'),
                initialValue: null
            },
            {
                id: 'description',
                component: <Input />,
                tooltip: msg('description_help'),
                initialValue: null
            },
            {
                id: 'type',
                component: (
                    <Select className="input-small" onChange={onTypeChange}>
                        {Object.keys(datasourceTypes).map(ds => (
                            <Option key={ds} value={ds}>
                                {ds}
                            </Option>
                        ))}
                    </Select>
                ),
                tooltip: msg('type_help'),
                initialValue: 'esri'
            }
        ];
        const dsType = formRef.current?.getFieldValue('type') || data?.type || 'esri';
        const specFields = datasourceTypes[dsType].specFields || [];
        let currentTable = null;

        specFields.forEach((fieldDef, i) => {
            if (fieldDef.tableGroup != currentTable) {
                currentTable = fieldDef.tableGroup;
                fields.push(
                    FormBuilder.createFieldFromDef('tableGroup' + i, {
                        viewClass: 'FieldDivider',
                        args: { label: msg(fieldDef.tableGroup) }
                    })
                );
            }
            let field = FormBuilder.createFieldFromDef('spec.', fieldDef, msg);
            field['tooltip'] = msg(`spec_${fieldDef.name}_help`);
            fields.push(field);
        });

        return (
            <FormBuilder
                msg={msg}
                form={formRef}
                fields={fields}
                formItemLayout={formItemLayout}
                data={data}
            />
        );
    }
}
