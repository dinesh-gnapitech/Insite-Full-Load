import React, { Component } from 'react';
import { DragSource, DropTarget } from 'react-dnd';

/**
 * Wrapper to  make a given component reorderable
 * Component needs to have an 'index' (numeric) prop and and a
 *  'moveRow' (function (dragIndex, hoverIndex)) prop
 *
 */
export const Reorderable = dndType => ComponentToWrap => {
    const Wrapped = class extends Component {
        displayName = 'ReorderableWrap';

        render() {
            const {
                isOver,
                dragRow,
                // eslint-disable-next-line no-unused-vars
                moveRow,
                connectDragSource,
                connectDropTarget,
                clientOffset,
                sourceClientOffset,
                initialClientOffset,
                ...restProps
            } = this.props;
            const style = { ...restProps.style, cursor: 'move' };

            let className = restProps.className || '';
            if (isOver && initialClientOffset) {
                const direction = dragDirection(
                    dragRow.index,
                    restProps.index,
                    initialClientOffset,
                    clientOffset,
                    sourceClientOffset
                );
                if (direction === 'downward') {
                    className += ' drop-over-downward';
                }
                if (direction === 'upward') {
                    className += ' drop-over-upward';
                }
            }
            const reorderableElement = el => connectDragSource(connectDropTarget(el));
            return (
                <ComponentToWrap
                    {...restProps}
                    reorderableElement={reorderableElement}
                    className={className}
                    style={style}
                />
            );
        }
    };

    return DropTarget(dndType, rowTarget, (connect, monitor) => ({
        connectDropTarget: connect.dropTarget(),
        isOver: monitor.isOver(),
        sourceClientOffset: monitor.getSourceClientOffset()
    }))(
        DragSource(dndType, rowSource, (connect, monitor) => ({
            connectDragSource: connect.dragSource(),
            dragRow: monitor.getItem(),
            clientOffset: monitor.getClientOffset(),
            initialClientOffset: monitor.getInitialClientOffset()
        }))(Wrapped)
    );
};

function dragDirection(
    dragIndex,
    hoverIndex,
    initialClientOffset,
    clientOffset,
    sourceClientOffset
) {
    if (dragIndex < hoverIndex) {
        return 'downward';
    }
    if (dragIndex > hoverIndex) {
        return 'upward';
    }
}

const rowSource = {
    beginDrag(props) {
        return {
            index: props.index
        };
    }
};

const rowTarget = {
    drop(props, monitor) {
        const dragIndex = monitor.getItem().index;
        const hoverIndex = props.index;

        // Don't replace items with themselves
        if (dragIndex === hoverIndex) {
            return;
        }

        // Time to actually perform the action
        props.moveRow(dragIndex, hoverIndex);

        // Note: we're mutating the monitor item here!
        // Generally it's better to avoid mutations,
        // but it's good here for the sake of performance
        // to avoid expensive index searches.
        monitor.getItem().index = hoverIndex;
    }
};
