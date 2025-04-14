import React, { Component } from 'react';
import { Button, Checkbox, Input, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import { localise, EditableTable, SortableTableBuilder } from '../../shared';
import { AvailableFields } from './AvailableFields';
import { DropTarget } from 'react-dnd';
import { isGeomField } from './utils';

//Component for Searches tab of the Feature editor
@withRouter
@inject('store')
@localise('features')
@observer
export class FeatureSearches extends Component {
    constructor(props) {
        super(props);

        this.state = {
            dsType: 'myWorld'
        };

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
            {
                title: 'search_value',
                dataIndex: 'value',
                getInput: record => (
                    <DropInputField
                        key={record.index}
                        index={record.index}
                        inputValue={record.value || ''}
                        dropField={this.addToValue}
                    />
                )
            },
            {
                title: 'search_description',
                dataIndex: 'description',
                getInput: record => (
                    <DropInputField
                        key={record.index}
                        index={record.index}
                        inputValue={record.description || ''}
                        dropField={this.addToDescription}
                    />
                )
            }
        ];

        if (this.props.store.settingsStore.languages.length > 1) {
            this.columns.push({
                title: 'language',
                dataIndex: 'lang',
                getInput: record => <Tag>{record.lang}</Tag>
            });
        }
        this.columns.forEach(
            col => (col.title = col.title.length ? this.props.msg(col.title) : '')
        );
    }

    async componentDidMount() {
        const dsDef = await this.props.store.datasourceStore.get(this.props.data.datasource);
        this.setState({ dsType: dsDef.type });
    }

    render() {
        const { msg, store } = this.props;
        const searches = store.ddStore.current.searches || [];
        const dsName = store.ddStore.current.datasource;
        const defaultLang = store.settingsStore.languages[0];
        const currentLang = store.settingsStore.currentLang || defaultLang;

        const data = [...searches]
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

        const filter = field => !field.isNew && !isGeomField(field);
        const fields = this.props.store.ddStore.current.fields.filter(filter);
        const fieldsData = fields.map((f, index) => ({ seq: index + 1, ...f }));

        this.pseudoFields = ['{display_name}', '{title}', '{short_description}'];
        if (dsName === 'myworld') {
            return (
                <div style={{ position: 'relative' }}>
                    <div className="feature-edit-fieldset values-field-editor">
                        <EditableTable
                            className="input-container myw-list-view editable-table"
                            columns={this.columns}
                            dataSource={sequencedData}
                            rowKey="index"
                            pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                            onFieldsChange={this.setSearchProp}
                            size="small"
                        />
                        <div className="controls-container">
                            <Button
                                icon={<PlusOutlined />}
                                onClick={this.addSearch}
                                title={msg('add_value_btn')}
                            />
                        </div>
                    </div>
                    <AvailableFields
                        titleMsg={'drag_for_search_value'}
                        extraFields={this.pseudoFields}
                    />
                </div>
            );
        } else {
            return (
                <SortableTableBuilder
                    className="myw-list-view"
                    style={{ marginTop: '10px' }}
                    loading={this.props.loading}
                    size="small"
                    columns={[
                        {
                            title: msg('seq'),
                            dataIndex: 'seq',
                            width: '60px',
                            className: 'text-center'
                        },
                        {
                            title: msg('name'),
                            dataIndex: 'name',
                            key: 'name'
                        },
                        {
                            title: msg('external_name'),
                            dataIndex: 'external_name',
                            key: 'external_name',
                            render: (text, rec) =>
                                store.settingsStore.getLocalisedValFor(text, currentLang)
                        },
                        {
                            title: msg('searchable'),
                            dataIndex: 'searchable',
                            key: 'searchable',
                            className: 'text-center',
                            render: this.searchableCellContent
                        }
                    ]}
                    dataSource={fieldsData}
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    rowKey="seq"
                />
            );
        }
    }

    searchableCellContent = (text, rec) => {
        const searches = this.props.store.ddStore.current.searches || [];
        const searchValue = searches[0] ? searches[0].value : '';
        const searchableFields = searchValue.match(/[^[\]]+(?=])/g);

        const isSearchable = searchableFields?.includes(rec.name);

        if (this.state.dsType !== 'esri') {
            return (
                <input
                    type="radio"
                    name="searchable_field"
                    checked={isSearchable}
                    onChange={this.updateExtDsSearch.bind(this, `[${rec.name}]`)}
                />
            );
        } else
            return (
                <Checkbox
                    checked={isSearchable}
                    onChange={this.updateExtDsSearch.bind(this, `[${rec.name}]`)}
                />
            );
    };

    updateExtDsSearch = (name, e) => {
        this.props.store.ddStore.appendToExtDsSearch(name, e.target.checked, this.state.dsType);
        this.forceUpdate();
    };

    setSearchProp = (index, field, propName, value) => {
        const i = field ? field.index : index;
        this.props.store.ddStore.setSearchProp(i, propName, value);
    };

    addSearch = () => {
        const settingsStore = this.props.store.settingsStore;
        const hasMultiLang = settingsStore.languages.length > 1;
        const defaultLang = settingsStore.languages[0];
        const lang = hasMultiLang ? settingsStore.currentLang || defaultLang : null;
        this.props.store.ddStore.addSearch(lang);
        this.forceUpdate();
    };

    removeItem = item => {
        this.props.store.ddStore.removeSearchFrom(item.index);
        this.forceUpdate();
    };

    addToValue = (origVal, fieldName, beforeIndex) => {
        this.setSearchProp(beforeIndex, null, 'value', this.createValOnDrop(origVal, fieldName));
        this.forceUpdate();
    };

    addToDescription = (origVal, fieldName, beforeIndex) => {
        this.setSearchProp(
            beforeIndex,
            null,
            'description',
            this.createValOnDrop(origVal, fieldName)
        );
        this.forceUpdate();
    };

    /**
     * Create the value to show in the drop target after drag n drop occured
     */
    createValOnDrop(origVal, droppedText) {
        let fieldToAppend;

        if (this.pseudoFields.includes(droppedText)) {
            fieldToAppend = droppedText; //use the text as is
        } else {
            fieldToAppend = '[' + droppedText + ']'; //Add square parenthesis around the text
        }
        return origVal + ' ' + fieldToAppend;
    }

    /**
     * Filters out the geometry fields
     * Since they should not show in the 'Available fields' drag and drop widget
     * @param  {Array}  fields  List fo fields to filter from
     * @return {Array}          Filtered list
     */
    _filterOutGeomFields(fields) {
        return fields.filter(fieldDef => {
            return !isGeomField(fieldDef);
        });
    }
}

const fieldTarget = {
    drop(props, monitor) {
        const fieldName = monitor.getItem().name;
        const hoverIndex = props.index;
        props.dropField(props.inputValue, fieldName, hoverIndex);
    }
};

@DropTarget('fieldName', fieldTarget, (connect, monitor) => ({
    prependDropTarget: connect.dropTarget()
}))
class DropInputField extends Component {
    render() {
        const { prependDropTarget, inputValue, onChange } = this.props;
        return prependDropTarget(
            <div>
                <Input
                    className="ant-input"
                    rows="2"
                    value={inputValue}
                    onChange={e => onChange(e.currentTarget.value)}
                />
            </div>
        );
    }
}
