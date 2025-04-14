import React, { Component } from 'react';
import { Form, Radio } from 'antd';
import { localise } from '../../shared';
import PointImageForm from './PointImageForm';
import PointSymbolForm from './PointSymbolForm';
import { colorNameToHex } from 'myWorld/styles/styleUtils';

@localise('StylePicker')
export class PointStyleForm extends Component {
    /**
     * Renders a choice of forms: one picks an icon from a url, the other other allows selection of a symbol
     * Default symbol is green circle 4px
     * Allows change of forms by using the radio buttons
     * @param {Object} props
     */
    static getDerivedStateFromProps(props, state) {
        const { iconUrl, anchor, size, sizeUnit, symbol } = props.data;
        return {
            iconUrl: iconUrl || state.iconUrl,
            anchorX: anchor?.[0] || state.anchorX,
            anchorY: anchor?.[1] || state.anchorY,
            size: size || state?.size,
            sizeUnit: sizeUnit || state?.sizeUnit,
            color: colorNameToHex(props.data.color),
            borderColor: colorNameToHex(props.data.borderColor),
            symbol: symbol,
            isSymbolPicker: state?.isSymbolPicker
        };
    }

    constructor(props) {
        super(props);
        this.state = {
            iconUrl: props.data.iconUrl || null,
            anchorX: props.data.anchorX || null,
            anchorY: props.data.anchorY || null,
            size: props.data.size || null,
            sizeUnit: props.data.sizeUnit || null,
            color: props.data.color || null,
            borderColor: props.data.borderColor || null,
            symbol: props.data.symbol || null,
            isSymbolPicker: !props.data.iconUrl
        };
    }

    render() {
        const { color, borderColor, size, symbol, isSymbolPicker, sizeUnit } = this.state;
        const { msg } = this.props;
        const formItemLayout = {
            labelCol: { span: 8 },
            wrapperCol: { span: 14 }
        };

        const FormObject = isSymbolPicker ? (
            <PointSymbolForm
                formItemLayout={formItemLayout}
                msg={msg}
                handleChangeOf={this.handleChangeOf}
                color={color}
                borderColor={borderColor}
                size={size}
                symbol={symbol}
                sizeUnit={sizeUnit}
            ></PointSymbolForm>
        ) : (
            <PointImageForm
                formItemLayout={formItemLayout}
                msg={msg}
                handleChangeOf={this.handleChangeOf}
                iconUrl={this.state.iconUrl}
                anchorX={this.state.anchorX}
                anchorY={this.state.anchorY}
                size={this.state.size}
                sizeUnit={this.state.sizeUnit}
                setValidState={this.props.setValidState}
            ></PointImageForm>
        );
        const radioVal = this.state.isSymbolPicker ? 'symbol' : 'image';
        return (
            <Form layout="horizontal" className={'point-style-form'}>
                <Radio.Group value={radioVal} onChange={this.handleRadioChange}>
                    <Radio value="symbol" style={{ marginBottom: '20px' }}>
                        {msg('symbol')}
                    </Radio>
                    <Radio value="image">{msg('image')}</Radio>
                    {FormObject}
                </Radio.Group>
            </Form>
        );
    }

    handleChangeOf = (name, val) => {
        const stateObj = { ...this.state };
        stateObj[name] = val;
        const color = stateObj.colorAndOpacity?.color || this.state.color;
        const borderColor = stateObj.borderColorAndOpacity?.color || this.state.borderColor;
        const { symbol, sizeUnit, size, isSymbolPicker, iconUrl, anchorX, anchorY } = stateObj;

        let toNotify = {};
        if (stateObj.isSymbolPicker)
            //ENH: Do we still need this? Could use the existance of symbol and iconUrl to detect
            toNotify = {
                symbol,
                sizeUnit,
                size,
                color,
                borderColor,
                isSymbolPicker,
                iconUrl: null
            };
        else
            toNotify = {
                iconUrl,
                anchorX,
                anchorY,
                size,
                sizeUnit,
                isSymbolPicker,
                symbol: null
            };
        this.setState(stateObj);

        this.props.onChange(toNotify);
    };

    handleRadioChange = e => {
        const val = e.target.value;
        this.handleChangeOf('isSymbolPicker', val !== 'image');
    };
}
