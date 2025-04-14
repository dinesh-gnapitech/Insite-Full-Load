import { observer } from 'mobx-react';
import { Checkbox } from 'antd';
import React, { Component } from 'react';
import { localise } from '../../shared/Localise';
import { CheckboxRow } from '../../shared/FieldEditors';

@localise('fieldEditor')
@observer
/**
 * List of checkboxes with a 'All' checkbox to control check/uncheck all checkboxes in the list
 */
export class CheckboxList extends Component {
    static getDerivedStateFromProps(props, state) {
        if ('value' in props) {
            const allValues = props.options.map(option => option.value);
            const checkedValuesInList = allValues.filter(item => props.value.includes(item));
            return {
                value: props.value,
                indeterminate:
                    !!checkedValuesInList.length &&
                    checkedValuesInList.length < props.options.length,
                checkAll: checkedValuesInList.length === props.options.length
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
        this.options = this.props.options;
        const { msg, itemRepresents, showLink } = this.props;
        return (
            <div>
                <div className="select-all">
                    <Checkbox
                        className="select-all"
                        indeterminate={this.state.indeterminate}
                        onChange={this.onCheckAllChange}
                        checked={this.state.checkAll}
                    >
                        {msg('select_all')}
                    </Checkbox>
                </div>
                <ul className="noStyleList">
                    {this.options.map(item => {
                        return (
                            <CheckboxRow
                                key={item.value}
                                value={item.value}
                                label={item.label}
                                itemRepresents={itemRepresents}
                                showLink={showLink}
                                msg={msg}
                                selected={this.state.value.includes(item.value)}
                                onChange={this.onChange}
                            />
                        );
                    })}
                </ul>
            </div>
        );
    }

    onCheckAllChange = e => {
        const allValues = this.options.map(option => option.value);
        const listValue = e.target.checked ? allValues : [];
        this.props.onChange(listValue);
    };

    onChange = (value, isChecked) => {
        const newValueList = this.props.value.filter(item => {
            return item !== value;
        });
        if (isChecked) newValueList.push(value);
        this.props.onChange(newValueList);
    };
}
