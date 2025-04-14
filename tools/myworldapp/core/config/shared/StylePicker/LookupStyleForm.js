import React, { Component } from 'react';
import { Form, Select } from 'antd';
import { localise, GeomStyleSelect } from '..';
import LookupList from './LookupList';
import { inject, observer } from 'mobx-react';
import { Style } from 'myWorld/styles/styles';

const FormItem = Form.Item;
const Option = Select.Option;

@localise('StylePicker')
@inject('store')
@observer
export default class LookupStyleForm extends Component {
    constructor(props) {
        super(props);
        let data = {};
        const dataObj = {
            lookupProp: null,
            pickList: null,
            lookup: {},
            defaultStyle: null
        };
        data = dataObj;
        this.state = {
            fields: [],
            selectedFieldType: null,
            allEnums: [],
            data
        };
    }

    async componentDidMount() {
        const fields = await this.props.getFields();
        const allEnums = await this.getAllEnums();
        this.setState({ fields, data: this.props.data, allEnums });
    }

    render() {
        const { additionalOptions, msg, geomType, data, store, featureName, featureFieldName } =
            this.props;
        let pickList,
            selectedField,
            lookup = {};
        const datasourceName = store.layerStore.current.datasource;
        const datasource = store.datasourceStore.store[datasourceName];

        if (geomType === 'polygon') {
            Object.entries(data.line.lookup).forEach(([key, line]) => {
                lookup[key] = { fill: data.fill.lookup[key], line };
            });
            pickList = data.line.pickList;
            selectedField = data.line.lookupProp;
        } else {
            pickList = data.pickList;
            selectedField = data.lookupProp;
            lookup = data.lookup;
        }

        const { fields, selectedFieldType, allEnums } = this.state;
        const formItemLayout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 10 }
        };
        let fieldSelectItem = null;
        let pickListField = null;
        let lookupList = null;
        const defaultStyle = this._getDefaultStyle(geomType, data);
        if (datasource.type == 'esri') {
            //  Styles when we use ESRI
            const featureTypes = store.layerStore.current.feature_types;
            const feature = featureTypes.find(featureType => featureType.name == featureName);
            const drawingInfo = feature.drawing_info;
            const renderer = drawingInfo.renderer;
            fieldSelectItem = renderer.field1;
            if (renderer.field2) fieldSelectItem += renderer.fieldDelimiter + renderer.field2;
            if (renderer.field3) fieldSelectItem += renderer.fieldDelimiter + renderer.field3;

            lookupList = (
                <LookupList
                    additionalOptions={additionalOptions}
                    key={fieldSelectItem}
                    getData={this.getESRIEnumVals.bind(this, renderer)}
                    geomType={geomType}
                    data={lookup}
                    defaultStyle={defaultStyle}
                    featureName={featureName}
                    featureFieldName={featureFieldName}
                    onChange={this.onPickListStyleChange}
                    convertStyleToColumnValues={this.convertStyleToColumnValues}
                ></LookupList>
            );
        } else {
            //  Styles when we use myWorld
            const fieldOptions = [];
            fields.forEach(field => {
                const name = field.name;
                if (field.enum) {
                    fieldOptions.push(
                        <Option key={name} value={name} enum={field.enum}>
                            {name}
                        </Option>
                    );
                } else if (field.value) {
                    fieldOptions.push(
                        <Option key={name} value={name}>
                            {name}
                        </Option>
                    );
                }
            });
            fieldSelectItem = (
                <Select defaultValue={selectedField} onChange={this.handleFieldChange}>
                    {fieldOptions}
                </Select>
            );

            const pick_list_val =
                selectedFieldType === 'calculated' ? (
                    <Select key={selectedField} onChange={this.handlePickListChange}>
                        {allEnums.map((item, index) => (
                            <Option key={index} value={item}>
                                {item}
                            </Option>
                        ))}
                    </Select>
                ) : (
                    pickList || ''
                );
            pickListField = (
                <FormItem label={msg('pick_list')} {...formItemLayout}>
                    {pick_list_val}
                </FormItem>
            );

            if (pickList)
                lookupList = (
                    <LookupList
                        additionalOptions={additionalOptions}
                        key={pickList}
                        getData={this.getMyWorldEnumVals.bind(this, pickList)}
                        geomType={geomType}
                        data={lookup}
                        defaultStyle={defaultStyle}
                        featureName={featureName}
                        featureFieldName={featureFieldName}
                        onChange={this.onPickListStyleChange}
                        convertStyleToColumnValues={this.convertStyleToColumnValues}
                    ></LookupList>
                );
        }

        const fieldValidation =
            this.props.isValid === false
                ? { validateStatus: 'error', help: msg('default_style_required') }
                : {};

        return (
            <Form layout="horizontal" className={'linestring-style-form'}>
                <FormItem label={msg('field')} {...formItemLayout}>
                    {fieldSelectItem}
                </FormItem>
                {pickListField}
                <FormItem
                    label={msg('default_style')}
                    required={true}
                    {...formItemLayout}
                    {...fieldValidation}
                >
                    <div style={{ padding: '5px 0' }}>
                        <GeomStyleSelect
                            additionalOptions={additionalOptions}
                            type={geomType}
                            value={defaultStyle}
                            savedFeatureTypes={this.state.savedFeatureTypes}
                            propName={'style'}
                            featureName={featureName}
                            featureFieldName={featureFieldName}
                            datasource={datasourceName}
                            onChange={this.onDefaultStyleChange(geomType, lookup)}
                        />
                    </div>
                </FormItem>
                <FormItem className={'align-top'} label={msg('values')} {...formItemLayout}>
                    {lookupList}
                </FormItem>
            </Form>
        );
    }

    _getDefaultStyle(geomType, data) {
        if (geomType === 'polygon')
            return { line: data.line.defaultStyle, fill: data.fill.defaultStyle };
        else return data.defaultStyle;
    }

    handleFieldChange = async (value, data) => {
        const pickList = data.enum || null;
        const lookupProp = value;
        const selectedFieldType = pickList ? 'stored' : 'calculated';

        if (this.props.geomType === 'polygon') {
            this.setState(
                prevState => ({
                    selectedFieldType,
                    data: {
                        line: {
                            ...prevState.data.line,
                            pickList,
                            lookupProp
                        },
                        fill: {
                            ...prevState.data.fill,
                            pickList,
                            lookupProp
                        }
                    }
                }),
                () => {
                    this.updateProps();
                }
            );
        } else {
            this.setState(
                prevState => ({
                    selectedFieldType,
                    data: { ...prevState.data, pickList, lookupProp }
                }),
                () => {
                    this.updateProps();
                }
            );
        }
    };

    handlePickListChange = async (value, data) => {
        const pickList = value;
        if (this.props.geomType === 'polygon') {
            this.setState(
                prevState => ({
                    data: {
                        line: { ...prevState.data.line, pickList },
                        fill: { ...prevState.data.fill, pickList }
                    }
                }),
                () => {
                    this.updateProps();
                }
            );
        } else {
            this.setState(
                prevState => ({
                    data: { ...prevState.data, pickList }
                }),
                () => {
                    this.updateProps();
                }
            );
        }
    };

    getMyWorldEnumVals = async enumKey => {
        const enumObj = await this.props.store.enumeratorStore.get(enumKey);
        let enumVals = [];
        enumObj.values.forEach(valObj => {
            enumVals.push(valObj.value);
        });
        return enumVals;
    };

    getESRIEnumVals = renderer => renderer.uniqueValueInfos.map(val => val.value);

    async getAllEnums() {
        await this.props.store.enumeratorStore.getAll();
        return Object.keys(this.props.store.enumeratorStore.store);
    }

    /**
     * Converts style object back into for expected by server
     * @param {Object} styleData
     */

    convertStyleToColumnValues = (type, styleData) => {
        if (type === 'polygon') {
            const line = Style.newFrom(styleData.line);
            const fill = styleData.fill && Style.newFrom(styleData.fill);
            return { line, fill };
        } else return Style.newFrom(styleData);
    };

    onDefaultStyleChange =
        (geomType, { name, field_name }) =>
        style => {
            const defaultStyle = this.convertStyleToColumnValues(geomType, style);
            if (this.props.geomType === 'polygon') {
                this.setState(
                    prevState => ({
                        data: {
                            line: { ...prevState.data.line, defaultStyle: defaultStyle.line },
                            fill: { ...prevState.data.fill, defaultStyle: defaultStyle.fill }
                        }
                    }),
                    () => {
                        this.updateProps();
                    }
                );
            } else {
                this.setState(
                    prevState => ({
                        data: { ...prevState.data, defaultStyle }
                    }),
                    () => {
                        this.updateProps();
                    }
                );
            }
        };

    onPickListStyleChange = lookup => {
        if (this.props.geomType === 'polygon') {
            let lineLookup = {},
                fillLookup = {};
            Object.entries(lookup).forEach(([key, style]) => {
                lineLookup[key] = style?.line;
                fillLookup[key] = style?.fill;
            });
            this.setState(
                prevState => ({
                    data: {
                        line: { ...prevState.data.line, lookup: lineLookup },
                        fill: { ...prevState.data.fill, lookup: fillLookup }
                    }
                }),
                () => {
                    this.updateProps();
                }
            );
        } else {
            this.setState(
                prevState => ({
                    data: { ...prevState.data, lookup: lookup }
                }),
                () => {
                    this.updateProps();
                }
            );
        }
    };

    updateProps() {
        const stateObj = { ...this.state.data };
        this.props.onChange(stateObj);
    }
}
