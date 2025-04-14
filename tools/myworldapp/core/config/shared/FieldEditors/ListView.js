import React, { Component } from 'react';
import { Input, Button } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { localise } from '../../shared/Localise';

@localise('fieldEditor')
export class ListView extends Component {
    state = {
        selectedRow: null
    };

    removeItem() {
        if (!this.props.value) return;
        let values = [...this.props.value];
        values.splice(this.state.selectedRow, 1);
        this.setState({ selectedRow: null });
        this.triggerChange(values);
    }

    addItem() {
        const propValue = this.props.value || [];
        let values = [...propValue];
        values.push('');
        this.triggerChange(values);
    }

    //informs the form of what change happened
    triggerChange(values) {
        const onChange = this.props.onChange;
        onChange?.(values);
    }

    handleFocus(idx) {
        this.setState({ selectedRow: idx });
    }

    //handles change from user in UI
    //updates state to match UI
    handleChange(id, key, value) {
        const propValue = this.props.value || [];
        let values = [...propValue];
        values[id] = this._unFormatVal(value);

        this.triggerChange(values); //inform the form that this component's state has changed
    }

    /**
     * If the valType is 'json', preps the object for display in an input box
     */
    _formatVal(val) {
        if (this.props.args.valType === 'json') {
            if (typeof val === 'object') {
                val = JSON.stringify(val);
            }
        }
        return val;
    }

    /**
     * For return to server
     * takes values and returns array of objects if args.valType is json
     * @param {Object} value
     */
    _unFormatVal(value) {
        if (this.props.args.valType === 'json') {
            //format data back into what is expected from form
            try {
                const parsed = JSON.parse('[' + value + ']')[0];
                value = parsed;
            } catch (e) {
                // Nothing
            }
            return value;
        } else {
            return value;
        }
    }

    render() {
        const { selectedRow } = this.state;
        const { value } = this.props;
        let propsValue = value?.length ? value : [''];

        return (
            <div className="values-field-editor" style={{ marginTop: '5px' }}>
                <div className="input-container">
                    {propsValue.map((value, i) => (
                        <Input
                            style={{ display: 'block', marginBottom: '5px' }}
                            key={i}
                            value={this._formatVal(value)}
                            onFocus={this.handleFocus.bind(this, i)}
                            onChange={e => this.handleChange(i, 'value', e.target.value)}
                        />
                    ))}
                </div>
                <div className="controls-container">
                    <Button icon={<PlusOutlined />} onClick={this.addItem.bind(this)} />
                    <Button
                        disabled={selectedRow == null}
                        icon={<DeleteOutlined />}
                        onClick={this.removeItem.bind(this)}
                    />
                </div>
            </div>
        );
    }
}
