import React, { Component } from 'react';
import { Select } from 'antd';
import { inject, observer } from 'mobx-react';

const Option = Select.Option;

@inject('store')
@observer
export class EnumView extends Component {
    render() {
        const { args, value, store, onChange } = this.props;
        const enumValues = store.datasourceStore.getEnumeratorValues(args.dsName, args.enumerator);
        if (!enumValues) return null;

        return (
            <Select
                style={{ width: '80%', marginRight: 5 }}
                onChange={value => onChange(value)}
                defaultValue={args.default}
                value={value}
            >
                {enumValues.map(i => (
                    <Option key={i} value={i}>
                        {i}
                    </Option>
                ))}
            </Select>
        );
    }
}
