import React, { Component } from 'react';
import { Input, Button, Radio, InputNumber } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { EditableTable } from '../../shared';
import { localise } from '../../shared/Localise';
import { MultiLanguageInput } from './MultiLanguageInput';

/**
 * Export the unlocalised version of this class so we can override it successfully elsewher
 * @param  {boolean}  props.valueIsNumber  If the value in the key value pair is always a number
 */
export class KeyValueView_Unwrapped extends Component {
    /**
     * Prepares the val for display
     * @param {string} value
     */
    static _formatVal(val, args) {
        if (args.valType === 'json') {
            if (typeof val === 'string' && val.startsWith('lambda:')) {
                //expression
                val = val.slice(7);
            } else if (typeof val === 'string') {
                //string
                val = '"' + val + '"';
            } else if (typeof val === 'object') {
                val = JSON.stringify(val);
            }
        }
        return val;
    }

    static getValues(props) {
        const propsValue = props.value || [];
        const keyName = props.args.keyProp || 'key';
        const valueName = props.args.valueProp || 'value';

        //check if object, if so convert to array of {key, value} elements
        let values = props.args.isArray
            ? propsValue
            : Object.entries(propsValue).map(([key, value]) => ({ key, value }));

        //check for no rows. if so, add an empty one
        if (values.length == 0) values.push({ key: '' });

        //convert given props into format to be used as state (including id and seq)
        values = values.map((element, index) => {
            const key = element[keyName] || ''; //if element[keyName] is '' will be falsy but want to include it
            const value = element[valueName];
            const newValue = KeyValueView_Unwrapped._formatVal(value, props.args);
            return { id: index, seq: index, key, value: newValue };
        });

        return values;
    }

    static getDerivedStateFromProps(props, state) {
        const stateKeys = state.values.map(value => value.key);
        const areKeysEqual = KeyValueView_Unwrapped.isArrayEqual(
            Object.keys(props.value || {}),
            stateKeys
        );

        const stateValues = state.values.map(value => value.value);
        const areValuesEqual = KeyValueView_Unwrapped.isArrayEqual(
            Object.values(props.value || {}),
            stateValues
        );
        if (state.values?.length >= 1 && areKeysEqual && areValuesEqual) return {}; //use existing state

        //initial state
        const values = KeyValueView_Unwrapped.getValues(props);
        return { values };
    }

    static isArrayEqual(array1, array2) {
        return (
            array1.length == array2.length &&
            array1.every(function (element, index) {
                return element === array2[index];
            })
        );
    }

    constructor(props) {
        super(props);

        this.state = {
            values: []
        };

        const { msg, args, valueIsNumber } = props;
        const { keyTitle, valueTitle } = args;

        const keyHeader = keyTitle || msg('key');
        const valueHeader = valueTitle || msg('value');

        const InputByType = valueIsNumber ? InputNumber : Input;

        const ValueInput = props.isValueMultiLang ? MultiLanguageInput : InputByType;

        this.columns = [
            {
                title: '',
                dataIndex: 'index',
                width: '40px',
                className: 'text-center',
                render: (text, item) => (
                    <div className="seq-cell">
                        {item.seq}
                        <span
                            className="delete-row-btn hidden"
                            onClick={() => this.removeItem(item)}
                        >
                            <DeleteOutlined />
                        </span>
                    </div>
                )
            },
            {
                title: keyHeader,
                dataIndex: 'key',
                width: '30%',
                getInput: record => (
                    <Input
                        className="key_input"
                        key={record.index}
                        onChange={e => this.handleChange(record.seq - 1, 'key', e.target.value)}
                    />
                )
            },
            {
                title: valueHeader,
                dataIndex: 'value',
                width: 'calc(70% - 40px)',
                className: 'text-center',
                getInput: record => (
                    <ValueInput
                        className="value_input"
                        key={record.index}
                        onChange={dataOrEvent => {
                            const value = dataOrEvent?.target
                                ? dataOrEvent.target.value
                                : dataOrEvent;
                            this.handleChange(record.seq - 1, 'value', value);
                        }}
                    />
                )
            }
        ];
        this.columns.forEach(col => (col.title = col.title.length ? col.title : ''));

        //Adds radio button beside the row in the table
        if (this.props.withRadio) {
            this.columns.push({
                title: this.props.msg('base_unit'),
                dataIndex: 'base_unit',
                className: 'text-center',
                getInput: record => (
                    <Radio
                        onChange={e => {
                            this.props.handleRadioClick(e, record);
                        }}
                        checked={this.props.isChecked(record.seq)}
                        key={record.index}
                    />
                )
            });
        }
    }

    componentDidMount() {
        const values = this.props.value;
        this.count = Object.keys(values ?? {}).length;
    }
    /**
     * Removes item from values object
     * @param {Object} item
     */
    removeItem(item) {
        let values = this.state.values;
        values = values.filter((val, i) => i !== item.seq - 1);
        this.setState({ values });
        this.triggerChange(values);
    }

    /**
     * Adds item to values object, sets state
     */
    addItem() {
        let values = [...this.state.values];
        values.push({ id: ++this.count, key: '', value: '', seq: values.length });
        this.setState({ values });
        this.triggerChange(values);
    }

    /**
     * informs the form of what change happened
     * @param {Object} values
     */
    triggerChange(values) {
        const onChange = this.props.onChange;
        if (!onChange) return;
        let res = this.props.args.isArray ? [] : {};
        res = this.unFormatValues(values);

        onChange(res);
    }

    /**
     * handles change from user in UI
     * updates state to match UI
     * @param {int} id
     * @param {string} key
     * @param {string} value
     */
    handleChange = (id, key, value) => {
        if (!this.state) return;
        let values = JSON.parse(JSON.stringify(this.state.values));
        values[id][key] = value;
        this.setState({ values });
        this.props.updateBaseUnit?.(value, this.state.values[id][key]);

        this.triggerChange(values); //inform the form that this component's state has changed
    };

    /**
     * For return to server
     * takes values and returns array of objects - [{keyProp:..., valueProp:...},{}] if isArray, else returns an object
     * @param {Object} value
     */
    unFormatValues(value) {
        const blankAllowed = this.props.blankAllowed || true;
        if (this.props.args.isArray) {
            let values = [];
            const keyName = this.props.args.keyProp || 'key';
            const valueName = this.props.args.valueProp || 'value';
            value.forEach(keyValPair => {
                if (keyValPair.key == '' && !blankAllowed) {
                    return;
                } else {
                    values.push({
                        [keyName]: this.getKey(keyValPair),
                        [valueName]: this.getValue(keyValPair)
                    });
                }
            });
            return values;
        } else {
            //format data back into what is expected from form
            let values = {};
            value.forEach(element => {
                values[element.key] = this.getValue(element);
            });
            return values;
        }
    }

    getKey(keyValPair) {
        var key = keyValPair.key; //ENH: Trim before sending to server
        // Strip the input values off of any surrounding quotes
        return key.replace(/'$|"$|^'|^"/g, '');
    }

    getValue(keyValPair) {
        if (!keyValPair.value || typeof keyValPair.value !== 'string') return keyValPair.value;
        var value = keyValPair.value; //ENH: Trim before sending to server

        if (this.props.args.valType == 'json') {
            if (value.length === 0) value = null;

            try {
                value = JSON.parse('[' + value + ']')[0];
            } catch (e) {
                return 'lambda:' + value;
            }
        } else {
            //string
            // Strip the input values off of any surrounding quotes
            value = value.replace(/'$|"$|^'|^"/g, '');
        }

        return value;
    }

    /**
     * Sets seq on data to new index.
     * Passed to Editable table in props
     * @param {int} dragIndex
     * @param {int} hoverIndex
     */
    moveRow = (dragIndex, hoverIndex) => {
        const values = [...this.state.values];

        const value = values[dragIndex];
        const beforeValue = values[hoverIndex];

        const origIndex = value.seq;
        const targetIndex = beforeValue.seq;
        const movingEl = values.splice(origIndex, 1); //remove the element that is moving
        values.splice(targetIndex, 0, movingEl[0]); //add the element in the new position

        //re sequence
        values.forEach((v, index) => (v.seq = index));

        this.setState({ values });
        this.triggerChange(values);
    };

    render() {
        const { msg } = this.props;
        if (!this.state.values.length) return null;

        const values = this.state.values;
        const data = values.map((value, seq) => {
            //Add seq onto value object, used in columns
            return {
                seq: seq + 1,
                key: value.key ?? '',
                value: value.value ?? '',
                rowKey: `${value.id}`
            };
        });

        let flag = false;
        data.forEach((element, index) => {
            if (!element.rowKey || element.rowKey == 'undefined') flag = true;
        });
        if (flag) return null; //stop render before values have been formatted

        //Enable moving row if isArray
        const isArray = this.props.args.isArray;
        const moveRow = isArray ? this.moveRow : null;

        return (
            <div className="values-field-editor key-value-editor">
                <EditableTable
                    className="input-container editable-table"
                    columns={this.columns}
                    dataSource={data}
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    size="small"
                    moveRow={moveRow}
                    rowKey={'rowKey'}
                />
                <div className="controls-container">
                    <Button
                        icon={<PlusOutlined />}
                        onClick={this.addItem.bind(this)}
                        title={msg('add_value_btn')}
                    />
                </div>
            </div>
        );
    }
}

@localise('fieldEditor')
export class KeyValueView extends KeyValueView_Unwrapped {}
