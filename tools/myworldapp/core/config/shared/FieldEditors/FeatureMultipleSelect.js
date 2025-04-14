import React, { Component } from 'react';
import { observer } from 'mobx-react';
import { Select } from 'antd';

const Option = Select.Option;

//Component to allow a user to select a set of feature types
@observer
export class FeatureMultipleSelect extends Component {
    async componentDidMount() {
        const store = this.props.store;
        await store.myWorldStore.getFeatureTypes();
    }

    render() {
        const { store } = this.props;
        const featureTypes = store.myWorldStore.featureTypes || [];
        const select = (
            <Select
                mode="tags"
                style={{ width: 500 }}
                onChange={this.handleChange.bind(this)}
                value={this.props.values}
            >
                {
                    // `observableArray.sort()` mutates the array in-place, which is not allowed
                    //  inside a derivation. Use `array.slice().sort()` instead
                    featureTypes
                        .slice()
                        .sort()
                        .map(cat => (
                            <Option key={cat.name} value={cat.name}>
                                {cat.name}
                            </Option>
                        ))
                }
            </Select>
        );
        return select;
    }

    handleChange(values) {
        values = values.sort();
        this.props.onChange?.(values);
        this.setState({ values });
    }
}
