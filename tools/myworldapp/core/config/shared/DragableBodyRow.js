import React from 'react';
import { Reorderable } from './Reorderable';

/*To be used in a table such as:
import { DragDropContext} from 'react-dnd';
import HTML5Backend from 'react-dnd-html5-backend';
@DragDropContext(HTML5Backend)
class DragableTable extends React.Component {
    render() {
        const components = {
            body: {
                row: EditableFormRow
            }
        };
        return (
            <Table 
                {...this.props}
                components={components}
                onRow={(record, index) => ({
                    index,
                    moveRow: this.props.moveRow,
                })}
            />
        );
    }
}
*/

@Reorderable('tableRow')
export default class DragableBodyRow extends React.Component {
    render() {
        const { reorderableElement, ...restProps } = this.props;
        return reorderableElement(<tr {...restProps} />);
    }
}
