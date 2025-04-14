import React, { Component } from 'react';
import { CommonListingView, utils } from '../../shared';
import { ReplicasTable } from './ReplicasTable';

export class ReplicasTab extends Component {
    state = {
        filter: ''
    };

    render() {
        const { history, msg } = this.props;
        return (
            <CommonListingView
                title={msg('replicas')}
                storeName={'replicaStore'}
                resource="replicas"
                table={ReplicasTable}
                history={history}
                msg={msg}
                canAddNew={false}
                topOffset={188}
                filter={this.state.filter}
                onFilterChange={value => utils.onFilterChange(value, this)}
            />
        );
    }
}
