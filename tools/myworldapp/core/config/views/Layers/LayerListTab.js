import React, { Component } from 'react';
import { CommonListingView } from '../../shared';
import { LayersTable } from './LayersTable';

export class LayerListTab extends Component {
    state = {
        filter: ''
    };

    render() {
        const { history, msg, filter, onFilterChange } = this.props;
        return (
            <CommonListingView
                title={msg('layers')}
                storeName={'layerStore'}
                resource="layers"
                table={LayersTable}
                history={history}
                msg={msg}
                topOffset={190}
                bottomOffset={5}
                filter={filter}
                onFilterChange={onFilterChange}
                showLangSelect={true}
            />
        );
    }
}
