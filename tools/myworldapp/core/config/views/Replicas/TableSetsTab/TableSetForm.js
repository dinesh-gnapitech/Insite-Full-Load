import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { localise } from '../../../shared';
import { TableSetPage } from './TableSetPage';

@inject('store')
@localise('replicas')
@observer
export class TableSetFormComponent extends Component {
    async componentDidMount() {
        if (this.props.edit) {
            await this.props.store.tableSetStore.get(this.props.match.params.name);
            await this.props.store.tableSetStore.setCurrent(this.props.match.params.name);
        } else if (!this.props.store.tableSetStore.current.isDuplicate) {
            await this.props.store.tableSetStore.setCurrent(null);
        }
    }

    async componentDidUpdate(prevProps) {
        if (this.props.edit && this.props.match.params.name != prevProps.match.params.name) {
            await this.props.store.tableSetStore.get(this.props.match.params.name);
            await this.props.store.tableSetStore.setCurrent(this.props.match.params.name);
        }
    }

    render() {
        const { resource, resourceName, store } = this.props;
        let data = store.tableSetStore.current || {};

        return (
            <TableSetPage
                {...this.props}
                data={data}
                tableSetStore={store.tableSetStore}
                resource={resource}
                resourceName={resourceName}
            />
        );
    }
}
