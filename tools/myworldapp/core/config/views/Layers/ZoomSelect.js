import React, { Component } from 'react';
import { Select } from 'antd';

//Component for the Features tab of the Layer editor
export class ZoomSelect extends Component {
    render() {
        const { data, propName, disabled } = this.props;
        return (
            <div className={propName}>
                <Select
                    showSearch
                    style={{ width: '100%' }}
                    value={data[propName]}
                    onChange={(...args) => this.props.onChange(...args)}
                    disabled={disabled}
                    allowClear
                >
                    {[...Array(31).keys()].map(i => (
                        <Select.Option key={i} value={i}>
                            {i}
                        </Select.Option>
                    ))}
                </Select>
            </div>
        );
    }
}
