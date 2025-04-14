import React, { useEffect } from 'react';
import { Form, Input, Checkbox, Select } from 'antd';
import { toJS } from 'mobx';
import {
    UrlInputAndTestView,
    EnumView,
    EnumAndTestView,
    StringWithTestView,
    GeoserverURLTable,
    KeyValueView,
    ListView,
    FieldDivider,
    DateTimePicker,
    CRSSearch
} from './FieldEditors';
import { RenderingEditor } from '../views/Layers/RenderingEditor';
import myw from 'myWorld-base';
const { Option } = Select;
const FormItem = Form.Item;

//Component that takes a list of field definitions and renders them with components that are augmented with Antd's form field decorators

export const FormBuilder = props => {
    const { data, fields, msg, form, formItemLayout } = props;
    const hasReactHooksRef = Object.prototype.hasOwnProperty.call(form, 'current');

    //----------------------------Side effects-----------------------------
    useEffect(() => {
        const formRef = hasReactHooksRef ? form.current : form;
        const fields = {};
        if (data) {
            const clone = toJS(data);

            Object.entries(clone).forEach(([field, value]) => {
                if (value === Object(value)) {
                    fields[field] = {};
                    Object.entries(value).map(([key, value2]) => {
                        fields[`${field}.${key}`] = value2;
                    });
                }
                fields[field] = value;
            });

            if (Object.entries(fields).length === 0) formRef.resetFields();
            else formRef.setFieldsValue(fields);
        }
    }, [data]);

    //----------------------------Helper methods-----------------------------
    const renderFields = () => fields.map((field, k) => renderField(field, k));

    const renderField = (field, key) => {
        // const { getFieldDecorator } = form;
        const options = getOptions(field);

        const layout = {
            labelCol: { span: 4 },
            wrapperCol: { span: 10 },
            ...formItemLayout
        };

        const style = {};
        if (field.hidden) {
            style['display'] = 'none';
        }

        const FC = field.component;
        if (field.type === 'FieldDivider') return React.cloneElement(FC, { form, key });

        const formItemProps = {
            name: field.id,
            className: 'myw-form-item',
            style,
            key,
            label: <span>{field.label || msg?.(field.id) || field.id} </span>,
            ...layout,
            ...options
        };

        const { shouldUpdate, shouldUpdatePropValue } = field;
        if (shouldUpdate && shouldUpdatePropValue) {
            const { prop, value } = shouldUpdatePropValue;
            return (
                <FormItem noStyle shouldUpdate={shouldUpdate}>
                    {({ getFieldValue }) =>
                        getFieldValue(prop) === value ? (
                            <FormItem {...formItemProps}>
                                {React.cloneElement(FC, { form })}
                            </FormItem>
                        ) : null
                    }
                </FormItem>
            );
        } else {
            //decorate field component with antd's form field decorator
            return <FormItem {...formItemProps}>{React.cloneElement(FC, { form })}</FormItem>;
        }
    };

    const getOptions = field => {
        let options = { ...field };
        delete options.id;
        delete options.component;
        delete options.label;
        delete options.shouldUpdatePropValue;

        //The new antd v4 form uses 'tooltip' to show on hover help text
        if (options.help) options.tooltip = options.help;
        delete options.help;
        return options;
    };

    //----------------------------JSX-----------------------------
    const refAttr = hasReactHooksRef ? { ref: form } : { form: form };

    return (
        <Form
            {...refAttr}
            className="myw-form-view"
            onValuesChange={props.onValuesChange}
            onFinish={props.onFinish}
        >
            {renderFields()}
        </Form>
    );
};

FormBuilder.createFieldFromDef = (prefix = '', def, msg, onChange) => {
    const getHelpMsg = () => {
        const fieldName = def.name;
        //add the help text
        //the help text for the spec field is dependent on the layer type
        const msgKey = 'spec_' + fieldName;

        if (fieldName == 'mapType') {
            const helpMsg = myw.msg('layers', msgKey + '_help')[def.dsName];
            return helpMsg ? helpMsg : 'layers.spec_help';
        } else {
            return myw.msg('layers', msgKey + '_help');
        }
    };

    const onFieldChange = value => {
        onChange?.(value, def.name);
    };

    const fieldDef = {
        id: `${prefix}${def.name}`,
        tooltip: getHelpMsg(),
        initialValue: def.default || null
    };

    switch (def.viewClass) {
        case 'FieldDivider':
            return {
                ...fieldDef,
                component: <FieldDivider args={def.args} />,
                type: 'FieldDivider'
            };
        case 'UrlInputAndTestView':
            return { ...fieldDef, component: <UrlInputAndTestView args={def.args} /> };
        case 'KeyValueView': {
            const defArgs = def.args || {};
            const args = {
                ...defArgs,
                ...{ keyTitle: msg(defArgs.keyTitle), valueTitle: msg(defArgs.valueTitle) }
            };
            return { ...fieldDef, component: <KeyValueView args={args} /> };
        }
        case 'ListView':
            return { ...fieldDef, component: <ListView args={def.args} msg={msg} /> };
        case 'EnumAndTestView': {
            const args = { ...def.args, ...def };
            return {
                ...fieldDef,
                component: <EnumAndTestView args={args} onChange={onFieldChange} />
            };
        }
        case 'RenderingEditor':
            return {
                ...fieldDef,
                component: (
                    <RenderingEditor
                        args={{ ...def.args, ...def }}
                        msg={msg}
                        onChange={onFieldChange}
                    />
                )
            };
        case 'StringWithTestView': {
            const args = { ...def.args, ...def };
            return { ...fieldDef, component: <StringWithTestView args={args} /> };
        }
        case 'GeoserverURLTable': {
            const defArgs = def.args || {};
            const args = {
                ...defArgs,
                ...{ keyTitle: msg(defArgs.keyTitle), valueTitle: msg(defArgs.valueTitle) }
            };
            return { ...fieldDef, component: <GeoserverURLTable args={args} /> };
        }
        case 'DateTimePicker': {
            const args = { ...def.args, ...def };
            return { ...fieldDef, component: <DateTimePicker args={args} /> };
        }
        case 'CRSSearch': {
            const args = { ...def.args, ...def };
            return { ...fieldDef, component: <CRSSearch args={args} /> };
        }
    }

    if (typeof def.enumerator === 'string') {
        return { ...fieldDef, component: <EnumView args={def} /> };
    } else if (Array.isArray(def.enumerator)) {
        return {
            ...fieldDef,
            component: (
                <Select style={{ width: def.width }}>
                    {def.enumerator.map(i => (
                        <Option key={i} value={i}>
                            {i}
                        </Option>
                    ))}
                </Select>
            )
        };
    } else if (def.enumerator) {
        return {
            ...fieldDef,
            component: (
                <Select>
                    {Object.entries(def.enumerator).map(([key, val]) => {
                        if (typeof val == 'object') val = myw.msg(val.group, val.key);
                        return (
                            <Option key={key} value={key}>
                                {val}
                            </Option>
                        );
                    })}
                </Select>
            )
        };
    }

    switch (def.type) {
        case 'string':
            return { ...fieldDef, component: <Input /> };
        case 'boolean':
            return {
                ...fieldDef,
                valuePropName: 'checked',
                component: <Checkbox onChange={onFieldChange} />
            };
        case 'json':
            return { ...fieldDef, component: <Input /> };
        default:
            return { ...fieldDef, component: <Input /> };
    }
};
