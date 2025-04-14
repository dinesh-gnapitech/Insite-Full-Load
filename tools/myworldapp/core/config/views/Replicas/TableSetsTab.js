import React, { Component } from 'react';
import { CommonListingView } from '../../shared';
import { TableSetsTable } from './TableSetsTable';

export class TableSetsTab extends Component {
    render() {
        const { history, msg } = this.props;
        return (
            <CommonListingView
                title={msg('table_sets')}
                storeName={'tableSetStore'}
                resource="replicas/tableSets"
                table={TableSetsTable}
                history={history}
                msg={msg}
                topOffset={188}
                filter={this.props.filter}
                onFilterChange={this.props.onFilterChange}
            />
        );
    }
}
