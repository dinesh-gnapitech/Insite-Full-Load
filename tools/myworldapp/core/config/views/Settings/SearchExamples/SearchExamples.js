import React, { Component } from 'react';
import { Spin } from 'antd';
import { localise, ValuesFieldEditor } from '../../../shared';
import { inject, observer } from 'mobx-react';

@inject('store')
@localise('settings')
@observer
export class SearchExamples extends Component {
    onChange(values) {
        this.props.store.settingsStore.setValue('core.searchExamples', values);
    }

    render() {
        const store = this.props.store.settingsStore;
        const data = store.getConverted('core.searchExamples');

        const value = data.map(val => {
            return { value: val };
        });

        if (!data || store.isLoading) {
            return (
                <div style={{ padding: 50, textAlign: 'center' }}>
                    <Spin size="large" />
                </div>
            );
        }
        return (
            <ValuesFieldEditor
                value={value}
                msg={this.props.msg}
                onChange={this.onChange.bind(this)}
                mapValue={this.mapValue}
            />
        );
    }

    mapValue = value => {
        return value.value;
    };
}
