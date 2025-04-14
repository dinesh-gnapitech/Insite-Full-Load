import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { localise } from '../../shared';
import { Button, Modal } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

@inject('store')
@localise('features')
@observer
export class CopyToOtherLangsBtn extends Component {
    /**
     * Creates a copy button that launches a confirmation modal
     * On confirm, localisable attributes of the current feature are copied to the non-default languages
     * if they don't already exist
     * @param {*} props
     */
    constructor(props) {
        super(props);
        this.settingsStore = this.props.store.settingsStore;
    }

    render() {
        const langOptions = this.settingsStore.languages;

        if (langOptions.length < 2) return '';
        return (
            <Button
                icon={<CopyOutlined />}
                title={this.props.msg('copy_to_other_langs')}
                onClick={this.confirm}
            />
        );
    }

    confirm = () => {
        const msg = this.props.msg;
        const content = (
            <>
                <div>{msg('copy_subtitle', { defaultLang: this.settingsStore.languages[0] })}:</div>
                <ul style={{ paddingLeft: '18px', paddingTop: '18px' }}>
                    <li>{msg('copy_item_display_name')}</li>
                    <li>{msg('copy_item_title')}</li>
                    <li>{msg('copy_item_short_description')}</li>
                    <li>{msg('copy_item_display_names_for_fields')}</li>
                    <li>{msg('copy_item_group_names')}</li>
                    <li>{msg('copy_item_group_separator_labels')}</li>
                    <li>{msg('copy_item_searches')}</li>
                    <li>{msg('copy_item_queries')}</li>
                </ul>
                <div></div>
            </>
        );
        Modal.confirm({
            title: msg('copy_to_other_langs'),
            content: content,
            okText: msg('copy'),
            cancelText: msg('cancel'),
            onOk: this.copyProps
        });
    };

    copyProps = () => {
        this.props.store.ddStore.copyPropsInOtherLangs(this.settingsStore.languages);
    };
}
