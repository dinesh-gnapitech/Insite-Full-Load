import React, { Component } from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { localise } from '../../../shared';
import { FeatureFieldGroup } from './FeatureFieldGroup';
import { AvailableFields } from '../AvailableFields';
import { isGeomField } from '../utils';
import { EditorOptions } from '../EditorOptions';

@inject('store')
@localise('features')
@observer
export class FeatureFieldGroups extends Component {
    render() {
        const { msg, store } = this.props;
        const current = store.ddStore.current;
        const { groups, editable } = current;
        const expandedByDefault = groups.length <= 1;
        const useDefaultGroup = groups.length === 0;

        const FieldGroupElement = (groupProps, index, onDelete) => {
            const isDefaultGroup = groupProps === null;
            return (
                <FeatureFieldGroup
                    {...(isDefaultGroup ? { name: msg('default') } : groupProps)}
                    index={index}
                    key={`${index}_of_${groups.length}`} // So the group is destroyed when a field group is deleted
                    moveRow={this.moveRow}
                    data={current}
                    onDelete={isDefaultGroup ? null : e => this.deleteGroup(groupProps.name, e)}
                    onFieldChange={this.update}
                    expandedByDefault={expandedByDefault}
                    featureIsEditable={editable}
                    isDefaultGroup={isDefaultGroup}
                />
            );
        };

        return (
            <div style={{ position: 'relative' }}>
                <div className="feature-edit-fieldset values-field-editor">
                    {editable ? <EditorOptions /> : null}
                    <div className="input-container">
                        {useDefaultGroup
                            ? FieldGroupElement(null, 0)
                            : groups.map((group, index) => FieldGroupElement(group, index))}
                    </div>
                    <div className="controls-container">
                        <Button
                            icon={<PlusOutlined />}
                            onClick={this.addGroup}
                            title={msg('add_value_btn')}
                        />
                    </div>
                </div>

                <AvailableFields
                    titleMsg={'drag_for_field'}
                    includeSeparator={true}
                    includeCalculated={true}
                    includeReferenceSets={true}
                    disableUsedInGroups={true}
                    disableAll={useDefaultGroup}
                />
            </div>
        );
    }

    /**
     * Generates a unique group name
     * @return {string} Group name that is not already being used for this feature
     */
    _getUniqueName() {
        const groups = this.props.store.ddStore.current.groups;
        const { msg } = this.props;
        let uniqueIndex = groups.length + 1;
        let uniqueName = msg('group') + ' ' + uniqueIndex;

        groups.forEach(function (group) {
            if (group.name === uniqueName) {
                uniqueIndex++; //group name exists so increment the index to try out a new name
                uniqueName = msg('group') + ' ' + uniqueIndex;
            }
        });
        return uniqueName;
    }

    addGroup = () => {
        const { store, msg } = this.props;

        const groups = store.ddStore.current.groups;

        //  If we are showing only the default group, convert that to a normal group first
        if (!groups.length) {
            const fields = store.ddStore.current.fields
                .filter(field => !isGeomField(field))
                .map(def => def.name);

            const opts = {
                fields,
                expanded: true
            };
            store.ddStore.addGroup(msg('default'), opts);
        }

        store.ddStore.addGroup(this._getUniqueName());
        this.forceUpdate();
    };

    deleteGroup = (groupName, e) => {
        e.stopPropagation();
        this.props.store.ddStore.removeGroup(groupName);
        this.forceUpdate();
    };

    moveRow = (dragIndex, hoverIndex) => {
        this.props.store.ddStore.moveFieldGroupOrder(dragIndex, hoverIndex);
    };

    update = () => {
        this.forceUpdate();
    };
}
