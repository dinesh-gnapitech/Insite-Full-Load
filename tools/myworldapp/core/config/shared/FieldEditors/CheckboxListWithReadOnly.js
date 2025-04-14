import { observer } from 'mobx-react';
import { Checkbox } from 'antd';
import React, { Component } from 'react';
import { localise } from '../Localise';
import { CheckboxRowWithReadOnly } from '../../shared/FieldEditors';

@localise('fieldEditor')
@observer
/**
 * List of checkboxes with a 'All' checkbox to control check/uncheck all checkboxes in the list
 */
export class CheckboxListWithReadOnly extends Component {
    static getDerivedStateFromProps(props, state) {
        if ('value' in props) {
            const allValues = props.value.map(option => option.value);
            const checkedValuesInList = allValues.filter(item => {
                const propsValue = props.value.find(propsItem => propsItem.value == item);
                return propsValue?.selected;
            });
            return {
                value: props.value,
                indeterminate:
                    !!checkedValuesInList.length && checkedValuesInList.length < props.value.length,
                checkAll: checkedValuesInList.length === props.value.length
            };
        }
    }

    constructor(props) {
        super(props);
        this.state = {
            value: props.value,
            indeterminate: true,
            checkAll: false
        };
    }

    render() {
        const value = this.props.value;
        if (!value) return <div></div>;
        const { msg, itemRepresents, showLink } = this.props;

        return (
            <div style={{ minWidth: '412px' }}>
                <div className="select-all" style={{ position: 'relative' }}>
                    <Checkbox
                        className="select-all"
                        indeterminate={this.state.indeterminate}
                        onChange={this.onCheckAllChange}
                        checked={this.state.checkAll}
                    >
                        {msg('select_all')}
                    </Checkbox>
                    <span className={'read-only-header'}>{this.props.msg('read_only')}</span>
                    <span className={'snap-header'}>{this.props.msg('snap_header')}</span>
                </div>
                <ul className="noStyleList">
                    {value.map(item => {
                        return (
                            <CheckboxRowWithReadOnly
                                key={item.value}
                                value={item.value}
                                label={item.label}
                                itemRepresents={itemRepresents}
                                showLink={showLink}
                                msg={msg}
                                selected={item.selected}
                                onChange={this.onChange}
                                readOnly={item.read_only}
                                snap={item.snap}
                                onReadOnlyChange={this.onReadOnlyChange}
                                onSnapChange={this.onSnapChange}
                                disabled={item.disabled}
                            />
                        );
                    })}
                </ul>
            </div>
        );
    }

    onCheckAllChange = e => {
        const values = JSON.parse(JSON.stringify(this.props.value));
        const allValues = values.map(option => {
            if (e.target.checked) {
                option.selected = true;
            } else {
                option.selected = false;
            }
            return option;
        });

        this.props.onChange(allValues);
    };

    onChange = (value, isChecked) => {
        let toSet = JSON.parse(JSON.stringify(this.props.value));
        toSet.map(layer => {
            if (layer.value == value) {
                layer.selected = isChecked;
                if (isChecked == false) layer.read_only = false;
            }
        });
        this.props.onChange(toSet);
    };

    onReadOnlyChange = (value, isChecked) => {
        let toSet = JSON.parse(JSON.stringify(this.state.value));
        toSet.map(layer => {
            if (layer.value == value) {
                layer.read_only = isChecked;
                layer.selected = true;
            }
        });
        this.props.onChange(toSet);
    };

    onSnapChange = (value, isChecked) => {
        let toSet = JSON.parse(JSON.stringify(this.state.value));
        toSet.map(layer => {
            if (layer.value == value) {
                layer.snap = isChecked;
                layer.selected = true;
            }
        });
        this.props.onChange(toSet);
    };
}
