import React, { Component } from 'react';
import { CommonListingView, localise } from '../../shared';
import { LayerGroupTable } from './LayerGroupTable';

@localise('layergroups')
export class LayerGroupsTab extends Component {
    state = {
        filter: ''
    };

    render() {
        const { history, msg, filter, onFilterChange } = this.props;
        return (
            <CommonListingView
                title={msg('layergroups')}
                storeName={'layerGroupStore'}
                resource="layers/layergroups"
                table={LayerGroupTable}
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
