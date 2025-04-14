import React, { Component } from 'react';
import { localise, EditableTable } from '../../../shared';
import { inject, observer } from 'mobx-react';
import { StyleModal } from './StyleModal';
import { createStylePreviewFor } from '../../../shared/StylePicker/StylePickerUtils';

@inject('store')
@localise('settings')
@observer
export class StylesView extends Component {
    state = {
        stylePickerVisible: false,
        currentType: 'point',
        currentData: {}
    };

    render() {
        const { store } = this.props;

        const datasource = [
            {
                seq: '1',
                name: 'point',
                normal: {
                    settingName: 'core.defaultMarkerStyleNormal',
                    settingVal: store.settingsStore.getConverted('core.defaultMarkerStyleNormal')
                },
                highlight: {
                    settingName: 'core.defaultMarkerStyleHighlight',
                    settingVal: store.settingsStore.getConverted('core.defaultMarkerStyleHighlight')
                }
            },
            {
                seq: '2',
                name: 'linestring',
                normal: {
                    settingName: 'core.defaultPolylineStyleNormal',
                    settingVal: store.settingsStore.getConverted('core.defaultPolylineStyleNormal')
                },
                highlight: {
                    settingName: 'core.defaultPolylineStyleHighlight',
                    settingVal: store.settingsStore.getConverted(
                        'core.defaultPolylineStyleHighlight'
                    )
                }
            },
            {
                seq: '3',
                name: 'polygon',
                normal: {
                    settingName: 'core.defaultPolygonStyleNormal',
                    settingVal: store.settingsStore.getConverted('core.defaultPolygonStyleNormal')
                },
                highlight: {
                    settingName: 'core.defaultPolygonStyleHighlight',
                    settingVal: store.settingsStore.getConverted(
                        'core.defaultPolygonStyleHighlight'
                    )
                }
            }
        ];

        const cols = [
            {
                title: this.props.msg('geometry'),
                dataIndex: 'name'
            },
            {
                title: this.props.msg('normal'),
                dataIndex: 'normal',
                render: (data, item) => (
                    <span
                        className="flex"
                        onClick={this.openStyleDialog.bind(this, item.name, data)}
                    >
                        <span className="emulate-input">
                            {this._createStylePreviewFor(item.name, data.settingVal)}
                        </span>
                        <span className="emulate-input-addon icon-pencil polygon-style-edit" />
                    </span>
                )
            },
            {
                title: this.props.msg('highlight'),
                dataIndex: 'highlight',
                render: (data, item) => (
                    <span
                        className="flex"
                        onClick={this.openStyleDialog.bind(this, item.name, data)}
                    >
                        <span className="emulate-input">
                            {this._createStylePreviewFor(item.name, data.settingVal)}
                        </span>
                        <span className="emulate-input-addon icon-pencil polygon-style-edit" />
                    </span>
                )
            }
        ];

        const { stylePickerVisible, currentData, currentType } = this.state;

        return (
            <div className="">
                <EditableTable
                    style={{ width: 500, marginBottom: 10 }}
                    columns={cols}
                    dataSource={datasource}
                    rowKey="seq"
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    moveRow={this.moveRow}
                    onFieldsChange={this.updateItem}
                    size="small"
                />
                <StyleModal
                    visible={stylePickerVisible}
                    type={currentType}
                    title={`${currentData.settingName}_title`}
                    data={currentData}
                    onCancel={this.closeModal}
                    onOk={this.saveStyle}
                    key={currentData.settingName}
                />
            </div>
        );
    }

    // Updates polygon style data to match the stylePicker format
    _createStylePreviewFor(type, data) {
        let styleData = data;
        if (type === 'polygon') {
            styleData = {
                fill: {
                    color: data.fillColor,
                    opacity: data.fillOpacity
                },
                line: {
                    color: data.color,
                    opacit: data.opacity,
                    weight: data.weight
                }
            };
        }
        return createStylePreviewFor(type, styleData);
    }

    closeModal = () => {
        this.setState({ stylePickerVisible: false });
    };

    saveStyle = (name, style) => {
        this.closeModal();
        this.props.store.settingsStore.setValue(name, style);
        this.props.onChange(name);
    };

    openStyleDialog(type, data) {
        this.setState({
            stylePickerVisible: true,
            currentData: data,
            currentType: type
        });
    }
}
