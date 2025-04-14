import React, { useEffect, useState } from 'react';
import { Form, InputNumber, Input, Checkbox } from 'antd';
import { ColourAndTransparencyPicker } from '../FieldEditors';
import { colorNameToHex } from 'myWorld/styles/styleUtils';
import { Radio, Select, Row, Col } from 'antd';
import { useLocale, useStore } from '../Hooks';

const FormItem = Form.Item;
const Option = Select.Option;

/**
 * Renders a form to configure the style options for a label
 * @param {Object} props
 */
const LabelStyleForm = function LabelStyleForm({
    additionalOptions,
    featureName,
    featureFieldName,
    data,
    onChange
}) {
    const msg = useLocale('StylePicker');
    const { ddStore } = useStore();
    const [orientationProp, setOrientationProp] = useState();
    const [labelStyle, setLabelStyle] = useState({
        size: 12,
        vAlign: 'top',
        hAlign: 'center',
        rotate: !!data?.orientationProp,
        ...data,
        backgroundColor: colorNameToHex(data.backgroundColor),
        color: colorNameToHex(data.color)
    });

    const {
        hAlign,
        vAlign,
        rotate,
        hOffset,
        vOffset,
        size,
        textProp,
        color,
        backgroundColor,
        borderWidth,
        minVis,
        maxVis
    } = labelStyle;
    const formItemLayout = {
        labelCol: { span: 10 },
        wrapperCol: { span: 14 }
    };
    const enableRotation = !!orientationProp;

    const getOptionsForZoomLevel = () => {
        const maxZoomLevel =
            parseInt(additionalOptions?.visibilityInformation.featureMaxVis) ||
            parseInt(additionalOptions?.visibilityInformation.layerMaxVis);
        const minZoomLevel =
            parseInt(additionalOptions?.visibilityInformation.featureMinVis) ||
            parseInt(additionalOptions?.visibilityInformation.layerMinVis);

        const arr = Array(maxZoomLevel - minZoomLevel + 1)
            .fill()
            .map((_, idx) => minZoomLevel + idx);

        return arr.map(index => {
            return (
                <Option key={index} value={index}>
                    {index}
                </Option>
            );
        });
    };

    const getOrientationProp = async () => {
        //  Do in a try/catch just in case request fails
        let latestOrientationProp = false;
        try {
            //  This is currently only used in the myWorld vector rendering, so we can safely assume the datasource is myworld
            //  Also make sure that the feature isn't already cached before making a request
            const featureDD =
                ddStore.store['myworld']?.[featureName] ??
                (await ddStore.get('myworld', featureName));
            if (featureDD.geometry_type === 'point') {
                const orientation_field = `myw_orientation_${featureFieldName}`;
                const orientationRow = featureDD.fields.find(
                    field => field.name === orientation_field
                );
                latestOrientationProp = orientationRow?.name ?? false;
            }
        } finally {
            setOrientationProp(latestOrientationProp);
        }
    };

    const handleChangeOfRadio = (name, e) => {
        handleChangeOf(name, e.target.value);
    };

    const handleChangeOf = (name, e) => {
        const obj = {};
        obj[name] = e;
        handleChangeOfValue(obj);
    };

    const handleChangeOfValue = obj => {
        const newStyle = {
            ...labelStyle,
            ...obj
        };
        setLabelStyle(newStyle);
        onChange(newStyle);
    };

    const handleChangeOfRotate = e => {
        handleChangeOfValue({
            rotate: e.target.checked,
            orientationProp: e.target.checked ? orientationProp : null
        });
    };

    useEffect(() => {
        getOrientationProp();
    }, []);

    return (
        <Form layout="horizontal" className={'label-picker-form'}>
            <FormItem label={msg('attribute_name')} {...formItemLayout}>
                <Input
                    style={{ width: 200, marginRight: 6 }}
                    min={0}
                    value={textProp}
                    onChange={e => handleChangeOf('textProp', e.target.value)}
                ></Input>
            </FormItem>
            <FormItem label={msg('colour')} {...formItemLayout}>
                <ColourAndTransparencyPicker
                    color={color}
                    disableAlpha={true}
                    onChange={colorAndOpacity => handleChangeOf('color', colorAndOpacity.color)}
                />
            </FormItem>
            <FormItem label={msg('text_size')} {...formItemLayout}>
                <Row gutter={30}>
                    {
                        <>
                            <Col span={8}>
                                <InputNumber
                                    style={{ width: 50, marginRight: 6 }}
                                    min={0}
                                    value={size}
                                    onChange={handleChangeOf.bind(this, 'size')}
                                />
                            </Col>
                            <Col span={8}>
                                <Radio.Group
                                    value={labelStyle.sizeUnit}
                                    onChange={handleChangeOfRadio.bind(this, 'sizeUnit')}
                                >
                                    <Radio value="px">{msg('pixels')}</Radio>
                                    <Radio value="m">{msg('meters')}</Radio>
                                </Radio.Group>
                            </Col>
                        </>
                    }
                </Row>
            </FormItem>
            <FormItem label={msg('background_colour')} {...formItemLayout}>
                <ColourAndTransparencyPicker
                    color={backgroundColor}
                    disableAlpha={true}
                    onChange={colorAndOpactity =>
                        handleChangeOf('backgroundColor', colorAndOpactity.color)
                    }
                />
            </FormItem>
            <FormItem label={msg('outline_width')} {...formItemLayout}>
                <InputNumber
                    style={{ width: 50, marginRight: 6 }}
                    min={-1000}
                    value={parseInt(borderWidth) || ''}
                    onChange={handleChangeOf.bind(this, 'borderWidth')}
                />
                {msg('pixels')}
            </FormItem>
            <FormItem label={msg('vertical_just')} {...formItemLayout}>
                <Select
                    style={{ width: 100, marginRight: 6 }}
                    value={vAlign}
                    onChange={handleChangeOf.bind(this, 'vAlign')}
                >
                    <Option value="top">{msg('top')}</Option>
                    <Option value="middle">{msg('middle')}</Option>
                    <Option value="bottom">{msg('bottom')}</Option>
                </Select>
                {msg('offset')}
                <InputNumber
                    style={{ width: 50, margin: 6 }}
                    min={-1000}
                    value={vOffset}
                    onChange={handleChangeOf.bind(this, 'vOffset')}
                />
            </FormItem>
            <FormItem label={msg('horizontal_just')} {...formItemLayout}>
                <Select
                    style={{ width: 100, marginRight: 6 }}
                    value={hAlign}
                    onChange={handleChangeOf.bind(this, 'hAlign')}
                >
                    <Option value="left">{msg('left')}</Option>
                    <Option value="center">{msg('centre')}</Option>
                    <Option value="right">{msg('right')}</Option>
                </Select>
                {msg('offset')}
                <InputNumber
                    style={{ width: 50, margin: 6 }}
                    min={-1000}
                    value={hOffset}
                    onChange={handleChangeOf.bind(this, 'hOffset')}
                />
            </FormItem>

            {enableRotation ? (
                <FormItem label={msg('rotate')} {...formItemLayout}>
                    <Checkbox checked={rotate} onChange={handleChangeOfRotate.bind(this)} />
                </FormItem>
            ) : null}

            <FormItem label={msg('zoom_level')} {...formItemLayout}>
                {msg('min')}
                <Select
                    style={{ width: 60, margin: 6 }}
                    min={0}
                    value={minVis ?? ''}
                    onChange={handleChangeOf.bind(this, 'minVis')}
                >
                    <Option key={''} value={''}>
                        {''}
                    </Option>
                    {getOptionsForZoomLevel()}
                </Select>
                {msg('max')}
                <Select
                    style={{ width: 60, margin: 6 }}
                    min={0}
                    value={maxVis ?? ''}
                    onChange={handleChangeOf.bind(this, 'maxVis')}
                >
                    <Option key={''} value={''}>
                        {''}
                    </Option>
                    {getOptionsForZoomLevel()}
                </Select>
            </FormItem>
        </Form>
    );
};

export default LabelStyleForm;
