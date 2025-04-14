import React, { useEffect } from 'react';
import { Form, Input, Select, Switch, InputNumber } from 'antd';
import { JSONEditorView } from '../../../shared';
import { useLocale } from '../../../shared/Hooks/useLocale';
const FormItem = Form.Item;
const Option = Select.Option;

export const SettingForm = props => {
    const msg = useLocale('settings');

    const formItemLayout = {
        labelCol: {
            xs: { span: 24 },
            sm: { span: 4 }
        },
        wrapperCol: {
            xs: { span: 24 },
            sm: { span: 16 }
        }
    };

    const { formRef, edit, data } = props;

    //----------------------------Side effects-----------------------------
    useEffect(() => {
        if (data) {
            if (data.type === 'BOOLEAN') data.value = [true, 'true'].includes(data.value);
            formRef.setFieldsValue(data);
        }
    }, [data]);
    //----------------------------Helper methods-----------------------------

    const typeValidator = (props, value, cb) => {
        const { type, msg } = props;
        if (type == 'integer') {
            !Number.isInteger(value) ? cb([msg('value_incorrect')]) : cb();
        } else if (type == 'float') {
            isNaN(value) ? cb([msg('value_incorrect')]) : cb();
        } else if (type == 'boolean') {
            ['true', 'false', true, false].includes(value) ? cb() : cb([msg('value_incorrect')]);
        } else if (typeof value !== type) {
            cb([msg('value_incorrect')]);
        } else {
            cb();
        }
    };

    const JSONValidator = (props, value, cb) => {
        try {
            JSON.parse(value);
            cb();
        } catch (e) {
            cb(msg('invalid_JSON'));
        }
    };

    const onChange = val => {
        formRef.setFieldsValue({ value: null, type: val });
    };

    //----------------------------JSX-----------------------------
    return (
        <Form className="myw-form-view" form={formRef}>
            <FormItem
                name={'name'}
                label={msg('name')}
                {...formItemLayout}
                rules={[
                    {
                        required: true,
                        message: msg('missing_name')
                    }
                ]}
            >
                <Input disabled={edit} />
            </FormItem>

            <FormItem
                name={'type'}
                label={msg('type')}
                {...formItemLayout}
                rules={[
                    {
                        required: true,
                        message: msg('missing_type')
                    }
                ]}
            >
                <Select onChange={onChange}>
                    <Option value="BOOLEAN">BOOLEAN</Option>
                    <Option value="FLOAT">FLOAT</Option>
                    <Option value="INTEGER">INTEGER</Option>
                    <Option value="JSON">JSON</Option>
                    <Option value="STRING">STRING</Option>
                </Select>
            </FormItem>

            <FormItem shouldUpdate={(prevValues, curValues) => prevValues.type !== curValues.type}>
                {({ getFieldValue }) => {
                    switch (getFieldValue('type')) {
                        case 'INTEGER':
                            return (
                                <FormItem
                                    name={'value'}
                                    label={msg('value')}
                                    {...formItemLayout}
                                    rules={[
                                        {
                                            required: true,
                                            message: msg('missing_value')
                                        },
                                        {
                                            msg,
                                            type: 'integer',
                                            validator: (...args) => typeValidator(...args)
                                        }
                                    ]}
                                >
                                    <InputNumber />
                                </FormItem>
                            );
                        case 'FLOAT':
                            return (
                                <FormItem
                                    name={'value'}
                                    label={msg('value')}
                                    {...formItemLayout}
                                    rules={[
                                        {
                                            required: true,
                                            message: msg('missing_value')
                                        },
                                        {
                                            msg,
                                            type: 'float',
                                            validator: (...args) => typeValidator(...args)
                                        }
                                    ]}
                                >
                                    <InputNumber />
                                </FormItem>
                            );
                        case 'BOOLEAN': {
                            return (
                                <FormItem
                                    name={'value'}
                                    label={msg('value')}
                                    valuePropName="checked"
                                    {...formItemLayout}
                                    rules={[
                                        {
                                            required: true,
                                            message: msg('missing_value')
                                        },
                                        {
                                            msg,
                                            type: 'boolean',
                                            validator: (...args) => typeValidator(...args)
                                        }
                                    ]}
                                >
                                    <Switch />
                                </FormItem>
                            );
                        }
                        case 'STRING':
                            return (
                                <FormItem
                                    name={'value'}
                                    label={msg('value')}
                                    {...formItemLayout}
                                    rules={[
                                        {
                                            required: true,
                                            message: msg('missing_value')
                                        },
                                        {
                                            msg,
                                            type: 'string',
                                            validator: (...args) => typeValidator(...args)
                                        }
                                    ]}
                                >
                                    <Input />
                                </FormItem>
                            );
                        case 'JSON':
                            return (
                                <FormItem
                                    name={'value'}
                                    label={msg('value')}
                                    {...formItemLayout}
                                    rules={[
                                        {
                                            required: true,
                                            message: msg('missing_value')
                                        },
                                        {
                                            msg,
                                            type: 'string',
                                            validator: (...args) => JSONValidator(...args)
                                        }
                                    ]}
                                >
                                    <JSONEditorView form={formRef} />
                                </FormItem>
                            );
                        default:
                            return null;
                    }
                }}
            </FormItem>
        </Form>
    );
};
