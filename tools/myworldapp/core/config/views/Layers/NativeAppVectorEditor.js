import React, { Component } from 'react';
import { Input } from 'antd';
import { toJS } from 'mobx';
import { inject, observer } from 'mobx-react';
import { FormBuilder, localise } from '../../shared';
import { KeyValueView } from '../../shared/FieldEditors';

//Component for the Properties tab of the Layer editor
@inject('store')
@localise('layers')
@observer
export class NativeAppVectorEditor extends Component {
    constructor(props) {
        super(props);
    }

    onValuesChange = (changedValues, allValues) => {
        const spec = { ...this.props.store.current.spec };
        const data = spec['nativeAppVector'] ? toJS(spec['nativeAppVector']) : {};
        data['jsClass'] = allValues.spec_native_jsClass;
        data['extraOptions'] = allValues.spec_native_extraOptions;
        this.props.store.modifyCurrent({ spec: { ...spec, ...{ nativeAppVector: data } } });
    };

    render() {
        const { msg, form, store } = this.props; //form is an antd form that includes the data and api

        const layout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 18 }
        };
        //create field schema to pass to form builder
        let fields = [
            {
                id: 'spec_native_jsClass',
                help: msg('spec_native_jsClass_help'),
                component: <Input />,
                initialValue: store.current.spec.nativeAppVector
                    ? store.current.spec.nativeAppVector.jsClass
                    : ''
            },
            {
                id: 'spec_native_extraOptions',
                help: msg('spec_native_extraOptions_help'),
                component: (
                    <KeyValueView
                        args={{ keyTitle: msg('name'), valueTitle: msg('value'), valType: 'json' }}
                    />
                ),
                initialValue: store.current.spec.nativeAppVector
                    ? store.current.spec.nativeAppVector.extraOptions
                    : ''
            }
        ];

        return (
            <FormBuilder
                msg={msg}
                form={form}
                fields={fields}
                formItemLayout={layout}
                onValuesChange={this.onValuesChange}
            />
        );
    }
}
