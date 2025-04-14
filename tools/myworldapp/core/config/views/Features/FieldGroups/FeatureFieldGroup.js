import React, { Component } from 'react';
import { Button, Checkbox, Divider, Table, Collapse, Tooltip } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { localise, Reorderable, MultiLanguageInput } from '../../../shared';
import { isFieldSeparator, isGeomField } from '../utils';
import { DropTarget } from 'react-dnd';
import { DeleteOutlined } from '@ant-design/icons';
import { FeatureFieldGroupFilterDialog } from './FeatureFieldGroupFilterDialog';

const listContainerTarget = {
    drop(props, monitor) {
        //called when layer name is dropped on (empty) list container
        const fieldName = monitor.getItem().name;
        const hoverIndex = props.index;
        if (isFieldSeparator(fieldName)) return;
        addField(props, fieldName, hoverIndex);
    }
};

/* Component to display the list of layers on a Layer group
 * Elements can be reordered by DnD, and new layers can be dragged onto the existing ones
 */
@inject('store')
@DropTarget('fieldName', listContainerTarget, (connect, monitor) => ({
    prependDropTarget: connect.dropTarget()
}))
@Reorderable('fieldGroup')
@localise('features')
@observer
export class FeatureFieldGroup extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isDefaultGroup: props.isDefaultGroup,
            showFilterDialog: false,
            initialDialogValue: null,
            dialogTitle: '',
            onFilterDialogClosed: null,
            validatorsMode: false
        };
    }

    render() {
        const {
            index,
            reorderableElement,
            expandedByDefault,
            featureIsEditable,
            data,
            prependDropTarget,
            onClick,
            fields,
            msg
        } = this.props;
        const {
            isDefaultGroup,
            showFilterDialog,
            dialogTitle,
            initialDialogValue,
            onFilterDialogClosed,
            validatorsMode
        } = this.state;
        if (isDefaultGroup) {
            const fields = data.fields;
            this.data = fields
                .filter(field => !isGeomField(field))
                .map(def => ({
                    name: def.name
                }));
        } else {
            this.data = fields
                .filter(field_name =>
                    // separators does not related to a field in records, need to check additionally
                    data.fields.find(
                        field => field.name === field_name || isFieldSeparator(field_name?.type)
                    )
                )
                .map((field_name, index) => ({
                    name: field_name,
                    // after supportting separator, cannot just use field name as row key,
                    // otherwise can't handle multiple separators with empty label
                    rowKey: `${index} - ${field_name?.type || field_name}`
                }));
        }

        return prependDropTarget(
            reorderableElement(
                <div key={index} className="field-group-panel" onClick={onClick}>
                    <Collapse bordered={true} defaultActiveKey={expandedByDefault ? ['1'] : []}>
                        <Collapse.Panel
                            header={
                                <div
                                    style={{
                                        width: '100%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}
                                >
                                    {this.getGroupPanelContents()}
                                </div>
                            }
                            key="1"
                        >
                            <Table
                                components={{ body: { row: Field } }}
                                size="small"
                                showHeader={false}
                                columns={[
                                    {
                                        title: 'Delete',
                                        dataIndex: 'delete',
                                        width: 30,
                                        render: (text, field, index) => (
                                            <span
                                                className="delete-row-btn hidden"
                                                onClick={this.deleteField.bind(
                                                    this,
                                                    field.name,
                                                    index
                                                )}
                                            >
                                                <DeleteOutlined />
                                            </span>
                                        )
                                    },
                                    {
                                        title: 'Name',
                                        dataIndex: 'name',
                                        key: 'name',
                                        render: (text, rec, index) =>
                                            isFieldSeparator(rec.name?.type)
                                                ? {
                                                      children: (
                                                          <Divider
                                                              orientation="left"
                                                              style={{ margin: 0 }}
                                                          >
                                                              <MultiLanguageInput
                                                                  placeholder={msg(
                                                                      'separator_input_placeholder'
                                                                  )}
                                                                  value={rec.name.label}
                                                                  style={{ minWidth: '250px' }}
                                                                  onChange={this.onSeparatorLabelChange.bind(
                                                                      this,
                                                                      index
                                                                  )}
                                                              />
                                                          </Divider>
                                                      ),
                                                      props: { colSpan: 6 }
                                                  }
                                                : text
                                    },
                                    {
                                        title: 'Visibility',
                                        dataIndex: 'visible',
                                        key: 'visible',
                                        render: (text, rec) =>
                                            this.createFieldFilterCheckbox(rec, 'visible', 'true')
                                    },
                                    ...(featureIsEditable
                                        ? [
                                              {
                                                  title: 'Mandatory',
                                                  dataIndex: 'mandatory',
                                                  key: 'mandatory',
                                                  render: (text, rec) =>
                                                      this.createFieldFilterCheckbox(
                                                          rec,
                                                          'mandatory',
                                                          'false'
                                                      )
                                              },
                                              {
                                                  title: 'Read-Only',
                                                  dataIndex: 'readonly',
                                                  key: 'readonly',
                                                  render: (text, rec) =>
                                                      this.createFieldFilterCheckbox(
                                                          rec,
                                                          'read_only',
                                                          'false'
                                                      )
                                              },
                                              {
                                                  title: 'Validators',
                                                  dataIndex: 'validators',
                                                  key: 'validators',
                                                  render: (text, rec) =>
                                                      this.createValidatorsButton(rec)
                                              },
                                              {
                                                  title: 'New Row',
                                                  dataIndex: 'new_row',
                                                  key: 'new_row',
                                                  render: (text, rec) =>
                                                      this.createNewRowCheckbox(rec)
                                              }
                                          ]
                                        : [])
                                ]}
                                dataSource={this.data}
                                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                                rowKey="rowKey"
                                onRow={(record, index) => ({
                                    index,
                                    record,
                                    moveRow: this.reorder,
                                    dropField: this.addField
                                })}
                            />
                        </Collapse.Panel>
                    </Collapse>
                    <FeatureFieldGroupFilterDialog
                        visible={showFilterDialog}
                        title={dialogTitle}
                        value={initialDialogValue}
                        onValueChange={onFilterDialogClosed}
                        validatorsMode={validatorsMode}
                    />
                    <br />
                    <br />
                </div>
            )
        );
    }

    stopEventPropogation = ev => {
        ev.stopPropagation();
    };

    onNameChange = value => {
        const { name, store, onFieldChange } = this.props;
        store.ddStore.setFieldGroupProp(name, 'name', value);
        onFieldChange();
    };

    onSeparatorLabelChange = (index, value) => {
        const { fields, name, store, onFieldChange } = this.props;
        fields[index].label = value;
        store.ddStore.setFieldGroupProp(name, 'fields', fields);
        onFieldChange();
    };

    onExpandedChange = ev => {
        const { name, store, onFieldChange } = this.props;
        ev.stopPropagation();
        store.ddStore.setFieldGroupProp(name, 'expanded', ev.target.checked);
        onFieldChange();
    };

    getGroupPanelContents() {
        const { isDefaultGroup } = this.state;
        const { name, expanded, msg, onDelete } = this.props;

        if (isDefaultGroup) {
            return name;
        } else {
            return (
                <>
                    <MultiLanguageInput
                        value={name}
                        style={{ width: 200, display: 'inline-flex' }}
                        onClick={this.stopEventPropogation}
                        onMouseDown={e => e.target.focus()}
                        onChange={this.onNameChange}
                    />
                    <span style={{ width: 'calc(100% - 230px)' }}>
                        <Checkbox
                            className="expanded_by_default hidden"
                            checked={expanded}
                            onClick={this.stopEventPropogation}
                            onChange={this.onExpandedChange}
                        >
                            {msg('expanded_by_default')}
                        </Checkbox>
                        {this.createGroupVisibilityFilterCheckbox()}
                    </span>
                    <span
                        style={{ float: 'right', lineHeight: '31px' }}
                        className="delete-row-btn"
                        onClick={onDelete}
                        title={msg('remove_group')}
                    >
                        <DeleteOutlined />
                    </span>
                </>
            );
        }
    }

    //  Functions for group / field properties

    createFilterCheckbox = (prop, value, onCheckboxChange, onButtonClick) => {
        const { msg } = this.props;
        const { checked, indeterminate } = this._parseFilterValue(value);

        return (
            <Checkbox
                checked={checked}
                indeterminate={indeterminate}
                onClick={this.stopEventPropogation}
                onChange={onCheckboxChange}
            >
                <Tooltip title={msg('edit_filters')}>
                    <Button
                        onClick={onButtonClick}
                        size="small"
                        icon={<FilterOutlined />}
                        style={{ marginRight: '8px' }}
                    />
                </Tooltip>
                {msg(prop)}
            </Checkbox>
        );
    };

    // For the separator row, other columns are merged into the name column
    // by setting their colSpan to be 0
    renderContent = (value, rec) => {
        const obj = {
            children: value,
            props: {}
        };
        if (isFieldSeparator(rec.name?.type)) {
            obj.props.colSpan = 0;
        }
        return obj;
    };

    createNewRowCheckbox = rec => {
        let component;
        if (isFieldSeparator(rec.name?.type)) component = null;
        else {
            const { msg, store } = this.props;
            const checked = store.ddStore.getFieldProp(rec, 'new_row') ?? true;
            component = (
                <Tooltip title={msg('new_row_help')}>
                    <Checkbox
                        checked={checked}
                        onClick={this.stopEventPropogation}
                        onChange={this.onNewRowCheckboxChange(rec)}
                    >
                        {msg('new_row')}
                    </Checkbox>
                </Tooltip>
            );
        }
        return this.renderContent(component, rec);
    };

    onCheckboxChange = (name, prop, setFunc, toString) => ev => {
        const { store, onFieldChange } = this.props;

        ev.stopPropagation();
        let value = ev.target.checked;
        if (toString) value = value.toString();
        store.ddStore[setFunc](name, prop, value);
        //  There's a bug in default view where checkboxes don't update when checked
        if (this.state.isDefaultGroup) this.forceUpdate();
        onFieldChange();
    };

    onNewRowCheckboxChange = name => this.onCheckboxChange(name, 'new_row', 'setFieldProp', false);

    onFilterClicked = (value, dialogTitle, onFilterDialogClosed, validatorsMode) => ev => {
        ev.stopPropagation();
        const { indeterminate } = this._parseFilterValue(value);

        const initialDialogValue = indeterminate ? value : '';
        this.setState({
            showFilterDialog: true,
            dialogTitle,
            initialDialogValue,
            onFilterDialogClosed,
            validatorsMode
        });
    };

    onFilterChanged = (name, prop, value, setFunc) => {
        if (value !== null) {
            const { store, onFieldChange } = this.props;
            store.ddStore[setFunc](name, prop, value);
            onFieldChange();
        }
        this.setState({
            showFilterDialog: false
        });
    };

    //  Functions for group properties

    createGroupVisibilityFilterCheckbox = () => {
        const { visible = 'true' } = this.props;

        return this.createFilterCheckbox(
            'visible',
            visible,
            this.onGroupVisibilityCheckboxChange,
            this.onGroupVisibilityFilterClicked(visible)
        );
    };

    onGroupVisibilityCheckboxChange = this.onCheckboxChange(
        this.props.name,
        'visible',
        'setFieldGroupProp',
        false
    );

    onGroupVisibilityFilterClicked = value => {
        const { name, msg, store } = this.props;
        const currentLang = store.settingsStore.currentLang;
        const localisedName = store.settingsStore.getLocalisedValFor(name, currentLang);
        const dialogTitle = `${localisedName} - ${msg('visible')}`;
        return this.onFilterClicked(value, dialogTitle, this.onGroupVisibilityFilterChanged, false);
    };

    onGroupVisibilityFilterChanged = value =>
        this.onFilterChanged(this.props.name, 'visible', value, 'setFieldGroupProp');

    //  Functions for field properties

    createFieldFilterCheckbox = (rec, prop, defaultValue) => {
        let component;
        if (isFieldSeparator(rec.name?.type)) component = null;
        else {
            const { store } = this.props;
            const name = rec.name;
            const value = store.ddStore.getFieldProp({ name }, prop) ?? defaultValue;
            component = this.createFilterCheckbox(
                prop,
                value,
                this.onFieldCheckboxChange(name, prop),
                this.onFieldFilterClicked(name, prop, value)
            );
        }
        return this.renderContent(component, rec);
    };

    onFieldCheckboxChange = (name, prop) =>
        this.onCheckboxChange({ name }, prop, 'setFieldProp', true);

    onFieldFilterClicked = (name, prop, value) => {
        const { msg } = this.props;
        const dialogTitle = `${name} - ${msg(prop)}`;
        return this.onFilterClicked(
            value,
            dialogTitle,
            this.onFieldFilterChanged(name, prop),
            false
        );
    };

    onFieldFilterChanged = (name, prop) => value =>
        this.onFilterChanged({ name }, prop, value, 'setFieldProp');

    // Validator functions

    createValidatorsButton = rec => {
        let component;
        if (isFieldSeparator(rec.name?.type)) component = null;
        else {
            const { store, msg } = this.props;
            const name = rec.name;
            const value = store.ddStore.getFieldProp({ name }, 'validators') ?? [];
            component = (
                <>
                    {msg('validators_num', {
                        count: value.length
                    })}
                    <Button
                        onClick={this.onFieldValidatorButtonClicked(name, value)}
                        size="small"
                        style={{ marginLeft: '8px' }}
                    >
                        ...
                    </Button>
                </>
            );
        }
        return this.renderContent(component, rec);
    };

    onFieldValidatorButtonClicked = (name, value) => {
        const { msg } = this.props;
        const dialogTitle = `${name} - ${msg('validators')}`;
        return this.onFilterClicked(
            value,
            dialogTitle,
            this.onFieldFilterChanged(name, 'validators'),
            true
        );
    };

    // Helper functions

    _parseFilterValue(val) {
        switch (val) {
            case 'true':
            case true:
                return { checked: true, indeterminate: false };

            case 'false':
            case false:
                return { checked: false, indeterminate: false };

            default:
                return { checked: false, indeterminate: true };
        }
    }

    reorder = (dragIndex, hoverIndex) => {
        const { name, store, onFieldChange } = this.props;

        if (this.state.isDefaultGroup) {
            const fields = this.data.map(def => def.name);
            const swap = fields.splice(dragIndex, 1);
            fields.splice(hoverIndex, 0, ...swap);
            store.ddStore.addGroup(name, { fields, expanded: true });
            onFieldChange();
        } else {
            store.ddStore.moveFieldOrderInGroup(name, dragIndex, hoverIndex);
        }
    };

    addField = (fieldName, hoverIndex) => {
        const { name, store, onFieldChange } = this.props;
        if (this.state.isDefaultGroup) {
            // when it is still default group, adding extra field will need to create a group first
            // it could be separator or other additional datas in future.
            const fields = this.data.map(def => def.name);
            store.ddStore.addGroup(name, { fields, expanded: true });
            if (!fields.includes(fieldName)) {
                addField({ name, store }, fieldName, hoverIndex);
            }
        } else {
            addField({ name, store }, fieldName, hoverIndex);
        }

        onFieldChange();
    };

    deleteField = (fieldName, index) => {
        const { name, store, onFieldChange } = this.props;
        if (this.state.isDefaultGroup) {
            const fields = this.data.map(def => def.name).filter(field => field != fieldName);
            store.ddStore.addGroup(name, { fields, expanded: true });
        } else if (isFieldSeparator(fieldName?.type)) {
            store.ddStore.deleteFieldFromGroupByIndex(name, index);
        } else {
            store.ddStore.deleteFieldFromGroup(name, fieldName);
        }
        onFieldChange();
    };
}

const addField = ({ name, store }, fieldName, beforeIndex) => {
    let newField = fieldName;
    if (isFieldSeparator(fieldName)) {
        newField = {
            type: fieldName
        };
    }
    store.ddStore.addFieldToGroup(name, newField, beforeIndex);
};

const fieldTarget = {
    drop(props, monitor) {
        const fieldName = monitor.getItem().name;
        const hoverIndex = props.index;
        props.dropField?.(fieldName, hoverIndex);
    }
};

@DropTarget('fieldName', fieldTarget, (connect, monitor) => ({
    prependDropTarget: connect.dropTarget()
}))
@Reorderable('reorderFieldName')
class Field extends Component {
    render() {
        // eslint-disable-next-line no-unused-vars
        const { reorderableElement, prependDropTarget, dropField, ...restProps } = this.props;
        return prependDropTarget(reorderableElement(<tr {...restProps} />));
    }
}
