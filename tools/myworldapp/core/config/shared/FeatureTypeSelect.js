import React, { Component } from 'react';
import { Select } from 'antd';
import { inject, observer } from 'mobx-react';
const Option = Select.Option;

@inject('store')
@observer
export class FeatureTypeSelect extends Component {
    async componentDidMount() {
        const store = this.props.store;
        await store.myWorldStore.getFeatureTypes();
    }
    render() {
        const featureTypes = this.props.filterItems(this.props.store.myWorldStore.featureTypes);
        if (!featureTypes) return this.props.value;

        return (
            <Select
                className="feature-dropdown-list"
                onChange={this.props.onChange}
                autoFocus={this.props.value === ''}
                value={this.props.value}
                showSearch
                style={{ width: 220 }}
            >
                {featureTypes.map(f => (
                    <Option key={f.id} value={f.name}>
                        {f.name}
                    </Option>
                ))}
            </Select>
        );
    }
}
