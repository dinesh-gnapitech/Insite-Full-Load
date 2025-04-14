import React, { Component } from 'react';
import { Form, InputNumber } from 'antd';
import { localise } from '../../../shared';
import { ColourAndTransparencyPicker } from '../../../shared/FieldEditors';

const FormItem = Form.Item;

@localise('settings')
export class LinestringStyleForm extends Component {
    state = { colorAndOpacity: { color: '#008000', opacity: 0.4 }, weight: 2 };
    componentDidMount() {
        const { color, opacity, weight } = this.props.data;
        this.setState({
            colorAndOpacity: { color, opacity },
            weight
        });
    }
    render() {
        const { data, msg } = this.props;
        const { color, opacity } = data;
        const formItemLayout = {
            labelCol: { span: 14 },
            wrapperCol: { span: 10 }
        };
        return (
            <Form layout="horizontal">
                <FormItem label={msg('colour_&_transparency')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={color}
                        opacity={opacity}
                        onChange={this.handleChangeOf.bind(this, 'colorAndOpacity')}
                    />
                </FormItem>
                <FormItem label={msg('width')} {...formItemLayout}>
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
            const { colorAndOpacity, weight } = this.state;
            this.props.onChange({
                color: colorAndOpacity.color,
                opacity: colorAndOpacity.opacity,
                weight: weight
            });
        });
    }
}
