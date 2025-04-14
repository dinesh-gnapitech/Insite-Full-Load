import { BaseStore } from './BaseStore';
import { RestClient } from './RestClient';
import CryptoJS from 'crypto-js';

export class UserStore extends BaseStore {
    constructor(store) {
        super();

        this.endpoint = 'config/user';
        this.collectionWrapper = 'users';
        this.filterFields = ['username', 'email', 'roles'];
        this.rowKey = 'id';
        this.uniques = ['id', 'username', 'password', 'email'];
        this.nameField = 'username';
        this.roleStore = store.roleStore;
        this.roleStore.getAll();
    }

    async save(data) {
        data.username = data.username.trim();
        data.password = CryptoJS.MD5(data.password.trim()).toString();
        return super.save(data);
    }

    async update(id, data) {
        if (data.password === 'xxxxxx') {
            delete data.password;
        } else {
            data.password = CryptoJS.MD5(data.password.trim()).toString();
        }
        await RestClient.put(`${this.endpoint}/${id}`, data);
    }

    roleIdsToNames = roleIds => {
        const roles = this.roleStore.store;
        return roleIds
            .map(id => roles[id].name)
            .sort()
            .join(',');
    };

    /*
     * Over-riding the super so we can filter on the roles column
     */
    filter(query) {
        return Object.values(this.store).filter(o => {
            const cols = this.filterFields || [];
            for (const key of cols) {
                let data = o[key] || '';
                if (key === 'roles') {
                    data = this.roleIdsToNames(o[key]);
                }
                if (data.toLowerCase().includes(query.toLowerCase())) return true;
            }
            return false;
        });
    }
}
