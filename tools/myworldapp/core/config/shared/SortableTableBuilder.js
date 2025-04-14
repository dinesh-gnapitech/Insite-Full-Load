import React, { Component } from 'react';
import { Table } from 'antd';

export class SortableTableBuilder extends Component {
    render() {
        this.addSortingToColumns();
        return (
            <Table
                {...this.props}
                onChange={(pagination, filters, sorter) => {
                    this.props.onSortingChange &&
                        this.props.onSortingChange(sorter.columnKey, sorter.order);
                }}
            />
        );
    }

    addSortingToColumns() {
        const { columns, sortOrder, sortedColKey } = this.props;
        let hasDefaultSortOrder = false;
        for (const column of columns) {
            let key = column.key;

            if (sortedColKey && sortOrder) {
                column.sortOrder = sortedColKey === column.key && sortOrder;
            }

            //set flag if any column has defaultSortOrder
            if (column.defaultSortOrder) hasDefaultSortOrder = true;

            if (column.key && !column.sorter) {
                if (column.type === 'number') {
                    column.sorter = (a, b) => {
                        //sort number
                        const aVal = a[key];
                        const bVal = b[key];
                        return aVal - bVal;
                    };
                } else if (column.type === 'boolean') {
                    column.sorter = (a, b) => {
                        //sort booleans
                        const aVal = a[key];
                        const bVal = b[key];
                        return aVal === bVal ? 0 : aVal ? -1 : 1;
                    };
                } else if (column.type === 'alphaNumeric') {
                    //sort alphanumeric strings
                    column.sorter = (a, b) => {
                        const reA = /[^a-zA-Z]/g; //alphabet regex
                        const reN = /[^0-9]/g; //numeric regex
                        //only alaphabetical string
                        const aA = a[key] ? a[key].replace(reA, '') : '';
                        const bA = b[key] ? b[key].replace(reA, '') : '';
                        if (aA === bA) {
                            //If strings are the same without numbers, sort by numbers
                            const aN = parseInt(a[key].replace(reN, ''), 10);
                            const bN = parseInt(b[key].replace(reN, ''), 10);
                            return aN === bN ? 0 : aN > bN ? 1 : -1;
                        } else {
                            return aA > bA ? 1 : -1;
                        }
                    };
                } else {
                    //sort strings
                    column.sorter = (a, b) => {
                        const aVal = (a[key] || '').toUpperCase();
                        const bVal = (b[key] || '').toUpperCase();
                        if (aVal < bVal) {
                            return -1;
                        }
                        if (aVal > bVal) {
                            return 1;
                        }
                        // strings must be equal
                        return 0;
                    };
                }
            }
        }
        //If no column has a default sort order, set ascending on first column
        if (!hasDefaultSortOrder) columns[0].defaultSortOrder = 'ascend';
    }
}
