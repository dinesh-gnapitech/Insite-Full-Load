import React, { Component } from 'react';
import { Select } from 'antd';

const Option = Select.Option;

//Class to display an option, allow user to select from a list of options and also to add another option
export class SelectWithInput extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    static getDerivedStateFromProps(props, state) {
        //  Work out if the current value is dyamically defined or not
        const { value, items } = props;
        return {
            dynamicValue: items?.includes(value) ? '' : value
        };
    }

    render() {
        const { dynamicValue } = this.state;
        const { value, items, width = '100%', className } = this.props;

        return (
            <Select
                allowClear
                showSearch
                onClear={this.onChange}
                onChange={this.onChange}
                onSearch={this.onChange}
                value={value}
                style={{ width }}
                className={className}
                dropdownStyle={{ width: 'auto' }}
                dropdownMatchSelectWidth={false}
            >
                <Option key={dynamicValue} value={dynamicValue}>
                    {dynamicValue}
                </Option>
                {items?.map(item => (
                    <Option key={item} value={item}>
                        {item}
                    </Option>
                ))}
            </Select>
        );
    }

    onChange = (value = '') => {
        this.props.onChange(value);
    };
}
