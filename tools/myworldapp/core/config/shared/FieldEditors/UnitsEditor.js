import React, { Component } from 'react';
import { Button, Input } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { KeyValueWithRadio } from './KeyValueWithRadio';
import { localise } from '../../shared/Localise';
import { EditableTable } from '../EditableTable';

/**
 * Class to display expandable table radio
 * Table expands into keyValueView with Radio Button
 */
@localise('fieldEditor')
@inject('store')
@observer
export class UnitsEditor extends Component {
    static getDerivedStateFromProps(props, state) {
        if (state.data.length != 0 && JSON.stringify(props.data) == JSON.stringify(state.data))
            return {};
        return {
            data: props.data
        };
    }

    constructor(props) {
        super(props);
        this.state = { data: [], expandedData: [] };

        this.columns = [
            {
                title: '',
                dataIndex: 'key',
                width: '35px',
                className: 'text-center',
                render: (text, item) => (
                    <div className="seq-cell">
                        <span className="test-no-print">{item.seq}</span>
                        <span
                            className="delete-row-btn-nested hidden"
                            onClick={() => this.removeItem(item)}
                        >
                            <DeleteOutlined />
                        </span>
                    </div>
                )
            },
            {
                title: this.props.msg('scale'),
                dataIndex: 'scale',
                getInput: record => (
                    <Input
                        className="key_input"
                        key={record.key}
                        onChange={e => this.handleChange(record.key, 'scale', e.target.value)}
                    />
                )
            }
        ];
    }

    /**
     * Handles change to input field in table
     * Sets state and calls triggerChange
     * @param {int} id
     * @param {string} key
     * @param {string} value
     */
    handleChange(id, key, value) {
        let values = JSON.parse(JSON.stringify(this.state.data));
        values[id][key] = value;
        this.setState({ data: values });
        this.triggerChange(values);
    }

    /**
     * Renders expanded row which is the keyValueView with Radio buttons
     */
    expandedRowRender = record => {
        const { msg } = this.props;
        return (
            <KeyValueWithRadio
                value={record.units}
                args={{ keyTitle: msg('units'), valueTitle: msg('values') }}
                onChange={e => this.onFieldsChange(record.key, e)}
                data={this.state.data[record.key]}
                onRadioChange={this.onRadioChange}
                valueIsNumber={true}
                key={record.scale}
            ></KeyValueWithRadio>
        );
    };

    /**
     * Handles change of KeyValueView fields, sets data in store and in state
     * @param {int} key
     * @param {Object} data
     */
    onFieldsChange = (key, data) => {
        //Convert string to number
        Object.keys(data).forEach(k => (data[k] = Number(data[k]) || data[k]));
        const toSet = this.state.data;
        toSet[key].units = data;
        this.setState({ data: toSet });
        this.triggerChange(toSet);
    };

    /**
     * Handles radio button click, sets data in store and state
     */
    onRadioChange = data => {
        const wholeData = this.state.data;
        wholeData[data.key].base_unit = data.base_unit;
        this.setState({ data: wholeData });
        this.triggerChange(wholeData);
    };

    /**
     * Adds item to table, sets state and store
     */
    addItem() {
        let values = [...this.state.data];
        values.push({ key: values.length, scale: '', units: {} });
        this.setState({ data: values });
        this.triggerChange(values);
    }

    /**
     * Removes item from values object
     * @param {Object} item
     */
    removeItem(item) {
        let values = [...this.state.data];
        values = values.filter((val, i) => i !== item.key);
        values = this.addKeysToData(values); //resequence keys
        this.setState({ data: values });
        this.triggerChange(values);
    }

    /**
     * Resequence keys when a row is removed
     * @param {Object} data
     */
    addKeysToData(data) {
        data.forEach((row, i) => {
            row.key = i;
        });
        return data;
    }

    /**
     * Sets data in store
     * @param {Array} data
     */
    triggerChange(data) {
        this.props.onChange(data);
    }

    render() {
        const data = this.state.data;
        const { msg } = this.props;

        return (
            <div>
                <EditableTable
                    size="small"
                    className="myw-nested-table input-container editable-table"
                    columns={this.columns}
                    expandedRowRender={this.expandedRowRender}
                    dataSource={data}
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    rowKey={'key'}
                />
                <div className="controls-container" style={{ padding: 10 }}>
                    <Button
                        icon={<PlusOutlined />}
                        onClick={this.addItem.bind(this)}
                        title={msg('add_value_btn')}
                    >
                        {msg('add_value_btn')}
                    </Button>
                </div>
            </div>
        );
    }
}
