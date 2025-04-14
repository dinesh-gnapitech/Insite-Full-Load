import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { localise } from '../shared';
import { Select } from 'antd';

const Option = Select.Option;

@inject('store')
@localise('main')
@observer
export class LanguageSelect extends Component {
    constructor(props) {
        super(props);
        this.settingsStore = this.props.store.settingsStore;
    }

    render() {
        const langOptions = this.settingsStore.languages;

        if (langOptions.length < 2) return '';
        return (
            <Select
                defaultValue={this.settingsStore.currentLang}
                onChange={this.handleChange}
                style={{ marginRight: 8, width: 60 }}
            >
                {langOptions.map(lang => (
                    <Option key={lang} value={lang}>
                        {lang}
                    </Option>
                ))}
            </Select>
        );
    }

    handleChange = val => {
        this.settingsStore.setCurrentLang(val);
        if (this.props.onChange) this.props.onChange();
    };
}
