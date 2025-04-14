import React, { Component } from 'react';
import { Modal, Button, Select } from 'antd';
import { inject, observer } from 'mobx-react';
import { localise } from '../Localise';
import { TestDialogContent } from './TestDialogContent';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const Option = Select.Option;

@inject('store')
@localise('fieldEditor')
@observer
export class EnumAndTestView extends Component {
    constructor(props) {
        super(props);
        this.state = { value: '', enumValues: [] };
    }

    async handleClick() {
        const { msg } = this.props;
        const def = this.props.form.getFieldsValue();
        let dsDef = { ...this.props.store.datasourceStore.store[def.datasource] };
        const dsType = dsDef?.type;

        const modal = Modal.info({
            title: msg('test'),
            content: <div>{msg('testing')}</div>,
            width: 500
        });
        const testResult = await this.props.store.datasourceStore.runTest(
            { ...def, ...{ type: dsType, url: dsDef.spec.url } },
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
        const { value, args, msg, onChange, store } = this.props;
        const { enumerator, dsName } = args;

        const enumValues = store.datasourceStore.getEnumeratorValues(dsName, enumerator);
        if (!enumValues) return null;

        return (
            <>
                <Select
                    defaultValue={args.default}
                    value={value}
                    style={{ width: '80%', marginRight: 5 }}
                    onChange={value => onChange(value)}
                >
                    {enumValues.map(i => (
                        <Option key={i} value={i}>
                            {i}
                        </Option>
                    ))}
                </Select>
                <Button onClick={this.handleClick.bind(this)}>{msg('test')}</Button>
            </>
        );
    }
}
