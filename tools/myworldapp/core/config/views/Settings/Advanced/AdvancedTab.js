import React, { Component } from 'react';
import { inject } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import { Button, Card } from 'antd';
import { localise, SearchInput, onControlS, utils } from '../../../shared';
import { AdvancedSettingsTable } from './AdvancedTable';
import { PlusOutlined } from '@ant-design/icons';

@inject('store')
@localise('settings')
@withRouter
export class AdvancedTab extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasManagePerm: false
        };
    }

    async componentDidMount() {
        const hasPerm = await this.props.store.permissionStore.userHasPermission('settings');
        this.setState({ hasManagePerm: hasPerm });
        this.onControlSSave = onControlS(this.handleSave);
        document.addEventListener('keydown', this.onControlSSave);
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.onControlSSave);
    }

    onFilterChange = value => {
        const { tabKey, onFilterChange } = this.props;
        const filterVal = value ? value : '';
        onFilterChange(tabKey, filterVal);
    };

    render() {
        const { msg, history, filter, tabKey, sort, onSortingChange } = this.props;
        const settings = this.props.store.settingsStore.store;

        const filterVal = filter?.[tabKey] || '';
        const internalFilterVal = filterVal.toLowerCase(); //Make filter value case insensitive
        const advancedData = Object.entries(settings)
            .map(([name, { type, value }]) => ({ name, type, value }))
            .filter(({ name, type, value }) => {
                if (name.toLowerCase().includes(internalFilterVal)) return true;
                if (type.toLowerCase().includes(internalFilterVal)) return true;
                if (value.toLowerCase().includes(internalFilterVal)) return true;
                return false;
            });
        const totalCount = Object.keys(settings).length;

        let filterMsg = '';
        if (advancedData.length == 1) {
            filterMsg = utils.getFilterMsg(msg, 'setting', advancedData.length, totalCount);
        } else {
            filterMsg = utils.getFilterMsg(msg, 'settings', advancedData.length, totalCount);
        }

        return (
            <Card
                bordered={false}
                className="myw-list-view"
                title={msg('advanced')}
                extra={
                    <div style={{ paddingRight: 24 }}>
                        {
                            <span
                                style={{
                                    display: 'inline-block',
                                    float: 'left',
                                    marginRight: 10,
                                    marginTop: 8
                                }}
                            >
                                {filterMsg}
                            </span>
                        }
                        <SearchInput
                            style={{
                                float: 'left',
                                width: 200,
                                marginRight: 10,
                                minHeight: 'inherit !important'
                            }}
                            value={filterVal}
                            onChange={this.onFilterChange}
                            onClear={this.onFilterChange}
                        />
                        <div style={{ float: 'left', width: 80, marginRight: 10 }}>
                            <Button
                                icon={<PlusOutlined />}
                                type="primary"
                                onClick={() =>
                                    history.push(`/settings/core.advanced/new`, { trigger: true })
                                }
                                disabled={!this.state.hasManagePerm}
                            >
                                {msg('add_new_btn')}
                            </Button>
                        </div>
                    </div>
                }
            >
                <AdvancedSettingsTable
                    data={advancedData}
                    filter={filterVal}
                    sort={sort[tabKey]}
                    tabKey={tabKey}
                    onSortingChange={onSortingChange}
                />
            </Card>
        );
    }

    handleSave() {
        //do thing
        //ENH: show a message to select one entry and edit it
    }
}
