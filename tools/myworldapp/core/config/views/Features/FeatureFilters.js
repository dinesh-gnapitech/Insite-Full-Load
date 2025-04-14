import React, { Component } from 'react';
import { Button } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { localise, EditableTable, FilterInfo } from '../../shared';
import { FeatureFilterValField } from './Fields/FeatureFilterValField';
import { AvailableFields } from './AvailableFields';

//Component for the Features tab of the Layer editor
@inject('store')
@localise('filters')
@observer
export class FeatureFilters extends Component {
    constructor(props) {
        super(props);
        this.sessionVars = ['{user}', '{application}', '{roles}', '{rights}', '{groups}'];
        this.columns = [
            {
                title: '',
                dataIndex: 'index',
                width: '60px',
                className: 'text-center',
                render: (text, item) => (
                    <div className="seq-cell">
                        {item.index + 1}
                        <span
                            className="delete-row-btn hidden"
                            onClick={() => this.removeItem(item)}
                        >
                            <DeleteOutlined />
                        </span>
                    </div>
                )
            },
            { title: 'name', dataIndex: 'name', inputType: 'string' },
            {
                title: 'value',
                dataIndex: 'value',
                getInput: record => (
                    <FeatureFilterValField
                        key={record.index}
                        index={record.index}
                        filterValue={record.value || ''}
                        dropField={this.addFilterVal}
                    />
                )
            }
        ];
        this.columns.forEach(
            col => (col.title = col.title.length ? this.props.msg(col.title) : '')
        );
    }

    render() {
        const { msg } = this.props;
        const filters = this.props.store.ddStore.current.filters || [];
        const data = filters.map((rec, index) => ({ index, ...rec }));

        return (
            <div style={{ position: 'relative' }}>
                <div className="feature-edit-fieldset">
                    <div className="values-field-editor">
                        <EditableTable
                            className="input-container myw-list-view editable-table"
                            columns={this.columns}
                            dataSource={data}
                            rowKey="index"
                            pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                            onFieldsChange={this.setFilterProp}
                            size="small"
                        />
                        <div className="controls-container">
                            <Button
                                icon={<PlusOutlined />}
                                onClick={this.addFilter}
                                title={msg('add_value_btn')}
                            />
                        </div>
                    </div>
                    <FilterInfo />
                </div>
                <AvailableFields titleMsg={'drag_for_value'} extraFields={this.sessionVars} />
            </div>
        );
    }

    setFilterProp = (index, field, propName, value) => {
        const i = field ? field.index : index;
        this.props.store.ddStore.setFilterProp(i, propName, value);
    };

    addFilter = () => {
        this.props.store.ddStore.addFilter();
        this.forceUpdate();
    };

    removeItem = item => {
        this.props.store.ddStore.removeFilterFrom(item.index);
        this.forceUpdate();
    };

    addFilterVal = (origVal, fieldName, beforeIndex) => {
        this.setFilterProp(beforeIndex, null, 'value', this.createValOnDrop(origVal, fieldName));
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
