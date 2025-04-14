import React, { Component } from 'react';
import { localise, EditableTable, GeomStyleSelect } from '../../shared';
import { inject, observer } from 'mobx-react';

@inject('store')
@localise('StylePicker')
@observer
export default class LookupList extends Component {
    constructor(props) {
        super(props);
        this.state = {
            lookup: {}
        };
    }
    async componentDidMount() {
        const lookup = await this.props.getData();
        const data = this.props.data || {};
        let stateValues = {};
        lookup.forEach(val => {
            stateValues[val] = data[val];
        });

        this.setState({ lookup: stateValues });
    }
    /**
     * Renders an antd select that displays all the different line style options as svgs
     */
    render() {
        const { additionalOptions, defaultStyle, store, geomType, featureName, featureFieldName } =
            this.props;
        const { lookup } = this.state;

        const datasource = Object.entries(lookup).map(([key, style], index) => ({
            defaultStyle,
            featureFieldName,
            featureName,
            seq: index,
            style,
            value: key
        }));

        const cols = [
            {
                title: 'Value',
                dataIndex: 'value'
            },
            {
                title: 'Style',
                render: (data, item) => (
                    <GeomStyleSelect
                        additionalOptions={additionalOptions}
                        type={geomType}
                        value={data.style}
                        savedFeatureTypes={this.state.savedFeatureTypes}
                        propName={'style'}
                        featureName={data.featureName}
                        featureFieldName={data.featureFieldName}
                        datasource={store.layerStore.current.datasource}
                        defaultStyle={data.defaultStyle}
                        onChange={this.onStyleCellChange(geomType, data)}
                    />
                )
            }
        ];

        return (
            <div className="">
                <EditableTable
                    style={{ width: 350, marginBottom: 10, maxWidth: 'fit-content' }}
                    columns={cols}
                    dataSource={datasource}
                    rowKey="value"
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    moveRow={this.moveRow}
                    onFieldsChange={this.updateItem}
                    size="small"
                />
            </div>
        );
    }

    onStyleCellChange = (geomType, data) => style => {
        const value = this.props.convertStyleToColumnValues(geomType, style);
        const enumVal = data.value;
        let newObj = {};
        switch (geomType) {
            case 'text':
            case 'point':
            case 'linestring':
                newObj[enumVal] = value;
                break;
            case 'polygon':
                newObj[enumVal] = { line: value.line, fill: value.fill };
                break;
        }
        this.setState(
            prevState => ({ lookup: { ...prevState.lookup, ...newObj } }),
            () => {
                this.props.onChange(this.state.lookup);
            }
        );
    };
}

//Use the data in the props to popllate the form
