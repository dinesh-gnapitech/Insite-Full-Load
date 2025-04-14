import React, { Component } from 'react';
import { Checkbox, Input, Space } from 'antd';
import { inject } from 'mobx-react';
import { localise } from '../../shared';

@inject('store')
@localise('features')
export class EditorOptions extends Component {
    formRef = React.createRef(); //Creates a reference to the feature basic form to be used in the handleSave method

    render() {
        const { msg, store } = this.props;

        const editorOptions = store.ddStore.current.editor_options ?? {};
        const usePopupEditor = editorOptions?.popup;

        return (
            <Space style={{ height: '36px', marginBottom: '10px' }}>
                <Checkbox
                    checked={usePopupEditor}
                    onChange={e => this.onValuesChange({ popup: e.target.checked })}
                >
                    {msg('use_popup_editor')}
                </Checkbox>
                {usePopupEditor && (
                    <>
                        {msg('desired_popup_editor_width')}
                        <Input
                            value={editorOptions.popup_width}
                            onChange={e => this.onValuesChange({ popup_width: e.target.value })}
                        />
                    </>
                )}
            </Space>
        );
    }

    onValuesChange = changes => {
        const { store } = this.props;
        const editorOptions = store.ddStore.current.editor_options;
        const newOptions = Object.assign({}, editorOptions, changes);
        store.ddStore.current.editor_options = newOptions;
        this.forceUpdate();
    };
}
