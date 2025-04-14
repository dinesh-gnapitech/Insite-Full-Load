import React, { Component } from 'react';
import { Form, Input, InputNumber, Row, Radio, Col } from 'antd';
import { localise } from '../../shared';

const FormItem = Form.Item;

@localise('StylePicker')
export default class PointImageForm extends Component {
    /**
     * Allows input of url and anchor for a point style
     * @param {Object} props
     */
    constructor(props) {
        super(props);
        this.state = {
            iconUrl: props.iconUrl,
            anchorX: props.anchorX,
            anchorY: props.anchorY,
            size: props.size,
            sizeUnit: props.sizeUnit
        };
    }

    render() {
        const { msg } = this.props;
        return (
            <div>
                <FormItem
                    label={msg('location')}
                    {...this.props.formItemLayout}
                    validateStatus={this.state.imageValidStatus}
                    help={msg('invalid_location')}
                >
                    <Input
                        style={{ width: 220 }}
                        value={this.state.iconUrl}
                        onChange={e => this.handleChangeOf('iconUrl', e)}
                    />
                </FormItem>
                <FormItem label={msg('anchor')} {...this.props.formItemLayout}>
                    {
                        <>
                            X{' '}
                            <InputNumber
                                style={{ width: 50, marginLeft: 5, marginRight: 10 }}
                                value={this.state.anchorX}
                                onChange={e => this.handleChangeOf('anchorX', e)}
                            />{' '}
                            Y
                            <InputNumber
                                style={{ width: 50, marginLeft: 5 }}
                                value={this.state.anchorY}
                                onChange={e => this.handleChangeOf('anchorY', e)}
                            />
                        </>
                    }
                </FormItem>
                <FormItem label={msg('size')} {...this.props.formItemLayout}>
                    <Row gutter={30}>
                        {
                            <>
                                <Col span={8}>
                                    <InputNumber
                                        style={{ width: 50, marginRight: 6 }}
                                        min={0}
                                        value={this.state.size}
                                        onChange={e => this.handleChangeOf('size', e)}
                                    />
                                </Col>
                                <Col span={8}>
                                    <Radio.Group
                                        value={this.state.sizeUnit}
                                        onChange={e => this.handleChangeOf('sizeUnit', e)}
                                    >
                                        <Radio value="px">{msg('pixels')}</Radio>
                                        <Radio value="m">{msg('meters')}</Radio>
                                    </Radio.Group>
                                </Col>
                            </>
                        }
                    </Row>
                </FormItem>
            </div>
        );
    }

    handleChangeOf = (name, e) => {
        const val = typeof e === 'object' ? e.target.value : e;
        if (name === 'iconUrl') this.setupIconUrlValidation(val);

        this.props.handleChangeOf(name, val);
        this.setState({ [name]: val });
    };

    setupIconUrlValidation(url) {
        const imgLoader = new Image();
        imgLoader.src = url;

        imgLoader.onload = () => {
            this.setState({ imageValidStatus: 'success' });
            this.props.setValidState(true);
        };
        imgLoader.onerror = () => {
            this.setState({ imageValidStatus: 'error' });
            this.props.setValidState(false);
        };
    }
}
