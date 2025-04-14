import myw from 'myWorld-base';
import React, { Component } from 'react';
import { Button } from 'antd';
import { inject, observer } from 'mobx-react';
import { localise, EditableTable, PopConfirm } from '../../../shared';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

//Generic component to display and edit a list of fields.
//Used by Geometry, Calculated and Stored Fields tabs of the feature editor
@inject('store')
@localise('features')
@observer
export class FeatureFieldsTable extends Component {
    constructor() {
        super();
        this.state = {
            height: 200
        };
    }
    /**
     * Add event listener
     */
    componentDidMount() {
        this.updateTableDimensions();
        window.addEventListener('resize', this.updateTableDimensions);
    }

    /**
     * Remove event listener
     */
    componentWillUnmount() {
        window.removeEventListener('resize', this.updateTableDimensions);
    }

    render() {
        const {
            msg,
            columns,
            loading,
            store,
            filter,
            sortable,
            fieldType,
            scrollable = true,
            formatData,
            dsClass
        } = this.props;
        const { editable, fields } = store.ddStore.current;

        const cols = [
            {
                title: msg('seq'),
                dataIndex: 'seq',
                width: '60px',
                className: 'text-center',
                type: 'number',
                render: (text, field) => (
                    <div className="seq-cell">
                        {field.seq}
                        <PopConfirm
                            title={msg('delete_field_msg', { name: field.name })}
                            onConfirm={this.deleteField.bind(this, field)}
                            onConfirmCheck={this.handleDeleteRequireConfirm}
                        >
                            <span className="delete-row-btn hidden">
                                <DeleteOutlined />
                            </span>
                        </PopConfirm>
                    </div>
                ),
                fixed: 'left'
            },
            ...columns
        ];

        const filteredFields = fields.filter(filter).map((f, index) => {
            const field = {
                seq: index + 1,
                ...f,
                editable,
                // using dataKey as rowKey for antd Table
                // user filling `name` field, the row key will be changed
                // react will need rendering an new element
                // user will lose focus from input
                dataKey: f.isNew ? `${index}:new` : `${index}:${f.name}`
            };
            if (field.range) {
                field.min_value = field.range[0];
                field.max_value = field.range[1];
            }
            return field;
        });

        this.data = formatData ? formatData(filteredFields) : filteredFields;

        const includeAddField =
            fieldType === 'calculated' ||
            (fieldType === 'stored' && dsClass?.supportsFeatureUpdating) ||
            (fieldType === 'geom' && dsClass?.supportsMultiGeomFields);
        return (
            <div style={{ margin: '10px 10px 0' }}>
                <EditableTable
                    className="feature-fields-table myw-list-view fixedWidthTable"
                    columns={cols}
                    dataSource={this.data}
                    loading={loading}
                    rowKey="dataKey"
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    scroll={
                        //  There is currently a bug that causes the 'no data' message to render incorrectly when scroll is set
                        //  So check that we actually have data as well to bypass this
                        scrollable && this.data.length ? { x: 1700, y: this.state.height } : null
                    }
                    moveRow={this.moveRow}
                    onFieldsChange={this.setFieldProp}
                    sortable={sortable}
                />
                {includeAddField && (
                    <Button
                        className="add-field-btn"
                        icon={<PlusOutlined />}
                        onClick={() => this.addField(fieldType)}
                    >
                        {msg('add_field')}
                    </Button>
                )}
            </div>
        );
    }

    /**
     * Calculate & Update state of new dimensions
     */
    updateTableDimensions = () => {
        const update_height = window.innerHeight - 370;
        this.setState({ height: update_height });
    };

    // updates the value for the given field/prop in the store
    setFieldProp = async (index, field, propName, value) => {
        if (propName == 'min_value') {
            propName = 'range';
            value = this.getRangeValue(field, 0, value);
        } else if (propName == 'max_value') {
            propName = 'range';
            value = this.getRangeValue(field, 1, value);
        }
        const { store, removeAssociatedFieldFor } = this.props;

        if (field.name && ['internal_world_support', 'orientation_support'].includes(propName)) {
            const isPrimaryGeomField = this.isPrimaryGeomField(field);
            if (value === true) this.createAssociatedFieldFor(field, propName, isPrimaryGeomField);
            else removeAssociatedFieldFor?.(field, propName, isPrimaryGeomField);
        } else {
            store.ddStore.setFieldProp(field, propName, value);
        }

        this.afterSetFieldProp(field, propName, value);

        if (['internal_world_support', 'type', 'enum'].includes(propName)) this.forceUpdate();
    };

    /*
     * Callback that will be called after set field prop
     * @param {object} field
     * @param {string} propName
     * @param {boolean|string|object} value
     */
    afterSetFieldProp = (field, propName, value) => {
        switch (propName) {
            // limitation of geometry fields, a field can't be both mandatory and readonly.
            // If one of them is chosen, the other one will be unchecked in Config page.
            case 'mandatory':
            case 'read_only': {
                const targetPropName = propName === 'mandatory' ? 'read_only' : 'mandatory';
                if (value === true && field[targetPropName] === true) {
                    this.props.store.ddStore.setFieldProp(field, targetPropName, false);
                }
                break;
            }
            default:
                break;
        }
    };

    /*
     * Used when the checkbox for the prop is checked
     * @param {object} field
     * @param {string} propName             'internal_world_support' or 'orientation_support'
     * @param {boolean} isPrimaryGeomField
     */
    createAssociatedFieldFor(field, propName, isPrimaryGeomField) {
        let name, type;
        if (propName === 'internal_world_support') {
            name = isPrimaryGeomField ? 'myw_geometry_world_name' : `myw_gwn_${field.name}`;
            type = 'string(100)';
        } else if (propName === 'orientation_support') {
            name = `myw_orientation_${field.name}`;
            type = 'double';
        }

        const newField = this.props.store.ddStore.addField('geom'); //create a new field
        this.setFieldProp(newField.index, newField, 'name', name); //set its name
        this.setFieldProp(newField.index, newField, 'type', type); //set its type
    }

    getRangeValue(field, index, value) {
        const range = [
            ...(this.props.store.ddStore.current.fields.find(f => f.name == field.name).range || [])
        ];
        if (value) range[index] = value;
        else range.splice(index, 1);
        return range;
    }

    handleDeleteRequireConfirm = async () => {
        const currentFeature = this.props.store.ddStore.current;
        const count = await this.props.store.ddStore.count(
            currentFeature.datasource,
            currentFeature.name
        );
        return count > 0;
    };

    addField = async fieldType => {
        this.props.store.ddStore.addField(fieldType);
        this.addedField = true;
        this.forceUpdate();
        await myw.Util.delay(1); //Give table time to add new row
        this.scrollToBottom();
    };

    scrollToBottom() {
        const tableDiv =
            document.getElementsByClassName('ant-table-body')[0] ||
            document.getElementsByClassName('ant-table-tbody')[0];
        tableDiv.scrollTop = tableDiv.scrollHeight;
    }

    moveRow = (dragIndex, hoverIndex) => {
        this.props.store.ddStore.moveFieldOrder(this.data[dragIndex], this.data[hoverIndex]);
        this.forceUpdate();
    };

    deleteField = field => {
        this.props.deleteAssociatedFieldsFor?.(field, this.isPrimaryGeomField(field));
        this.props.store.ddStore.deleteField(field);
        this.forceUpdate();
    };

    isPrimaryGeomField(field) {
        //A primary geom field is the first geom field in this.data
        const primaryGeomField = this.data.find(item =>
            ['point', 'polygon', 'linestring', 'raster'].includes(item.type)
        );
        return primaryGeomField.name === field.name;
    }
}
