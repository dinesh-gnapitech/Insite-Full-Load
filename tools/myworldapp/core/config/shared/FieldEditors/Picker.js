import React, { Component } from 'react';
import { Modal, Button, Input } from 'antd';
import { PickerItems, utils } from '../../shared';
import { observer } from 'mobx-react';
import { EditOutlined } from '@ant-design/icons';

@observer
/**
 * Class that creates an input field with a button which when clicked opens a modal with pickable options.
 * The options are created by PickerItems
 */
export class Picker extends Component {
    constructor(props) {
        super(props);
        this.state = {
            value: props.value || '',
            pickerVisible: false,
            width: this.props.id == 'type' ? 300 : 500
        };
    }

    showTypePickerModal = e => {
        if (this.props.disabled) return;
        this.currentValue = null;
        this.setState({
            pickerVisible: true
        });
    };

    handleOk = () => {
        const value = this.currentValue || this.props.value;
        this.setState({
            value,
            pickerVisible: false
        });
        this.props.onChange(value);
    };

    /**
     * Sets state back to original value, closes modal
     * @param {event} e
     */
    handleCancel = () => {
        this.setState({
            value: this.props.value,
            pickerVisible: false
        });
    };

    render() {
        return (
            <>
                <Input
                    addonAfter={<EditOutlined onClick={this.showTypePickerModal} />}
                    value={this.props.value}
                    onChange={this.props.onChange}
                    style={{ verticalAlign: '-11px' }}
                    disabled={this.props.disabled}
                    onMouseDown={e => e.target.focus()}
                />

                <Modal
                    width={this.state.width}
                    className={'type-picker-modal ' + (this.props.className || '')}
                    title={this.props.msg('choose_field', {
                        type: utils.capitalise(this.props.id)
                    })}
                    open={this.state.pickerVisible}
                    onCancel={this.handleCancel}
                    footer={[
                        <Button key="ok" type="primary" onClick={this.handleOk}>
                            {this.props.msg('ok_btn')}
                        </Button>,
                        <Button key="back" onClick={this.handleCancel}>
                            {this.props.msg('cancel_btn')}
                        </Button>
                    ]}
                >
                    <PickerItems
                        value={this.state.value || this.props.value}
                        onSelect={this.selectItem}
                        onChange={this.updateVal}
                        items={this.props.items}
                        id={this.props.id}
                    ></PickerItems>
                </Modal>
            </>
        );
    }

    selectItem = value => {
        this.updateVal(value);
        this.setState({ value });
    };

    updateVal = value => {
        this.currentValue = value;
    };
}
