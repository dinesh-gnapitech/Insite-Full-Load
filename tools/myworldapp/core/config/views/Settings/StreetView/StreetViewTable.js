import React, { Component } from 'react';
import { Table, Input, InputNumber, Popover, Button, message, Card } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { FeatureTypeSelect, localise, onControlS, ErrorMsg } from '../../../shared';
import { SaveCancelButtons } from '../SaveCancelButtons';
import info32Img from 'images/info32.png';
import info32BrightImg from 'images/info32-bright.png';

const compareByAlph = (a, b) => {
    if (a > b) {
        return -1;
    }
    if (a < b) {
        return 1;
    }
    return 0;
};

@inject('store')
@localise('settings')
@observer
export class StreetViewTable extends Component {
    constructor(props) {
        super(props);

        this.state = { saving: false, height: window.innerHeight - 370 };

        message.config({
            maxCount: 1
        });
        this.updateTableDimensions = this.updateTableDimensions.bind(this);
    }

    componentDidMount() {
        this.onControlSSave = onControlS(this.handleSave.bind(this));
        document.addEventListener('keydown', this.onControlSSave);
        window.addEventListener('resize', this.updateTableDimensions);
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.onControlSSave);
        window.removeEventListener('resize', this.updateTableDimensions);
    }

    /**
     * Calculate & Update state of new dimensions
     */
    updateTableDimensions() {
        const update_height = window.innerHeight - 370;
        this.setState({ height: update_height });
    }

    onValueChange(featureType, propName, value) {
        const store = this.props.store.settingsStore;
        const data = store.getConverted('core.plugin.streetview');

        const next = { ...data };
        //handle type changes
        if (propName === 'type') {
            const clone = { ...next[featureType] };
            delete next[featureType];
            next[value] = clone;
            store.setValue('core.plugin.streetview', next);
            return;
        }

        next[featureType][propName] = value;
        store.setValue('core.plugin.streetview', next);
    }

    /**
     * Filters out the feature types that are already part fo the setting
     * Also filters out polygon features since we don't support polygon marker representations
     * on streetview at the moment
     */
    filterPolygonAndUsedFeatures = features => {
        const store = this.props.store.settingsStore;
        const usedFeatures = Object.keys(store.getConverted('core.plugin.streetview'));
        const polygonFeatures = features
            ?.filter(feature => feature.geometry_type === 'polygon')
            .map(f => f.name);
        return features?.filter(i => {
            return !usedFeatures.includes(i.name) && !polygonFeatures.includes(i.name);
        });
    };

    deleteRow(row) {
        const store = this.props.store.settingsStore;
        const data = store.getConverted('core.plugin.streetview');
        const next = { ...data };
        delete next[row.type];
        store.setValue('core.plugin.streetview', next);
    }

    columns = [
        {
            title: '',
            dataIndex: 'index',
            width: '60px',
            className: 'text-center',
            defaultSortOrder: 'ascend',
            render: (text, row) => (
                <div className="seq-cell">
                    {row.index + 1}
                    <span className="delete-row-btn hidden" onClick={() => this.deleteRow(row)}>
                        <DeleteOutlined />
                    </span>
                </div>
            )
        },
        {
            title: this.props.msg('feature_type'),
            dataIndex: 'type',
            key: 'type',
            width: 230,
            sorter: (a, b) => compareByAlph(a.type, b.type),
            render: (text, rec) => (
                <FeatureTypeSelect
                    value={text}
                    rec={rec}
                    onChange={this.onValueChange.bind(this, rec.type, 'type')}
                    filterItems={this.filterPolygonAndUsedFeatures}
                />
            )
        },
        {
            title: this.props.msg('orientation'),
            dataIndex: 'z-orientation',
            key: 'z-orientation',
            width: 100,
            sorter: (a, b) => a['z-orientation'] - b['z-orientation'],
            render: (v, rec) => (
                <InputNumber
                    className="myw-orientation"
                    defaultValue={v}
                    onChange={this.onValueChange.bind(this, rec.type, 'z-orientation')}
                />
            )
        },
        {
            title: this.props.msg('baseIcon'),
            dataIndex: 'iconUrl',
            key: 'iconUrl',
            render: (text, rec) =>
                iconInputWithPopover(rec, 'base', this.onValueChange.bind(this, rec.type, 'base'))
        },
        {
            title: this.props.msg('brightIcon'),
            dataIndex: 'brightUrl',
            key: 'brightUrl',
            render: (text, rec) =>
                iconInputWithPopover(
                    rec,
                    'bright',
                    this.onValueChange.bind(this, rec.type, 'bright')
                )
        }
    ];

    render() {
        const { msg } = this.props;
        const { saving } = this.state;
        const store = this.props.store.settingsStore;
        const data = store.getConverted('core.plugin.streetview');
        const tableData = Object.entries(data || {}).map(([type, value], index) => ({
            type,
            ...value,
            index
        }));

        return (
            <>
                <div className="myw-list-view" style={{ margin: '0px 0px 0px' }}>
                    <Card title={msg('streetview')} bordered={false}>
                        <Table
                            style={{ display: 'block' }}
                            className="input-container editable-table values-field-editor"
                            bordered
                            loading={store.isLoading}
                            rowKey="type"
                            columns={this.columns}
                            pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                            dataSource={tableData}
                            scroll={{ y: this.state.height }}
                        />
                        <Button
                            className="add-field-btn"
                            icon={<PlusOutlined />}
                            onClick={this.addStreetViewEntry.bind(this)}
                        >
                            {msg('add_value_btn')}
                        </Button>
                    </Card>
                </div>
                <SaveCancelButtons handleSave={() => this.handleSave()} saving={saving} />
            </>
        );
    }

    handleSave() {
        const { msg } = this.props;
        const store = this.props.store.settingsStore;
        this.setState({ saving: true });

        let svSetting = JSON.parse(store.store['core.plugin.streetview'].value);
        if (Object.prototype.hasOwnProperty.call(svSetting, '')) {
            delete svSetting[''];
            store.setValue('core.plugin.streetview', svSetting);
        }

        store
            .update('core.plugin.streetview', store.store['core.plugin.streetview'])
            .then(() => {
                message.success(msg('saved'));
                this.setState({ saving: false });
            })
            .catch(error => {
                message.error(ErrorMsg.getMsgFor(error, true, msg));
                this.setState({ saving: false });
            });
    }

    addStreetViewEntry() {
        const store = this.props.store.settingsStore;
        const data = store.getConverted('core.plugin.streetview');
        let next = { ...data };
        if (Object.prototype.hasOwnProperty.call(next, ''))
            message.error(this.props.msg('missing_feature_type'));
        else {
            next[''] = {
                base: { iconUrl: info32Img, iconAnchor: [16, 32] },
                bright: { iconUrl: info32BrightImg, iconAnchor: [16, 32] },
                'z-orientation': 0
            };
            store.setValue('core.plugin.streetview', next);
        }
    }
}

const iconInputWithPopover = (value, propName, onValueChange) => {
    const icon = value[propName];
    return (
        <Popover
            content={
                <div>
                    <div style={{ marginBottom: '10px' }}>
                        URL:{' '}
                        <Input
                            className="icon-URL-input"
                            value={icon.iconUrl}
                            style={{ width: 190, marginLeft: 4 }}
                            onChange={updateInputVal.bind(
                                this,
                                icon,
                                'url',
                                onValueChange.bind(this)
                            )}
                        />{' '}
                    </div>
                    <div>
                        Anchor: ({' '}
                        <Input
                            className="anchorX"
                            style={{ width: 50 }}
                            value={icon.iconAnchor[0]}
                            onChange={updateInputVal.bind(
                                this,
                                icon,
                                'anchorX',
                                onValueChange.bind(this)
                            )}
                        />{' '}
                        ,
                        <Input
                            className="anchorY"
                            style={{ width: 50, marginLeft: 4, marginRight: 3 }}
                            value={icon.iconAnchor[1]}
                            onChange={updateInputVal.bind(
                                this,
                                icon,
                                'anchorY',
                                onValueChange.bind(this)
                            )}
                        />
                        )
                    </div>
                </div>
            }
        >
            <Input
                className="icon-overall-input"
                type="text"
                value={`${icon.iconUrl} (${icon.iconAnchor[0]},${icon.iconAnchor[1]})`}
                onChange={handleDirectIconChange.bind(this)}
            />
        </Popover>
    );
};

const handleDirectIconChange = e => {
    //We dont want people updating the input field directly
    e.preventDefault();
};

const updateInputVal = (InputVal, type, onValueChange, e) => {
    if (type === 'url') InputVal.iconUrl = e.currentTarget.value;
    else if (type === 'anchorX') InputVal.iconAnchor[0] = e.currentTarget.value;
    else if (type === 'anchorY') InputVal.iconAnchor[1] = e.currentTarget.value;
    else InputVal = e.currentTarget.value;
    onValueChange(InputVal);
};
