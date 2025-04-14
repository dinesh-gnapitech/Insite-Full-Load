import React, { Component } from 'react';
import { Button, Input, Modal } from 'antd';
import { inject, observer } from 'mobx-react';
import { localise } from '../Localise';
import { TestDialogContent } from './TestDialogContent';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

@inject('store')
@localise('fieldEditor')
@observer
export class UrlInputAndTestView extends Component {
    async handleClick() {
        const { msg, id } = this.props;
        const def = this.props.form.getFieldsValue();

        const modal = Modal.info({
            title: msg('test'),
            content: <div>{msg('testing')}</div>,
            width: 500,
            maskClosable: true
        });
        const testResult = await this.props.store.datasourceStore.runTest(
            { ...def, ...{ url: def[id] } },
            this.props.args.testMethod,
            msg
        );

        if (testResult.success) {
            modal.update({
                content: <TestDialogContent msg={msg} success={true} testResult={testResult} />,
                icon: <CheckCircleOutlined />
            });
        } else {
            modal.update({
                content: <TestDialogContent msg={msg} success={false} testResult={testResult} />,
                icon: <CloseCircleOutlined />
            });
        }
    }

    render() {
        const { msg, value } = this.props;
        return (
            <>
                <Input
                    value={value}
                    style={{ width: '80%', marginRight: 5 }}
                    onChange={e => {
                        this.props.onChange(e.target.value.trim());
                    }}
                />
                <Button onClick={this.handleClick.bind(this)} disabled={!value?.length}>
                    {msg('test')}
                </Button>
            </>
        );
    }
}
