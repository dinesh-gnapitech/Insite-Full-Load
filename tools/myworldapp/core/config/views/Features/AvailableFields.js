import React, { Component } from 'react';
import { Divider, Tag } from 'antd';
import { inject, observer } from 'mobx-react';
import { localise, DraggableList } from '../../shared';
import { DragSource } from 'react-dnd';

import { isCalculatedField, isGeomField } from './utils';

const getFilter = (includeCalculated, includeReferenceSets) => field =>
    (includeReferenceSets ? true : field.type !== 'reference_set') &&
    !field.isNew &&
    !isGeomField(field) &&
    (includeCalculated || !isCalculatedField(field));

@inject('store')
@localise('features')
@observer
export class AvailableFields extends Component {
    constructor(props) {
        super(props);
        this.state = {
            filter: '',
            sorting: null
        };
    }

    render() {
        const {
            extraFields,
            includeSeparator = false,
            titleMsg,
            msg,
            disableUsedInGroups,
            disableAll,
            store,
            includeCalculated = false,
            includeReferenceSets = false,
            fixedPosition = true,
            style = {}
        } = this.props;

        //get fields already in use to include but disabled (greyed out)
        const groups = store.ddStore.current.groups;
        let disabledItems;
        if (disableAll) {
            disabledItems = store.ddStore.current.fields.map(field => field.name);
        } else if (disableUsedInGroups) {
            disabledItems = [...new Set((groups || []).flatMap(group => group.fields))];
        }

        //for the list of (active) fields we need to filter out geom fields and fields already in use
        let fields = store.ddStore.current.fields.filter(
            getFilter(includeCalculated, includeReferenceSets)
        );

        fields = fields.map(field => field.name);

        return (
            <DraggableList
                title={msg('available_fields')}
                subTitle={msg(titleMsg)}
                msg={msg}
                includeSeparator={includeSeparator}
                items={fields}
                extraItems={extraFields}
                ItemComponent={DragabbleFieldName}
                SeparatorComponent={DragabbleSeparator}
                disabledItems={disabledItems}
                fixedPosition={fixedPosition}
                style={style}
            />
        );
    }
}

const dragSource = {
    beginDrag(props) {
        return {
            index: props.index,
            name: props.name
        };
    }
};

function collect(connect, monitor) {
    return {
        connectDragSource: connect.dragSource()
    };
}

function FieldName({ index, name, connectDragSource, className }) {
    return connectDragSource(
        <li key={index} className={className}>
            <Tag>{name}</Tag>
        </li>
    );
}

function Separator({ key, name, connectDragSource, className }) {
    return connectDragSource(
        <div key={key} className={className}>
            <Divider orientation="left">
                <Tag>{name}</Tag>
            </Divider>
        </div>
    );
}

// When fieldName and separator define their own drag source and drop target
// the hover index counting will be separated and can't fix to our use case.
// So, we need to use the same drag source and drop target, ensure we can have
// correct hover index from drag and drop the field and separator in a group with correct order.
const DragabbleFieldName = DragSource('fieldName', dragSource, collect)(FieldName);
const DragabbleSeparator = DragSource('fieldName', dragSource, collect)(Separator);
