import React, { Component } from 'react';
import { Modal, Button, Input } from 'antd';
import { inject, observer } from 'mobx-react';
import { localise } from '../Localise';
import { TestDialogContent } from './TestDialogContent';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

@inject('store')
@localise('fieldEditor')
@observer
export class StringWithTestView extends Component {
    /**
     * Field editor for KML layer relativeUrl
     * Tests if the relativeUrl is valid
     */
    constructor(props) {
        super(props);
        this.state = { value: '', enumValues: [] };
    }

    // Tests the datasource spec for the layer and displays the result to the user
    async runTest() {
        const { msg, form, store, args } = this.props;
        const def = form.getFieldsValue();
        const dsDef = { ...store.datasourceStore.store[def.datasource] };
        const dsType = dsDef?.type;

        const modal = Modal.info({
            title: msg('test'),
            content: <div>{msg('testing')}</div>,
            width: 500
        });

        const datasource = store.datasourceStore.createDS({
            ...def,
            ...dsDef,
            ...dsDef.spec,
            type: dsType
        });

        const url = datasource.getLayerURL({ ...this.unformatData(def), ...dsDef.spec });
        const specField =
            typeof args.testUrlField === 'undefined' ? 'relativeUrl' : args.testUrlField;
        let testResult = {};
        try {
            const response = await datasource.testLayerURL(
                specField ? def.spec[specField] : def.spec
            );
            testResult = { url: url, msg: response };
            modal.update({
                content: <TestDialogContent msg={msg} success={true} testResult={testResult} />,
                icon: <CheckCircleOutlined />
            });
        } catch (e) {
            testResult = { url: url, msg: e.message };
            modal.update({
                content: <TestDialogContent msg={msg} success={false} testResult={testResult} />,
                icon: <CloseCircleOutlined />
            });
        }
    }

    /*
     * Restructures the spec fields before sending them to the datasource class
     */
    unformatData(data) {
        data.spec = data.spec || {};
        return this.props.store.layerStore.unformatData(data);
    }

    render() {
        const { value, args, msg, onChange } = this.props;

        return (
            <>
                <Input
                    defaultValue={args.default}
                    value={value}
                    style={{ width: '80%', marginRight: 5 }}
                    onChange={value => onChange(value)}
                />
                <Button onClick={this.runTest.bind(this)}>{msg('test')}</Button>
            </>
        );
    }
}
