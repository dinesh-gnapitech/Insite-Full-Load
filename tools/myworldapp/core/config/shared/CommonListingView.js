import React, { Component } from 'react';
import { Card, Button } from 'antd';
import { inject, observer } from 'mobx-react';
import { ScrollableView } from './ScrollableView';
import { SearchInput } from './FieldEditors';
import { utils, LanguageSelect } from '../shared';
import { PlusOutlined } from '@ant-design/icons';

@inject('store')
@observer
export class CommonListingView extends Component {
    state = {
        hasManagePerm: false
    };

    async componentDidMount() {
        const store = this.props.store[this.props.storeName];
        store.getAll(); //no need to await on this call and we want to check permission as soon as possible
        const hasManagePerm = await this.props.store.permissionStore.userHasPermission(
            this.props.resource
        );
        this.setState({ hasManagePerm });
    }

    render() {
        const {
            history,
            store,
            table: Table,
            title,
            storeName,
            msg,
            canAddNew,
            filter,
            owner,
            showLangSelect
        } = this.props;
        const baseStore = store[storeName];
        const { isLoading } = baseStore;
        const addNewBtn =
            typeof canAddNew === 'undefined' || canAddNew ? (
                <Button
                    icon={<PlusOutlined />}
                    type="primary"
                    onClick={() => history.push(`/${this.props.resource}/new`)}
                    disabled={!this.state.hasManagePerm}
                >
                    {msg('add_new')}
                </Button>
            ) : (
                ''
            );
        let count = baseStore.count;
        if (storeName == 'applicationStore') {
            count == 0 ? count : (count -= 1);
        }
        const filteredResults = baseStore.filter(filter).length;
        let filterMsg = '';
        if (filteredResults == 1) {
            filterMsg = utils.getFilterMsg(
                msg,
                store[storeName].collectionWrapper
                    .toLowerCase()
                    .substring(0, store[storeName].collectionWrapper.length - 1),
                filteredResults,
                count
            );
        } else {
            filterMsg = utils.getFilterMsg(
                msg,
                store[storeName].collectionWrapper.toLowerCase(),
                filteredResults,
                count
            );
        }

        const ownerState = owner?.state || {};

        return (
            <Card
                className="myw-list-view"
                title={<span className="list-title">{title}</span>}
                bordered={false}
                extra={
                    <div>
                        <span style={{ display: 'inline-block' }}>{filterMsg}</span>
                        <div style={{ display: 'inline-block', margin: '0 10px' }}>
                            <SearchInput
                                value={this.props.filter}
                                onChange={this.props.onFilterChange}
                                onClear={this.props.onFilterChange}
                            />
                        </div>
                        {showLangSelect && <LanguageSelect />}
                        {addNewBtn}
                    </div>
                }
            >
                <ScrollableView
                    topOffset={this.props.topOffset || 195}
                    bottomOffset={this.props.bottomOffset || 6}
                >
                    <Table
                        loading={isLoading}
                        data={baseStore.filter(filter)}
                        options={this.props.options}
                        sortedColKey={ownerState.sortedColKey}
                        sortOrder={ownerState.sortOrder}
                        onSortingChange={(colKey, sortOrder) =>
                            utils.onSortingChange(colKey, sortOrder, owner)
                        }
                    />
                </ScrollableView>
            </Card>
        );
    }
}
