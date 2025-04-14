import React, { Component } from 'react';
import { Tag } from 'antd';
import { observer } from 'mobx-react';
import { localise, DraggableList } from '../../shared';
import { DragSource } from 'react-dnd';

@localise('layergroups')
@observer
export class AvailableLayers extends Component {
    componentDidUpdate(prevProps) {
        if (prevProps.changedProp !== this.props.changedProp) {
            this.setState({
                changedProp: this.props.changedProp
            });
        }
    }

    render() {
        const layers = this.props.layers || [];
        const usedLayers = this.props.usedLayers || [];
        let availableLayers = layers.filter(l => l.category == 'overlay');
        const layerNames = availableLayers.map(l => l.name).sort();

        return (
            <DraggableList
                title={this.props.msg('available_layers')}
                subTitle={this.props.msg('drag_to_layers')}
                items={layerNames}
                disabledItems={usedLayers}
                ItemComponent={DragabbleLayerName}
                msg={this.props.msg}
                sort="asc"
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

function LayerName({ index, name, className, connectDragSource }) {
    return connectDragSource(
        <li className={className} key={index}>
            <Tag>{name}</Tag>
        </li>
    );
}

const DragabbleLayerName = DragSource('layerName', dragSource, collect)(LayerName);
