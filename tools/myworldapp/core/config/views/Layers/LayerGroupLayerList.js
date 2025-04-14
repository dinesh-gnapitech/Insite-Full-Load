import React, { Component } from 'react';
import { List } from 'antd';
import { observer } from 'mobx-react';
import { localise } from '../../shared';
import { Reorderable } from '../../shared/Reorderable';
import { DropTarget } from 'react-dnd';
import { DeleteOutlined } from '@ant-design/icons';

const listContainerTarget = {
    drop(props, monitor, component) {
        //called when layer name is dropped on (empty) list container
        const layerName = monitor.getItem().name;
        const hoverIndex = props.index;
        addLayer(props, layerName, hoverIndex);
    }
};

/* Component to display the list of layers on a Layer group
 * Elements can be reordered by DnD, and new layers can be dragged onto the existing ones
 */
@DropTarget('layerName', listContainerTarget, (connect, monitor) => ({
    prependDropTarget: connect.dropTarget()
}))
@localise('layergroups')
@observer
export class LayerGroupLayerList extends Component {
    render() {
        const layerNames = this.props.value || [''];
        //Add a blank item to the array (if it does not exist)
        //The blank row is used to add new layers to the bottom of the list
        if (layerNames[layerNames.length - 1] !== '') layerNames.push('');

        return this.props.prependDropTarget(
            <div className="layer-group-list">
                <List
                    dataSource={layerNames}
                    bordered
                    renderItem={(layerName, index) => (
                        <List.Item>
                            <LayerName
                                key={index}
                                index={index}
                                name={layerName}
                                moveRow={this.reorder}
                                dropField={this.addLayer}
                                onRemove={this.removeLayer}
                            />
                        </List.Item>
                    )}
                />
            </div>
        );
    }

    reorder = (index, beforeIndex) => {
        const layerNames = [...this.props.value];
        const movingEl = layerNames.splice(index, 1); //remove the element that is moving
        //If the hover is on the last element (blank), move the dragged element on top of the blank row
        if (beforeIndex === layerNames.length) --beforeIndex;
        layerNames.splice(beforeIndex, 0, movingEl[0]); //add the element in the new position
        const onChange = this.props.onChange;
        onChange?.(layerNames);
    };

    addLayer = (layerName, beforeIndex) => {
        addLayer(this.props, layerName, beforeIndex);
        this.props.onLayerChange();
    };

    removeLayer = (layerName, index) => {
        removeLayer(this.props, layerName, index);
        this.props.onLayerChange();
    };
}

const addLayer = ({ value, onChange }, layerName, beforeIndex) => {
    const layerNames = [...value];
    if (layerNames.includes(layerName)) return; //don't add duplicates
    layerNames.splice(beforeIndex, 0, layerName); //add the element in the new position
    onChange?.(layerNames);
};

const removeLayer = ({ value, onChange }, layerName, index) => {
    const layerNames = [...value];
    layerNames.splice(index, 1); //delete the element from the given position
    onChange?.(layerNames);
};

/* Component for the layer name in the list
 * reorderable and drop target for when the user drags an available layer
 */

const layerTarget = {
    //calledn when user drags an available layer onto a layer name already on the group
    drop(props, monitor, component) {
        const layerName = monitor.getItem().name;
        const hoverIndex = props.index;
        props.dropField(layerName, hoverIndex);
    }
};
@DropTarget('layerName', layerTarget, (connect, monitor) => ({
    prependDropTarget: connect.dropTarget()
}))
@Reorderable('reorderLayerName')
class LayerName extends Component {
    render() {
        const {
            index,
            name,
            prependDropTarget,
            reorderableElement,
            onRemove,
            className = ''
        } = this.props;
        return prependDropTarget(
            reorderableElement(
                <span
                    className={`layer-group-item ${className}`}
                    style={{ width: '100%', height: '100%' }}
                    key={index}
                >
                    <div className="delete-row-btn" onClick={() => onRemove(name, index)}>
                        <DeleteOutlined className="hidden" />
                    </div>
                    <span className="test-no-print">{name}</span>
                </span>
            )
        );
    }
}
