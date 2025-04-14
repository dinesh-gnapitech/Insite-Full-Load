import React, { Component } from 'react';
import { Button, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { localise, EditableTable, FilterInfo } from '../../shared';
import { AvailableFields } from './AvailableFields';
import { FeatureFilterValField } from './Fields/FeatureFilterValField';

//Component for the Features tab of the Layer editor
@inject('store')
@localise('queries')
@observer
export class FeatureQueries extends Component {
    constructor(props) {
        super(props);
        this.sessionVars = ['{user}', '{application}', '{roles}', '{rights}', '{groups}'];
    }

    render() {
        const { msg, store } = this.props;
        const queries = store.ddStore.current.queries || [];
        const datasource = store.ddStore.current.datasource;
        const defaultLang = store.settingsStore.languages[0];
        const currentLang = store.settingsStore.currentLang || defaultLang;

        const data = [...queries]
            .map((rec, index) => {
                const newRec = { index, ...rec };
                if (rec.lang && rec.lang !== currentLang) return null;
                else return newRec;
            })
            .filter(item => item !== null);
        //Add a new 'seq' prop since the 'index' could be jumbled between queries in different languages
        const sequencedData = data.map((dataItem, index) => {
            dataItem['seq'] = index;
            return dataItem;
        });

        this.columns = [
            {
                title: '',
                dataIndex: 'seq',
                width: '60px',
                className: 'text-center',
                render: (text, item) => (
                    <div className="seq-cell">
                        {item.seq + 1}
                        <span
                            className="delete-row-btn hidden"
                            onClick={() => this.removeItem(item)}
                        >
                            <DeleteOutlined />
                        </span>
                    </div>
                )
            },
            { title: 'query_value', dataIndex: 'value', inputType: 'string' },
            { title: 'query_description', dataIndex: 'description', inputType: 'string' },
            {
                title: 'filter',
                dataIndex: 'filter',
                getInput: record => (
                    <FeatureFilterValField
                        key={record.index}
                        index={record.index}
                        filterValue={record.filter || ''}
                        dropField={this.addFilterVal}
                    />
                )
            }
        ];

        if (store.settingsStore.languages.length > 1) {
            this.columns.push({
                title: 'language',
                dataIndex: 'lang',
                getInput: record => <Tag>{record.lang}</Tag>
            });
        }
        this.columns.forEach(
            col => (col.title = col.title.length ? this.props.msg(col.title) : '')
        );

        return (
            <div style={{ position: 'relative' }}>
                <div className="feature-edit-fieldset">
                    <div className="values-field-editor">
                        <EditableTable
                            className="input-container myw-list-view editable-table"
                            columns={this.columns}
                            dataSource={sequencedData}
                            rowKey="index"
                            pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                            onFieldsChange={this.setQueryProp}
                            size="small"
                        />
                        <div className="controls-container">
                            <Button
                                icon={<PlusOutlined />}
                                onClick={this.addQuery}
                                title={msg('add_value_btn')}
                            />
                        </div>
                    </div>
                    <FilterInfo datasource={datasource} />
                </div>
                <AvailableFields titleMsg={'drag_for_filter'} extraFields={this.sessionVars} />
            </div>
        );
    }

    setQueryProp = (index, field, propName, value) => {
        const i = field ? field.index : index;
        this.props.store.ddStore.setQueryProp(i, propName, value);
    };

    addQuery = () => {
        const settingsStore = this.props.store.settingsStore;
        const hasMultiLang = settingsStore.languages.length > 1;
        const defaultLang = settingsStore.languages[0];
        const lang = hasMultiLang ? settingsStore.currentLang || defaultLang : null;
        this.props.store.ddStore.addQuery(lang);
        this.forceUpdate();
    };

    removeItem = item => {
        this.props.store.ddStore.removeQueryFrom(item.index);
        this.forceUpdate();
    };

    addFilterVal = (origVal, fieldName, beforeIndex) => {
        this.setQueryProp(beforeIndex, null, 'filter', this.createValOnDrop(origVal, fieldName));
        this.forceUpdate();
    };

    /**
     * Create the value to show in the drop target after drag n drop occured
     */
    createValOnDrop(origVal, droppedText) {
        let fieldToAppend;

        if (this.sessionVars.includes(droppedText)) {
            fieldToAppend = droppedText; //use the text as is
        } else {
            fieldToAppend = '[' + droppedText + ']'; //Add square parenthesis around the text
        }
        return origVal + ' ' + fieldToAppend;
    }
}
