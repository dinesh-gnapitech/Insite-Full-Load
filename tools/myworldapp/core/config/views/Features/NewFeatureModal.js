import React, { Component } from 'react';
import { Modal, Form, Input, Select, message, Button } from 'antd';
import { inject, observer } from 'mobx-react';
import { Validators, localise, ErrorMsg } from '../../shared';
import { FeatureForm } from './FeatureForm';

const { Option } = Select;
const FormItem = Form.Item;

@localise('features')
export class CreateFeatureForm extends Component {
    render() {
        const { visible, onCancel, onCreate, form, msg, onFinish } = this.props;
        const formItemLayout = {
            labelCol: { span: 8 },
            wrapperCol: { span: 10 }
        };
        return (
            <Modal
                width="420px"
                open={visible}
                title={msg('new_title')}
                onCancel={onCancel}
                footer={[
                    <Button key="create" type="primary" onClick={onCreate}>
                        {msg('create_btn')}
                    </Button>,
                    <Button key="cancel" onClick={onCancel}>
                        {msg('cancel_btn')}
                    </Button>
                ]}
            >
                <Form layout="horizontal" ref={form} onFinish={onFinish}>
                    <FormItem
                        name={'name'}
                        label={msg('name')}
                        {...formItemLayout}
                        rules={[
                            { required: true, message: msg('blank_internal_name') },
                            { validator: Validators.internalName, msg }
                        ]}
                    >
                        <Input style={{ width: 220 }} />
                    </FormItem>
                    <FormItem
                        name={'geometry_type'}
                        label={msg('geometry_type')}
                        {...formItemLayout}
                        initialValue="point"
                    >
                        <Select style={{ width: 220 }}>
                            <Option value="point">{msg('point')}</Option>
                            <Option value="linestring">{msg('linestring')}</Option>
                            <Option value="polygon">{msg('polygon')}</Option>
                            <Option value="">{msg('none')} </Option>
                        </Select>
                    </FormItem>
                </Form>
            </Modal>
        );
    }
}

@inject('store')
@localise('features')
@observer
export class NewFeatureModal extends Component {
    state = {
        visible: true
    };

    formRef = React.createRef(); //Creates a reference to the create feature form to be used in the handleCreate method

    showModal = () => {
        this.setState({ visible: true });
    };

    handleCancel = () => {
        this.setState({ visible: false });
        this.props.history.goBack();
    };

    /*
     * Adds an id field and a geom type field to the form data
     * @param {object} values Data from the form
     */
    _buildDataToSave(values) {
        const geomForType = {
            point: 'location',
            linestring: 'route',
            polygon: 'boundary'
        };
        const data = {};
        data.name = values.name;
        data.fields = [
            { name: 'id', external_name: '', generator: 'sequence', type: 'integer', key: true }
        ];
        const geomName = geomForType[values.geometry_type];
        if (geomName) {
            data.fields.push({
                name: geomName,
                external_name: '',
                type: values.geometry_type,
                mandatory: true
            });
        }
        return data;
    }

    handleCreate = () => {
        this.formRef.current.submit();
    };

    onFinish = values => {
        const { msg, edit, history, match } = this.props;
        const { dsname } = match.params;
        const data = this._buildDataToSave(values);
        this.props.store.ddStore
            .save(dsname, data)
            .then(name => {
                message.success(`${msg('created')}`);
                this.setState({ visible: false });
                history.push(`/features/${dsname}/${name}/edit`);
            })
            .catch(error => {
                message.error(ErrorMsg.getMsgFor(error, edit, msg));
            });
    };

    render() {
        if (this.props.store.ddStore.current.isDuplicate) {
            return <FeatureForm />;
        } else {
            return (
                <div>
                    <CreateFeatureForm
                        form={this.formRef}
                        msg={this.props.msg}
                        visible={this.state.visible}
                        onCancel={this.handleCancel}
                        onCreate={this.handleCreate}
                        onFinish={this.onFinish}
                    />
                </div>
            );
        }
    }
}
