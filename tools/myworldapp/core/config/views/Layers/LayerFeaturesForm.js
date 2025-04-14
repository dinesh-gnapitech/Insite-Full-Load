import React, { Component } from 'react';
import { Select, Card, Button } from 'antd';
import { inject, observer } from 'mobx-react';
import memoize from 'memoize-one';
import { isEqual } from 'underscore';
import {
    localise,
    SearchInput,
    SortableTableBuilder,
    GeomStyleSelect,
    utils,
    FeatureName
} from '../../shared';
import { ZoomSelect } from './ZoomSelect';
import { datasourceTypes } from 'myWorld/datasources';
import { Style } from 'myWorld/styles/styles';
import { LookupStyle, PointStyle, LineStyle, FillStyle, TextStyle } from 'myWorld/styles/styles';
import gotoImg from 'images/goto.png';

//Component for the Features tab of the Layer editor
@inject('store')
@localise('layers')
@observer
export class LayerFeaturesForm extends Component {
    constructor(props) {
        super(props);
        const { store } = props;
        const { datasource, spec } = store.layerStore.current;

        this.state = {
            filter: '',
            height: 500,
            selected: null, //will be updated when layer info is obtained
            showNativeAppStyle:
                datasource === 'myworld' && ['vector', 'hybrid'].includes(spec.rendering),
            showLink: false
        };

        this.updateTableDimensions = this.updateTableDimensions.bind(this);
    }

    async componentDidMount() {
        const { store, dsDef } = this.props;
        const layer = store.layerStore.current;
        if (!layer || !layer.feature_types) return;
        const featureTypes = layer.feature_types.map(getKey);
        if (featureTypes.length && !this.state.selected) {
            //set initial selected state
            this.setState({
                selected: featureTypes,
                savedFeatureTypes: featureTypes
            });
        }
        if (dsDef?.name == 'myworld') {
            await store.myWorldStore.getLayerFeatureItems();
            this.setState({ fields: store.myWorldStore.fields });
        } else {
            const fields = await store.ddStore.getAvailableFields(dsDef.name);
            this.setState({ fields: fields });
        }

        const showLink = await store.permissionStore.userCurrentlyHasPermission('features');
        this.setState({ showLink });

        await store.myWorldStore.filters();

        this.updateTableDimensions();
        window.addEventListener('resize', this.updateTableDimensions);
    }

    /**
     * Remove event listener
     */
    componentWillUnmount() {
        window.removeEventListener('resize', this.updateTableDimensions);
    }

    async componentDidUpdate(nextProps) {
        if (nextProps.dsDef.name == this.props.dsDef.name) return;
        const { store, dsDef } = nextProps;

        if (dsDef?.name == 'myworld') {
            await store.myWorldStore.getLayerFeatureItems();
            this.setState({ fields: store.myWorldStore.fields });
        } else {
            const fields = await store.ddStore.getAvailableFields(dsDef.name);
            this.setState({ fields: fields });
        }
    }

    getFilteredFields() {
        const { dsDef, store } = this.props;

        if (!dsDef || !dsDef.name) return null;

        const Datasource = datasourceTypes[dsDef.type];
        const currentMap = store.layerStore.current;

        const filter = Datasource.geomFieldsFilter?.(currentMap);
        const fields = store.ddStore.filterAvailableFields(this.state.fields, filter);
        return fields;
    }

    getTableColumnsFor(datasource = 'myworld') {
        const { msg, store } = this.props;
        const { showLink } = this.state;

        //returns function that will save a given value in the store. to be used as onChange handler
        const setLfiProp = (data, propName) => value => {
            store.layerStore.setLfiProp(data.name, data.field_name, propName, value);
        };
        //returns a column definition for a zoom select control given a layerFeatureItem prop name
        const zoomSelectColumn = name => {
            return {
                title: msg(name),
                dataIndex: name,
                key: name,
                sorter: (a, b) => {
                    let nameA = a[name],
                        nameB = b[name];
                    if (!nameA) nameA = 0;
                    if (!nameB) nameB = 0;
                    if (nameA != null && nameB != null) {
                        return nameA > nameB ? 1 : nameA < nameB ? -1 : 0;
                    }
                },
                width: '130px',
                render: (text, data) =>
                    this.renderRow(data) ? (
                        <ZoomSelect
                            data={data}
                            propName={name}
                            onChange={setLfiProp(data, name)}
                            disabled={!data.field_name}
                        />
                    ) : null
            };
        };
        return [
            {
                title: msg('feature'),
                dataIndex: 'name',
                key: 'name',
                className: 'table-column-wrapping',
                width: '200px',
                render: (text, data) => (
                    <FeatureName
                        datasource={datasource}
                        text={text}
                        msg={msg}
                        showLink={showLink}
                    />
                )
            },
            {
                title: msg('field'),
                dataIndex: 'field_name',
                key: 'field_name',
                width: '200px'
            },
            zoomSelectColumn('min_vis'),
            zoomSelectColumn('max_vis'),

            zoomSelectColumn('min_select'),
            zoomSelectColumn('max_select'),
            {
                title: msg('filter'),
                dataIndex: 'filter',
                key: 'filter',
                width: '150px',
                className: 'text-center',
                sorter: (a, b) => {
                    let nameA = a.filter,
                        nameB = b.filter;
                    if (!nameA) nameA = '';
                    if (!nameB) nameB = '';
                    if (nameA != null && nameB != null) {
                        return nameA > nameB ? 1 : nameA < nameB ? -1 : 0;
                    }
                },
                render: (text, data) => {
                    const link = showLink ? (
                        <a
                            title={msg('view_filters')}
                            className="linkToEdit"
                            href={`./config.html#/features/myworld/${data.name}/edit?tab=filters`}
                        >
                            <img className={'hidden'} alt="View" src={gotoImg} />
                        </a>
                    ) : null;
                    //Only display link to feature for myw features
                    const mywFeature = Object.keys(store.myWorldStore.fields).find(
                        featureName => featureName == data.name
                    );
                    if (!this.renderRow(data) && mywFeature) return link;
                    const filters = store.myWorldStore.getFiltersFor(data.name);
                    if (!filters && mywFeature) return link;
                    else if (!filters) return null;

                    return (
                        <>
                            <Select
                                style={{ width: 'calc(100% - 22px)' }}
                                value={data.filter}
                                onChange={setLfiProp(data, 'filter')}
                                allowClear
                            >
                                {filters.map(filter => (
                                    <Select.Option key={filter.name} value={filter.name}>
                                        {filter.name}
                                    </Select.Option>
                                ))}
                            </Select>
                            {mywFeature ? link : null}
                        </>
                    );
                }
            }
        ];
    }

    getTableData = memoize((fields, lfis) => {
        //remove fields that are already present in the layer/feature relationship
        const unselectedFields = { ...fields };
        lfis.forEach(lfi => {
            if (unselectedFields[lfi.name]) {
                unselectedFields[lfi.name] = unselectedFields[lfi.name].filter(
                    f => f.internal_name != lfi.field_name || f.table_name != lfi.name
                );
            }
        });
        const allFields = Object.values(unselectedFields).flatMap(
            items => items.slice?.() ?? items
        );
        const geomFields = allFields.filter(f =>
            ['point', 'linestring', 'polygon', 'no geometry', 'raster'].includes(f.type)
        );
        const defaultLfis = geomFields.map(field => {
            const val = field.type == 'raster' ? 0 : null;
            return {
                name: field.table_name,
                field_name: field.internal_name,
                min_select: val,
                max_select: val,
                min_vis: val,
                max_vis: val,
                filter: ''
            };
        });

        return lfis.concat(defaultLfis);
    }, isEqual);

    renderRow(data) {
        return !!this.state.selected?.includes(getKey(data));
    }

    render() {
        const { msg, store, hideUnselected, dsDef } = this.props;
        const { selected, filter, showNativeAppStyle } = this.state;
        const { datasource, spec } = store.layerStore.current;

        let isEsriFeatureServer = false;
        if (dsDef.type === 'esri') {
            isEsriFeatureServer = dsDef.spec.esriServerType === 'FeatureServer';
        }

        const showNativeAppStyleBtn =
            (datasource !== 'myworld' ||
                (spec.nativeAppVector && !['vector', 'hybrid'].includes(spec.rendering))) &&
            !isEsriFeatureServer;
        //returns function that will save a given value in the store. to be used as onChange handler

        let columns = [...this.getTableColumnsFor(store.layerStore.current.datasource)];
        let preColumns = columns.slice(0, 4);
        let midColumns = [];
        let postColumns = columns.slice(4);

        let fields = this.getFilteredFields() || store.myWorldStore.fields;
        let tableWidth = 1060;
        if (isEsriFeatureServer) {
            tableWidth += 130;
            midColumns.push({
                title: msg('rendering_type'),
                dataIndex: 'renderingType',
                key: 'renderingType',
                width: '130px',
                className: 'myw-picker-column',
                render: (text, data) => {
                    const renderingType = spec.featureRendering?.[data.name];
                    return this.renderRow(data) ? (
                        <Select
                            style={{ width: '100%' }}
                            value={renderingType}
                            defaultValue={'esri'}
                            onChange={this.setFeatureRenderingType(data, 'renderingType')}
                        >
                            {['esri', 'myworld'].map(i => (
                                <Select.Option key={i} value={i}>
                                    {i}
                                </Select.Option>
                            ))}
                        </Select>
                    ) : null;
                }
            });
        }
        if (showNativeAppStyle || isEsriFeatureServer) {
            tableWidth += 170;
            midColumns.push({
                title: msg('style'),
                dataIndex: 'style',
                key: 'style',
                width: '170px',
                className: 'myw-picker-column',
                render: this.renderStyleCell(spec, fields, isEsriFeatureServer)
            });
        }
        if (showNativeAppStyle) {
            tableWidth += 170;
            midColumns.push({
                title: msg('label'),
                dataIndex: 'label',
                key: 'label',
                width: '170px',
                className: 'myw-picker-column',
                render: this.renderLabelCell(fields)
            });
        }
        columns = [...preColumns, ...midColumns, ...postColumns];

        const propertiesData = store.layerStore.current;
        const features = propertiesData.feature_types || [];
        let tableData = features.filter(feature => {
            if (hideUnselected) {
                return selected ? selected.includes(`${feature.name}/${feature.field_name}`) : true;
            } else return true;
        });

        if (fields && !hideUnselected) {
            //add all remaining geom fields with default props
            tableData = this.getTableData(fields, [...features.slice()]);
        }

        const totalCount = tableData.length;

        if (filter) {
            tableData = tableData.filter(e => {
                // enable filtering on geometryless features that have no field_name
                const matchesName = e.name.toLowerCase().includes(filter.toLowerCase());
                return e.field_name
                    ? matchesName || e.field_name.toLowerCase().includes(filter.toLowerCase())
                    : matchesName;
            });
        }
        let filterMsg = '';

        if (tableData.length == 1) {
            filterMsg = utils.getFilterMsg(msg, 'feature', tableData.length, totalCount);
        } else {
            filterMsg = utils.getFilterMsg(msg, 'features', tableData.length, totalCount);
        }

        const ToggleStylesBtn = showNativeAppStyleBtn ? (
            <Button
                type={showNativeAppStyle ? '' : 'primary'}
                onClick={this.toggleStylesCols.bind(this)}
            >
                {showNativeAppStyle ? msg('hide_native_app_styles') : msg('show_native_app_styles')}
            </Button>
        ) : null;

        const dataSource = tableData.sort((a, b) => {
            if (a.name < b.name) {
                return -1;
            }
            if (a.name > b.name) {
                return 1;
            }
            if (a.field_name < b.field_name) {
                return -1;
            }
            if (a.field_name > b.field_name) {
                return 1;
            }

            // names must be equal
            return 0;
        });

        return (
            <Card
                className="myw-layer-features-form myw-list-view"
                title={ToggleStylesBtn}
                bordered={false}
                extra={
                    <div style={{ margin: '-7px -9px' }}>
                        {<span style={{ display: 'inline-block' }}>{filterMsg}</span>}
                        <div style={{ display: 'inline-block', margin: '0 10px' }}>
                            <SearchInput
                                style={{ width: 258 }}
                                value={this.state.filter}
                                onChange={this.onFilterChange}
                                onClear={this.onFilterChange}
                            />
                        </div>
                    </div>
                }
            >
                <SortableTableBuilder
                    className="editable-table"
                    loading={this.state.isLoading}
                    columns={columns}
                    dataSource={dataSource}
                    rowKey={getKey}
                    scroll={{ x: tableWidth, y: this.state.height }}
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    rowSelection={{
                        selectedRowKeys: this.state.selected || features.map(getKey),
                        onSelect: async (record, selected, selectedRows) => {
                            const selectedFeatures =
                                await this.props.store.layerStore.updateFeatures(
                                    [record],
                                    selected,
                                    fields
                                );
                            this.setState({ selected: selectedFeatures.map(getKey) });
                        },
                        onSelectAll: async (selected, selectedRows, changeRows) => {
                            const selectedFeatures =
                                await this.props.store.layerStore.updateFeatures(
                                    selectedRows,
                                    selected,
                                    fields
                                );
                            this.setState({ selected: selectedFeatures.map(getKey) });
                        }
                    }}
                />
            </Card>
        );
    }

    renderStyleCell = (spec, fields, esriMode) => (text, data) => {
        if (!this.renderRow(data)) return null;
        const featureFields = fields?.[data.name];
        const field = featureFields?.find(f => f.internal_name == data.field_name);
        if (!field) return null;
        const geomType = field.type;

        const { point_style, line_style, fill_style } = data || {};
        const style = parseStyleForType(geomType, point_style, line_style, fill_style);
        const remote_spec = field.remote_spec ? JSON.parse(field.remote_spec) : {};
        const renderer = remote_spec.extras?.drawing_info?.renderer?.type;
        const showLookup = esriMode ? renderer == 'uniqueValue' : true;
        const renderingType = esriMode ? spec.featureRendering?.[data.name] || 'esri' : 'myworld';

        return renderingType === 'esri' ? null : (
            <GeomStyleSelect
                type={geomType}
                value={style}
                savedFeatureTypes={this.state.savedFeatureTypes}
                propName={'style'}
                featureName={data.name}
                featureFieldName={data.field_name}
                datasource={this.props.store.layerStore.current.datasource}
                showLookup={showLookup}
                onChange={this.onStyleCellChange(geomType, data)}
            />
        );
    };

    renderLabelCell = fields => (text, data) => {
        if (!this.renderRow(data)) return null;
        const featureFields = fields?.[data.name];
        const field = featureFields?.find(f => f.internal_name == data.field_name);
        if (!field) return null;

        const geomType = 'text';
        const { text_style } = data || {};
        const layer = this.props.store.layerStore.current;
        const style = parseStyleForType('text', '', '', '', text_style);
        style.visibilityInformation = {
            featureMinVis: data.min_vis,
            featureMaxVis: data.max_vis,
            layerMinVis: layer.min_scale,
            layerMaxVis: layer.max_scale
        };
        const additionalOptions = {
            visibilityInformation: {
                featureMinVis: data.min_vis,
                featureMaxVis: data.max_vis,
                layerMinVis: layer.min_scale,
                layerMaxVis: layer.max_scale
            }
        };

        return (
            <GeomStyleSelect
                additionalOptions={additionalOptions}
                type={geomType}
                value={style}
                savedFeatureTypes={this.state.savedFeatureTypes}
                propName={'style'}
                featureName={data.name}
                featureFieldName={data.field_name}
                datasource={layer.datasource}
                showLookup={true}
                onChange={this.onStyleCellChange(geomType, data)}
            />
        );
    };

    onStyleCellChange =
        (geomType, { name, field_name }) =>
        style => {
            const value = convertStyleToColumnValues(geomType, style);
            const store = this.props.store.layerStore;
            let styleToUpdate = [];
            switch (geomType) {
                case 'text':
                    styleToUpdate = ['text_style'];
                    break;
                case 'point':
                    styleToUpdate = ['point_style'];
                    break;
                case 'linestring':
                    styleToUpdate = ['line_style'];
                    break;
                case 'polygon':
                    styleToUpdate = ['line_style', 'fill_style'];
                    break;
            }
            styleToUpdate.forEach(styleType => {
                store.setLfiProp(name, field_name, styleType, value[styleType]);
            });
        };

    setFeatureRenderingType = (data, propName) => {
        const name = data.name;
        return value => {
            this.props.store.layerStore.setSpecValue(['featureRendering', name], value);
        };
    };

    /**
     * Calculate & Update state of new dimensions
     */
    updateTableDimensions() {
        const update_height = window.innerHeight - 340;
        this.setState({ height: update_height });
    }

    onFilterChange = value => {
        const filterVal = value ? value : '';
        this.setState({ filter: filterVal });
    };

    toggleStylesCols() {
        const layerStore = this.props.store.layerStore;
        if (!this.state.showNativeAppStyle) {
            layerStore.addStylesTo(
                this.getFilteredFields() || this.props.store.myWorldStore.fields
            );
        }
        this.setState((prevState, props) => ({
            showNativeAppStyle: !prevState.showNativeAppStyle
        }));
    }
}

const getKey = rec => `${rec.name}/${rec.field_name}`;

/**
 * Parse style string for type: linestring, polygon or point. Used by stylepicker in config pages
 * When a polygon is desired to be parsed it will have both a lineStyle and fillStyle string
 * @param {string} lineStyleStr
 * @param {string} fillStyleStr
 * @param {string} pointStyleStr
 * @param {string} textStyleStr
 * @param {string} type
 * @returns {Object} styleObject
 */
function parseStyleForType(
    type,
    pointStyleStr = '',
    lineStyleStr = '',
    fillStyleStr = '',
    textStyleStr = ''
) {
    if (type == 'point')
        return LookupStyle.parse(pointStyleStr, PointStyle) || PointStyle.parse(pointStyleStr);
    else if (type == 'linestring')
        return LookupStyle.parse(lineStyleStr, LineStyle) || LineStyle.parse(lineStyleStr);
    else if (type === 'text') {
        return LookupStyle.parse(textStyleStr, TextStyle) || TextStyle.parse(textStyleStr);
    } else {
        const line = LookupStyle.parse(lineStyleStr, LineStyle) || LineStyle.parse(lineStyleStr);
        const isLookup = line instanceof LookupStyle;
        return {
            isLookup,
            line,
            fill: LookupStyle.parse(fillStyleStr, FillStyle) || FillStyle.parse(fillStyleStr)
        };
    }
}

/**
 * Converts style object back into for expected by server
 * @param {Object} styleData
 */
function convertStyleToColumnValues(type, styleData) {
    if (type == 'polygon') {
        const line_style = Style.newFrom(styleData.line).defStr();
        const fill_style = styleData.fill && Style.newFrom(styleData.fill).defStr();
        return { line_style, fill_style };
    }
    let style = Style.newFrom(styleData);
    switch (type) {
        case 'point':
            return { point_style: style.defStr() };
        case 'linestring':
            return { line_style: style.defStr() };
        case 'text':
            return { text_style: style.defStr() };
    }
}
