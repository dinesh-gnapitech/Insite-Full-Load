import { isEqual } from 'underscore';
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import memoize from 'memoize-one';
import { localise, MultiLanguageInput, Picker, GeomTypePickerItems } from '../../../shared';
import { isGeomField, isTitleField } from '../utils';
import { FeatureFieldsTable } from './FeatureFieldsTable';
import { Checkbox, Input } from 'antd';

//Component for the Geometry fields tab of the Feature editor
@withRouter
@inject('store')
@localise('features')
@observer
export class FeatureGeomFields extends Component {
    constructor(props) {
        super(props);

        props.store.layerStore.getAll(); //Get world names

        this.filter = field =>
            (field.isNew && field.fieldType == 'geom') || isGeomField(field) || isTitleField(field);
    }

    render() {
        const { dsType, dsClass } = this.props;
        const columns = this.getColumns(dsType);

        return (
            <FeatureFieldsTable
                filter={this.filter}
                dsClass={dsClass}
                columns={columns}
                fieldType={'geom'}
                sortable={true}
                scrollable={false}
                formatData={this.formatData}
                removeAssociatedFieldFor={this.removeAssociatedFieldFor}
                deleteAssociatedFieldsFor={this.deleteAssociatedFieldsFor}
            />
        );
    }

    /**
     * Adds the orientaion and internal world support info in the associated fields as properties
     * So the info can be shown in their columns in the Geometry fields table
     * @param {Array<object>} data List of geom fields from the database
     * @returns Data to show in the geometry tab table
     */
    formatData = data => {
        const geomTableData = [];
        data.forEach(element => {
            if (element.name === 'myw_geometry_world_name') {
                //The first geom field is the primary geometry field
                const primaryGeomField = data.find(item =>
                    ['point', 'polygon', 'linestring', 'raster'].includes(item.type)
                );
                this._updateTableData(
                    data,
                    geomTableData,
                    primaryGeomField,
                    'internal_world_support'
                );
            } else if (element.name?.startsWith('myw_gwn')) {
                const associatedFieldName = element.name?.slice(8, element.length);
                this._updateTableData(
                    data,
                    geomTableData,
                    data.find(item => item.name === associatedFieldName),
                    'internal_world_support'
                );
            } else if (element.name?.startsWith('myw_orientation')) {
                const associatedFieldName = element.name?.slice(16, element.length);
                this._updateTableData(
                    data,
                    geomTableData,
                    data.find(item => item.name === associatedFieldName),
                    'orientation_support'
                );
            } else if (!geomTableData.find(item => item.name === element.name)) {
                //Add the element in the table data if it isn't already added
                geomTableData.push(element);
            }
        });
        //Update the seq numbers
        geomTableData.forEach((item, index) => (item.seq = index + 1));

        return geomTableData;
    };

    /**
     * Get columns for geometry fields table, result is memoized depended on datasource type
     * @param string dsType         datasource type
     * @returns {Array<object>}     columns config for EditableTable
     */
    getColumns = memoize(dsType => {
        const { msg } = this.props;
        let columns = [
            {
                className: 'table-column-wrapping',
                title: msg('name'),
                dataIndex: 'name',
                key: 'name',
                width: '20%',
                fixed: 'left',
                getInput: record => record.isNew && <Input onMouseDown={e => e.target.focus()} />
            },
            {
                title: msg('external_name'),
                dataIndex: 'external_name',
                component: (
                    <MultiLanguageInput style={{ maxWidth: '300px' }} className={'external_name'} />
                ),
                width: '20%',
                key: 'external_name'
            },
            {
                title: msg('type'),
                dataIndex: 'type',
                key: 'type',
                getInput: record =>
                    record.isNew && (
                        <Picker
                            className="field-type-picker"
                            msg={msg}
                            items={GeomTypePickerItems}
                            id={'type'}
                        />
                    )
            }
        ];

        if (dsType === 'myworld') {
            columns = [
                ...columns,
                ...[
                    {
                        title: msg('mandatory'),
                        dataIndex: 'mandatory',
                        inputType: 'checkbox',
                        className: 'text-center',
                        getInput: record => <Checkbox disabled={!record.editable} />
                    },
                    {
                        title: msg('read_only'),
                        dataIndex: 'read_only',
                        inputType: 'checkbox',
                        className: 'text-center',
                        getInput: record => <Checkbox disabled={!record.editable} />
                    },
                    {
                        title: msg('orientation_support'),
                        dataIndex: 'orientation_support',
                        inputType: 'checkbox',
                        className: 'text-center',
                        //Checkbox disabled for new fields with no name or for fields with type other than point
                        getInput: record => (
                            <Checkbox disabled={!record.name || record.type !== 'point'} />
                        )
                    },
                    {
                        title: msg('internal_world_support'),
                        dataIndex: 'internal_world_support',
                        inputType: 'checkbox',
                        className: 'text-center',
                        getInput: record => <Checkbox disabled={!record.name} /> //disabled for new fields with no name
                    },
                    {
                        title: msg('creates_world_type'),
                        dataIndex: 'creates_world_type',
                        width: '20%',
                        getInput: record => (
                            <Input
                                style={{ width: '100%' }}
                                disabled={
                                    record.type !== 'polygon' || !record.internal_world_support
                                }
                                onMouseDown={e => e.target.focus()}
                            />
                        )
                    }
                ]
            ];
        }
        return columns;
    }, isEqual);

    /*
     * If an item with the associated field name is already in the table data, append to its properties
     * Otherwise add a new item
     * @param {Array<object>} data             List of geom fields from the database
     * @param {Array<object>} geomTableData    List of geom fields as they should be displayed in the table
     * @param {object} associatedGeomField
     * @param {string} propName                'internal_world_support' or 'orientation_support'
     */

    _updateTableData(data, geomTableData, associatedGeomField, propName) {
        const existingItem = geomTableData.find(item => item.name === associatedGeomField.name);
        let obj = {};
        obj[propName] = true;
        if (!existingItem) {
            geomTableData.push(Object.assign(associatedGeomField, obj));
        } else {
            geomTableData.forEach(item => {
                if (item.name === associatedGeomField.name) {
                    Object.assign(item, obj);
                }
            });
        }
    }

    /*
     * Used when the checkbox for the prop is unchecked
     * Removes the related field from the store
     * @param {object} field
     * @param {string} propName             'internal_world_support' or 'orientation_support'
     * @param {boolean} isPrimaryGeomField
     */
    removeAssociatedFieldFor = (field, propName, isPrimaryGeomField) => {
        const fields = this.props.store.ddStore.current.fields;
        if (propName === 'internal_world_support') {
            //If its a primary geom field use 'myw_geometry_world_name' as the name
            if (isPrimaryGeomField) {
                this.props.store.ddStore.deleteField(
                    fields.find(item => item.name === 'myw_geometry_world_name')
                );
            } else {
                this.props.store.ddStore.deleteField(
                    fields.find(item => item.name === `myw_gwn_${field.name}`)
                );
            }
        } else if (propName === 'orientation_support') {
            this.props.store.ddStore.deleteField(
                fields.find(item => item.name === `myw_orientation_${field.name}`)
            );
        }
    };

    /*
     * Used when the geom table row is deleted and we need to delete the fields in the store associated with
     * 'internal_world_support' or 'orientation_support' props
     * @param {object} field
     * @param {boolean} isPrimaryGeomField
     */
    deleteAssociatedFieldsFor = (field, isPrimaryGeomField) => {
        const ddStore = this.props.store.ddStore;
        const fields = ddStore.current.fields;

        //Delete the associated internal world field
        const itemName = isPrimaryGeomField ? 'myw_geometry_world_name' : `myw_gwn_${field.name}`;
        const gwnField = fields.find(item => item.name === itemName);
        if (gwnField) ddStore.deleteField(gwnField);

        //Delete the associated orientation field
        const orientationField = fields.find(item => item.name === `myw_orientation_${field.name}`);
        if (orientationField) ddStore.deleteField(orientationField);
    };
}
