import React, { Component } from 'react';
import { Modal, Button } from 'antd';
import { inject, observer } from 'mobx-react';
import { localise } from '../../../shared';
import { PointStyleForm } from './PointStyleForm';
import { LinestringStyleForm } from './LinestringStyleForm';
import { PolygonStyleForm } from './PolygonStyleForm';

@inject('store')
@localise('settings')
@observer
export class StyleModal extends Component {
    state = {
        visible: true
    };

    componentDidMount() {
        this.setState({
            style: this.props.data.settingVal
        });
    }

    handleOk = () => {
        this.setState({ loading: true });
        this.props.onOk(this.props.data.settingName, this.state.style);
        setTimeout(() => {
            this.setState({ loading: false, visible: false });
        }, 3000);
    };

    handleCancel = () => {
        this.props.onCancel();
    };

    saveFormRef = formRef => {
        this.formRef = formRef;
    };

    render() {
        const { visible, type, data, title, msg, onCancel } = this.props;

        let StyleForm = PointStyleForm;
        switch (type) {
            case 'linestring':
                StyleForm = LinestringStyleForm;
                break;
            case 'polygon':
                StyleForm = PolygonStyleForm;
                break;
        }
        return (
            <Modal
                width="420px"
                open={visible}
                title={msg(title)}
                onOk={this.handleOk}
                onCancel={onCancel}
                footer={[
                    <Button key="OK" type="primary" onClick={this.handleOk.bind(this, data)}>
                        {msg('ok_btn')}
                    </Button>,
                    <Button key="cancel" onClick={onCancel}>
                        {msg('cancel_btn')}
                    </Button>
                ]}
            >
                {
                    <StyleForm
                        wrappedComponentRef={this.saveFormRef}
                        data={data.settingVal}
                        onChange={this.onChange}
                        key={this.props.data.settingName}
                    />
                }
            </Modal>
        );
    }

    onChange = data => {
        this.setState({ style: data });
    };
}
