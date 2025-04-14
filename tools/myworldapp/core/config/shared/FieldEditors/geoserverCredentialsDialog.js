import React from 'react';
import { Button, Modal, Input, Select } from 'antd';
import {
    CONNECTION_METHODS,
    GeoserverImgRequest,
    GeoserverAuthDefaults
} from 'myWorld/layers/geoserverImgRequest';
import { localise } from '../Localise';
import { FormBuilder } from '../../shared';
import { KeyValueView } from './KeyValueView';
import Icon from 'antd/lib/icon';

// export const GeoserverCredentialsDialog = Form.create({ name: 'form_in_modal' })(
//  Only update when the new record is set and not the same as this one
//  Update
@localise('geoserverAuthOptions')
export class GeoserverCredentialsDialog extends React.Component {
    static getDerivedStateFromProps(props, state) {
        if (state && props.record && state.lastRecord !== props.record) {
            const auth = props.record.auth || GeoserverAuthDefaults;
            state.hasTested = false;
            state.url = props.record.value;
            setTimeout(() => {
                props.formRef?.current?.resetFields();
                props.formRef?.current?.setFieldsValue(auth);
            }, 1);
            return { lastRecord: props.record };
        } else return state;
    }

    constructor(props) {
        super(props);
        this.state = {
            lastRecord: null,
            buttonState: { disabled: false },
            isTesting: false,
            testIcon: '',
            url: '',
            testStatus: ''
        };

        this.onOkay = this.onOkay.bind(this);
        this.onCancel = this.onCancel.bind(this);
        this.onTestClick = this.onTestClick.bind(this);

        const { msg } = this.props;

        this.dialogOptions = [];
        //  Pre-construct the select options here for later
        for (let [key, value] of Object.entries(CONNECTION_METHODS)) {
            this.dialogOptions.push(
                <Select.Option key={key} value={value}>
                    {msg(value)}
                </Select.Option>
            );
        }
    }

    render() {
        const { msg, formRef, data } = this.props;
        const containerStyle = { position: 'relative' };
        const alignLeft = { position: 'absolute', top: '0', left: '0', margin: '0' };
        const formItemLayout = {
            labelCol: { span: 5 },
            wrapperCol: { span: 19 }
        };

        const fields = [
            {
                id: 'type',
                component: <Select disabled={this.state.isTesting}>{this.dialogOptions}</Select>
            },
            {
                id: 'username',
                component: <Input disabled={this.state.isTesting} />,
                shouldUpdate: true,
                shouldUpdatePropValue: { prop: 'type', value: CONNECTION_METHODS.BASIC }
            },
            {
                id: 'password',
                component: <Input disabled={this.state.isTesting} />,
                shouldUpdate: true,
                shouldUpdatePropValue: { prop: 'type', value: CONNECTION_METHODS.BASIC }
            },
            {
                id: 'header',
                component: (
                    <KeyValueView
                        args={{ keyTitle: msg('headerName'), valueTitle: msg('headerValue') }}
                    ></KeyValueView>
                ),
                shouldUpdate: true,
                shouldUpdatePropValue: { prop: 'type', value: CONNECTION_METHODS.HEADERS }
            }
        ];

        let appended = null;
        if (this.state.hasTested) {
            appended = (
                <div
                    style={{
                        borderTop: '1px solid rgb(232, 232, 232)',
                        margin: '10px -24px -24px',
                        padding: '10px 16px'
                    }}
                >
                    <div style={{ paddingBottom: 5 }}>
                        {msg('testing_url')}:
                        <samp style={{ marginLeft: '10px' }}>{this.state.url}</samp>
                    </div>
                    <div>
                        <Icon
                            type={this.state.testIcon}
                            style={{
                                marginRight: '8px',
                                color: this._getIconColour(),
                                fontSize: 18,
                                verticalAlign: '-4px'
                            }}
                        />
                        {this.state.testStatus}
                    </div>
                </div>
            );
        }

        return (
            <Modal
                open={this.state.lastRecord !== null}
                title={msg('authenticate')}
                closable={!this.state.isTesting}
                maskClosable={!this.state.isTesting}
                keyboard={!this.state.isTesting}
                width={600}
                onCancel={this.onCancel}
                destroyOnClose={true}
                footer={
                    <div style={containerStyle}>
                        <Button
                            key="ok"
                            type="primary"
                            {...this.state.buttonState}
                            onClick={this.onOkay}
                        >
                            {msg('ok_btn')}
                        </Button>
                        <Button key="cancel" {...this.state.buttonState} onClick={this.onCancel}>
                            {msg('cancel_btn')}
                        </Button>
                        <Button
                            key="test"
                            type="primary"
                            style={alignLeft}
                            onClick={this.onTestClick}
                        >
                            {msg('test')}
                        </Button>
                    </div>
                }
            >
                <FormBuilder
                    msg={msg}
                    form={formRef}
                    fields={fields}
                    formItemLayout={formItemLayout}
                    data={data}
                />
                {appended}
            </Modal>
        );
    }

    _getIconColour() {
        switch (this.state.testIcon) {
            case 'loading':
                return '#ffbf00';
            case 'check-circle':
                return '#00a854';
            case 'close-circle':
                return '#f04134';
        }
    }

    onOkay() {
        this.setState({ lastRecord: null });
        this.props.onOkay(this.props.formRef?.current?.getFieldsValue());
    }

    onCancel() {
        this.setState({ lastRecord: null });
        this.props.onCancel();
    }

    _setTesting(testing) {
        this.setState({
            isTesting: testing,
            hasTested: true,
            buttonState: { disabled: testing }
        });
    }

    async onTestClick() {
        const { msg } = this.props;
        this._setTesting(true);

        //  Check if the specified URL is empty. If it is, display an error here
        if (!this.props.record.value) {
            this.setState({
                testIcon: 'close-circle',
                testStatus: msg('test_failure', { errorMsg: msg('test_failure_no_url') })
            });
            this._setTesting(false);
            return;
        }

        this.setState({ testIcon: 'loading', testStatus: msg('testing') });
        try {
            const res = await GeoserverImgRequest(
                this.props.record.value,
                this.props.formRef?.current?.getFieldsValue()
            );
            if (res.status === 200) {
                this.setState({
                    testIcon: 'check-circle',
                    testStatus: msg('test_success')
                });
            } else {
                const errorMsg = `${res.status}:${res.statusText}`;
                this.setState({
                    testIcon: 'close-circle',
                    testStatus: msg('test_failure', { errorMsg })
                });
            }
        } catch (error) {
            const errorMsg = error.message;
            this.setState({
                testIcon: 'close-circle',
                testStatus: msg('test_failure', { errorMsg })
            });
        } finally {
            this._setTesting(false);
        }
    }
}
