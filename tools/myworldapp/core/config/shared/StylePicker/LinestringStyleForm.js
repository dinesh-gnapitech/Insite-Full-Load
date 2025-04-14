import React, { Component } from 'react';
import { Form, InputNumber } from 'antd';
import { localise } from '..';
import { ColourAndTransparencyPicker } from '../FieldEditors';
import { colorNameToHex } from 'myWorld/styles/styleUtils';
import { Radio, Select, Row, Col } from 'antd';
import DashStyleSelect from './DashStyleSelect';
import arrowBeginImg from 'images/stylepicker/arrow-begin.svg';
import arrowEndImg from 'images/stylepicker/arrow-end.svg';
import solidImg from 'images/stylepicker/solid.svg';

const FormItem = Form.Item;
const Option = Select.Option;

@localise('StylePicker')
export default class LinestringStyleForm extends Component {
    /**
     * Renders a form for choosing the style of a linestring
     * @param {Object} props
     */
    static getDerivedStateFromProps(props, state) {
        const { color, opacity, width, widthUnit, lineStyle, startStyle, endStyle } = props.data;

        const data = {
            color,
            opacity,
            width,
            widthUnit,
            lineStyle,
            startStyle,
            endStyle
        };
        return { data };
    }

    constructor(props) {
        super(props);
        this.handleChangeOf = this.handleChangeOf.bind(this);
        this.state = {
            data: {
                color: null,
                opacity: null,
                width: null,
                widthUnit: null,
                lineStyle: null,
                startStyle: null,
                endStyle: null
            },
            msg: props.msg
        };
    }

    render() {
        const { data, msg } = this.state;
        const color = colorNameToHex(data.color);
        const formItemLayout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 10 }
        };
        return (
            <Form layout="horizontal" className={'linestring-style-form'}>
                <FormItem label={msg('dash_style')} {...formItemLayout}>
                    {
                        <DashStyleSelect
                            lineStyle={data.lineStyle}
                            handleChangeOf={this.handleChangeOf}
                        ></DashStyleSelect>
                    }
                </FormItem>
                <FormItem label={msg('colour')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={color}
                        opacity={data.opacity}
                        onChange={val => this.handleChangeOfColorAndOpacity('colorAndOpacity', val)}
                        disableAlpha={true}
                    />
                </FormItem>
                <FormItem label={msg('width')} {...formItemLayout}>
                    <Row gutter={30}>
                        <Col span={8}>
                            <InputNumber
                                style={{ width: 50, marginRight: 6 }}
                                min={0}
                                value={data.width}
                                onChange={val => this.handleChangeOf('width', val)}
                            />
                        </Col>
                        <Col span={8}>
                            <Radio.Group
                                value={data.widthUnit}
                                onChange={val => this.handleChangeOfRadio('widthUnit', val)}
                            >
                                <Radio value="px">{msg('pixels')}</Radio>
                                <Radio value="m">{msg('meters')}</Radio>
                            </Radio.Group>
                        </Col>
                    </Row>
                </FormItem>
                <FormItem label={msg('begin_style')} {...formItemLayout}>
                    {
                        <Select
                            value={data.startStyle}
                            style={{ width: 150 }}
                            onChange={val => this.handleChangeOf('startStyle', val)}
                            className={'dropdown-select-menu linestyle-picker'}
                        >
                            <Option className={'stylepicker-option'} value="">
                                <img width={'100px'} alt="View" src={solidImg} />
                            </Option>
                            <Option className={'stylepicker-option'} value="arrow">
                                <img
                                    width={'100px'}
                                    height={'12px'}
                                    alt="View"
                                    src={arrowBeginImg}
                                />
                            </Option>
                        </Select>
                    }
                </FormItem>
                <FormItem label={msg('end_style')} {...formItemLayout}>
                    {
                        <Select
                            value={data.endStyle}
                            style={{ width: 150 }}
                            onChange={val => this.handleChangeOf('endStyle', val)}
                            className={'dropdown-select-menu linestyle-picker'}
                        >
                            <Option className={'stylepicker-option'} value="">
                                <img width={'100px'} alt="View" src={solidImg} />
                            </Option>
                            <Option className={'stylepicker-option'} value="arrow">
                                <img width={'100px'} height={'12px'} alt="View" src={arrowEndImg} />
                            </Option>
                        </Select>
                    }
                </FormItem>
            </Form>
        );
    }

    handleChangeOfColorAndOpacity(name, val) {
        const { color, opacity } = val;
        const stateObj = { ...this.state.data };
        stateObj['color'] = color;
        stateObj['opacity'] = opacity;
        this.setState({ data: stateObj });
        this.props.onChange(stateObj);
    }

    handleChangeOfRadio(name, e) {
        this.handleChangeOf(name, e.target.value);
    }

    handleChangeOf = (name, val) => {
        const stateObj = { ...this.state.data };
        stateObj[name] = val;
        this.setState({ data: stateObj });
        this.props.onChange(stateObj);
    };
}
