import React, { useEffect, useMemo, useState } from 'react';
import { isEqual } from 'underscore';
import { Table, Form, Input, InputNumber, Checkbox, Skeleton } from 'antd';
import DragableBodyRow from './DragableBodyRow';
import { SortableTableBuilder } from './SortableTableBuilder';

// default shouldCellUpdate checking with deep comparison
const compareRecord = (record, prevRecord) => {
    return !isEqual(record, prevRecord);
};

/*
    Exports EditableTable:
    Table based on antd's table, where rows are antd forms.
    A onFieldsChange callback needs to be passed in as a prop
    If moveRow callback is passed as a prop, rows can be reordered by dragging

    antd `Table` normally fully renders to prevent sync issue.
    Using shouldCellUpdate prevents cells re-rendering unnecessarily.
    This is default behaviour of EditableTable, cells will only be updated if any change of records
    For different behaviour, please pass your function as shouldCellUpdate props.
*/
export const EditableTable = function EditableTable(props) {
    const numOfRowsForSkeletonLoading = 25;
    const {
        columns,
        dataSource,
        onFieldsChange,
        sortable,
        loading,
        locale = {},
        moveRow,
        _onRowClick,
        shouldCellEditable = true,
        shouldCellUpdate = compareRecord
    } = props;
    const [initialLoad, setInitialLoad] = useState(true);

    const mappedColumns = useMemo(
        () =>
            columns.map(col => {
                col.key = col.dataIndex;
                if (col.editable == false) return col;

                return {
                    shouldCellUpdate,
                    ...col,
                    onCell: record => ({
                        ...col,
                        editing: true,
                        record,
                        onFieldsChange: onFieldsChange?.bind(
                            this,
                            null,
                            record,
                            col.key || col.dataIndex
                        )
                    })
                };
            }),
        [columns, onFieldsChange]
    );

    // Support showing skeleton in initial load, need to set state with timeout.
    // Otherwise, the skeleton will not able to be shown.
    useEffect(() => {
        const initialLoadTimer = setTimeout(() => {
            setInitialLoad(false);
        }, 1);

        return () => {
            clearTimeout(initialLoadTimer);
        };
    }, []);

    // first rendering of large dataset is slow with antd `Table`
    // will block parent rendering sequence.
    // Showing skeleton as placeholder initially to unblock the rendering sequence
    const showSkeleton = initialLoad && dataSource.length > numOfRowsForSkeletonLoading;
    const mergedDataSource = showSkeleton ? [] : dataSource;
    const mergedLoading = showSkeleton || loading;
    const mergedLocale = showSkeleton
        ? {
              ...locale,
              emptyText: <EditableTableSkeleton />
          }
        : locale;

    const components = {
        body: {
            row: EditableFormRow,
            cell: shouldCellEditable ? EditableCell : NonUpdatingEditableCell
        }
    };
    const TableEl = sortable ? SortableTableBuilder : Table;

    return (
        <TableEl
            {...props}
            columns={mappedColumns}
            components={components}
            dataSource={mergedDataSource}
            loading={mergedLoading}
            locale={mergedLocale}
            rowClassName="editable-row"
            onRow={(record, index) => ({
                index,
                record,
                moveRow: moveRow,
                onClick: _onRowClick // had to use '_' since onRowClick is a deprecated Ant design method
            })}
        />
    );
};

//create an editable (form) row based on the dragable row
const EditableContext = React.createContext();
const EditableFormRow = ({ moveRow, current, ...props }) => {
    const [form] = Form.useForm();

    //moveRow can't be passed on to <tr>
    return (
        <EditableContext.Provider value={form}>
            {moveRow ? <DragableBodyRow {...{ moveRow, ...props }} /> : <tr {...props} />}
        </EditableContext.Provider>
    );
};

class EditableCell extends React.Component {
    static contextType = EditableContext;
    getInput = prefetchedInput => {
        const { record, dataIndex, component, inputType, onFieldsChange } = this.props;
        let inputComponent;
        if (component) inputComponent = component;
        else if (prefetchedInput) inputComponent = prefetchedInput;
        else if (inputType === 'number') inputComponent = <InputNumber value={record[dataIndex]} />;
        else if (inputType === 'checkbox')
            inputComponent = <Checkbox checked={record[dataIndex]} />;
        else {
            //string
            inputComponent = (
                <Input onMouseDown={e => e.target.focus()} value={record[dataIndex]} />
            );
        }

        //Add value and onChange to component props
        const additionalProps = {
            name: dataIndex
        };
        const valueKey = inputType === 'checkbox' ? 'checked' : 'value';
        additionalProps[valueKey] = get(record, dataIndex);
        if (onFieldsChange) additionalProps.onChange = this.onFieldsChange;

        return React.cloneElement(inputComponent, additionalProps);
    };

    onFieldsChange = valOrEvent => {
        let value = valOrEvent;
        if (valOrEvent?.currentTarget) value = valOrEvent.currentTarget.value;
        else if (valOrEvent?.target) value = valOrEvent.target.checked;

        const { onFieldsChange } = this.props;

        onFieldsChange(value);
    };

    render() {
        const {
            editing,
            inputType,
            record,
            component,
            getInput,
            // eslint-disable-next-line no-unused-vars
            render,
            // eslint-disable-next-line no-unused-vars
            onFieldsChange,
            // eslint-disable-next-line no-unused-vars
            dataIndex,
            ...restProps
        } = this.props;

        const input = getInput?.(record);
        const isFormItem = editing && (inputType || component || input);

        return isFormItem ? (
            <td {...restProps}>{this.getInput(input)}</td>
        ) : (
            <td {...restProps}>{restProps.children}</td>
        );
    }
}

class NonUpdatingEditableCell extends EditableCell {
    shouldComponentUpdate(nextProps, nextState) {
        return false;
    }
}

// a placeholder showing in EditabledTable
const EditableTableSkeleton = () => (
    <Skeleton
        className="myw-editable-skeleton"
        paragraph={{ rows: 4, width: '100%' }}
        size="small"
        title={false}
    />
);
//Gets the value at path of object. If the resolved value is undefined, the defaultValue is returned in its place.
const get = (obj, path, defaultValue) => {
    const travel = regexp =>
        String.prototype.split
            .call(path, regexp)
            .filter(Boolean)
            .reduce((res, key) => (res !== null && res !== undefined ? res[key] : res), obj);
    const result = travel(/[,[\]]+?/) || travel(/[,[\].]+?/);
    return result === undefined || result === obj ? defaultValue : result;
};
