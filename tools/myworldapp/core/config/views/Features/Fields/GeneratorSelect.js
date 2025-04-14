import React, { Component } from 'react';
import { Select } from 'antd';

const generatorByType = {
    integer: ['sequence'],
    bigint: ['sequence'],
    string: ['application', 'user'],
    timestamp: ['now_utc']
};

export class GeneratorSelect extends Component {
    render() {
        const { data, disabled, value, onChange } = this.props;
        const generators = generatorByType[data.type?.split('(')[0]] || [];
        return (
            <Select
                disabled={disabled || generators.length === 0}
                value={value}
                style={{ width: '100%' }}
                onChange={onChange}
                allowClear
            >
                {generators.map(val => (
                    <Select.Option key={val} value={val}>
                        {val}
                    </Select.Option>
                ))}
            </Select>
        );
    }
}
