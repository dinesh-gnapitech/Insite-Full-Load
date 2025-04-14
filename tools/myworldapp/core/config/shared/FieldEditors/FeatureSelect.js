import React, { Component } from 'react';
import { Select } from 'antd';
import { inject } from 'mobx-react';

/**
 * This class acts as a way to select a list of different feature types
 */
@inject('store')
class FeatureSelect extends Component {
    state = { features: [] };

    async componentDidMount() {
        const { mode, store, dsName = 'myworld', featureFilter } = this.props;
        if (!store.ddStore.ds[dsName]) await store.ddStore.getDD(dsName, mode);
        let features = store.ddStore.ds[dsName].feature_types;
        if (featureFilter) features = await featureFilter(features);
        this.setState({ features });
    }

    render() {
        const { features } = this.state;
        const { defaultValue, onChange, multiple, maxTagCount = 1, style = {} } = this.props;
        const width = this.props.width ?? 'calc(100% - 20px)'; //set input field width. If not typePicker, then input field is the whole width of the modal

        return (
            <Select
                mode={multiple ? 'multiple' : null}
                maxTagCount={maxTagCount}
                allowClear
                showSearch
                defaultValue={defaultValue ?? (multiple ? [] : null)}
                style={{ ...style, width }}
                onChange={onChange}
            >
                {features.map((feature, index) => (
                    <Select.Option key={index} value={feature.name}>
                        {feature.name}
                    </Select.Option>
                ))}
            </Select>
        );
    }
}

export default FeatureSelect;
