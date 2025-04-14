import React, { Component } from 'react';
import { Form, InputNumber } from 'antd';
import { localise } from '../../../shared';
import { ColourAndTransparencyPicker } from '../../../shared/FieldEditors';

const FormItem = Form.Item;

@localise('settings')
export class PolygonStyleForm extends Component {
    state = {
        outlineColorAndOpacity: { color: '#008000', opacity: 0.4 },
        fillColorAndOpacity: { color: '#008000', opacity: 0.25 },
        weight: 2
    };
    componentDidMount() {
        const { color, opacity, weight, fillColor, fillOpacity } = this.props.data;
        this.setState({
            outlineColorAndOpacity: { color, opacity },
            fillColorAndOpacity: { color: fillColor, opacity: fillOpacity },
            weight
        });
    }
    render() {
        const { data, msg } = this.props;
        const formItemLayout = {
            labelCol: { span: 14 },
            wrapperCol: { span: 10 }
        };
        return (
            <Form layout="horizontal">
                <FormItem label={msg('fill_colour_&_transparency')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={data.fillColor}
                        opacity={data.fillOpacity}
                        onChange={this.handleChangeOf.bind(this, 'fillColorAndOpacity')}
                    />
                </FormItem>
                <FormItem label={msg('outline_colour_&_transparency')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={data.color}
                        opacity={data.opacity}
                        onChange={this.handleChangeOf.bind(this, 'outlineColorAndOpacity')}
                    />
                </FormItem>
                <FormItem label={msg('outline_width')} {...formItemLayout}>
                    {
                        <>
                            <InputNumber
                                style={{ width: 50, marginRight: 6 }}
                                min={0}
                                value={this.state.weight}
                                onChange={this.handleChangeOf.bind(this, 'weight')}
                            />
                            {msg('pixels')}
                        </>
                    }
                </FormItem>
            </Form>
        );
    }

    handleChangeOf(name, val) {
        const stateObj = {};
        stateObj[name] = val;
        this.setState(stateObj, () => {
            const { outlineColorAndOpacity, fillColorAndOpacity, weight } = this.state;
            this.props.onChange({
                color: outlineColorAndOpacity.color,
                opacity: outlineColorAndOpacity.opacity,
                fillColor: fillColorAndOpacity.color,
                fillOpacity: fillColorAndOpacity.opacity,
                weight: weight
            });
        });
    }
}
