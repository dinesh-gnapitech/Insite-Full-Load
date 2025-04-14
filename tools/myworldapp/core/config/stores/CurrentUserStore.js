import { makeObservable, observable, action, runInAction } from 'mobx';
import { RestClient } from './RestClient';

export class CurrentUserStore {
    @observable currentUser = null;

    constructor() {
        makeObservable(this);
    }

    @action async getUser() {
        const res = await RestClient.get('system/username');
        runInAction(() => {
            this.currentUser = res.data.name;
        });
    }

    async hasPermission(right) {}
}
