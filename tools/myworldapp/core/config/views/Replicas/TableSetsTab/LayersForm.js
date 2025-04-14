import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { CommonListingView, localise, utils } from '../../../shared';
import { LayersTable } from './LayersTable';

@inject('store')
@localise('layers')
@observer
export class LayersForm extends Component {
    state = {
        filter: ''
    };

    render() {
        const { history, msg, options, selectedLayers } = this.props;
        return (
            <CommonListingView
                title={msg('layers')}
                storeName={'layerStore'}
                resource="layers"
                table={LayersTable}
                canAddNew={false}
                options={{ ...options, ...{ selectedLayers } }}
                history={history}
                msg={msg}
                topOffset={350}
                bottomOffset={15}
                filter={this.state.filter}
                onFilterChange={value => utils.onFilterChange(value, this)}
            />
        );
    }
}
