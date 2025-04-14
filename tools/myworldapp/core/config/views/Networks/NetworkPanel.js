import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { NetworkForm } from './NetworkForm';
import { localise } from '../../shared';

//network new/edit page, including both Properties and Features tabs
//this components fetches the data and passes it to the actual form.
//it isn't merged with NetworkForm as that mapPropsToFields isn't called when
//store's 'current' changes

@inject('store')
@localise('networks')
@observer
export class NetworkPanel extends Component {
    async componentDidMount() {
        const { store, edit, match } = this.props;
        if (edit) {
            await store.networkStore.get(match.params.id);
            await store.networkStore.setCurrent(match.params.id);
        } else {
            await store.networkStore.setCurrent(null);
        }
        await store.myWorldStore.getFields();
    }

    //TODO: Check if this is required
    // async getSnapshotBeforeUpdate(prevProps) {
    //     if (this.props.edit && this.props.match.params.id != prevProps.match.params.id) {
    //         await this.props.store.networkStore.get(this.props.match.params.id);
    //         await this.props.store.networkStore.setCurrent(this.props.match.params.id);
    //     }
    // }

    render() {
        let data = this.props.store.networkStore.current;
        const { store } = this.props;

        return (
            <NetworkForm
                {...this.props}
                data={data}
                networkStore={store.networkStore}
                myWorldStore={store.myWorldStore}
                resource={'networks'}
            />
        );
    }
}
