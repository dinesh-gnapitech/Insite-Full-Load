import React, { Component } from 'react';
import { CommonListingView, utils } from '../../shared';
import { ExtractsTable } from './ExtractsTable';

export class ExtractsTab extends Component {
    state = {
        filter: ''
    };

    render() {
        const { history, msg } = this.props;
        return (
            <CommonListingView
                title={msg('extracts')}
                storeName={'extractStore'}
                resource="extracts"
                table={ExtractsTable}
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
