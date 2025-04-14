import React, { Component } from 'react';
import { Alert, Radio } from 'antd';
import { inject, observer } from 'mobx-react';
import { CommonListingView, utils } from '../../shared';
import { DownloadsTable } from './DownloadsTable';
import { ByRolesTable } from './ByRolesTable';

@inject('store')
@observer
export class DownloadsTab extends Component {
    state = {
        filter: ''
    };
    componentDidMount() {
        this.props.store.settingsStore.get('replication.download_root');
    }

    render() {
        const { history, msg, downloadsMode, onDownloadsModeChange } = this.props;
        const dwRoot = this.props.store.settingsStore.store['replication.download_root'];
        const showTable = dwRoot?.value;
        const dataTable = downloadsMode === 'by_extracts' ? DownloadsTable : ByRolesTable;
        const storeName = downloadsMode === 'by_extracts' ? 'extractStore' : 'extractRoleStore';

        this.props.store[storeName].getAll(); //ENH: Hack since the commonListingView does not run its componentDidMount() after our tab changes
        if (showTable)
            return (
                <CommonListingView
                    title={
                        <Radio.Group value={downloadsMode}>
                            <Radio.Button
                                value="by_extracts"
                                onClick={onDownloadsModeChange.bind(this, 'by_extracts')}
                                title={msg('summary')}
                            >
                                By Extracts
                            </Radio.Button>

                            <Radio.Button
                                value="by_roles"
                                onClick={onDownloadsModeChange.bind(this, 'by_roles')}
                                title={msg('basic')}
                            >
                                By Roles
                            </Radio.Button>
                        </Radio.Group>
                    }
                    storeName={storeName}
                    resource="downloads/by_extracts"
                    table={dataTable}
                    history={history}
                    msg={msg}
                    canAddNew={false}
                    topOffset={188}
                    filter={this.state.filter}
                    onFilterChange={value => utils.onFilterChange(value, this)}
                />
            );
        else
            return (
                <Alert
                    message={msg('set_download_root_setting')}
                    style={{ margin: '20px' }}
                    type="warning"
                />
            );
    }
}
