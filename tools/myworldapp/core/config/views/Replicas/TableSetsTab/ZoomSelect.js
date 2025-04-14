import React, { Component } from 'react';
import { Select } from 'antd';

//Component for the Features tab of the Layer editor
export class ZoomSelect extends Component {
    render() {
        const { value } = this.props;
        return (
            <Select
                style={{ width: '100%' }}
                value={value}
                onChange={(...args) => this.props.onChange(...args)}
                allowClear
            >
                {[...Array(31).keys()].map(i => (
                    <Select.Option key={i} value={i}>
                        {i}
                    </Select.Option>
                ))}
            </Select>
        );
    }
}
