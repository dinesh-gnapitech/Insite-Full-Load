import { makeObservable, observable, action, computed, runInAction, toJS, set } from 'mobx';
import { RestClient } from './RestClient';

export class BaseStore {
    @observable store = {};
    @observable isLoading = false;
    @observable loadedAll = false;
    @observable current = {};
    constructor() {
        makeObservable(this);
        this.uniques = ['name', 'external_name', 'description'];
    }

    @computed get count() {
        return Object.keys(this.store).length;
    }

    /**
     * Public Actions
     */

    @action set(id, data) {
        this.store[id] = data;
    }

    /**
     * Sets current to a object from cache or an empty object
     * @param {string} id    Id to fetch from cache
     */
    @action setCurrent(id) {
        this.current = toJS(this.store[id]) || {};
    }

    @action modifyCurrent(data) {
        this.current = { ...this.current, ...data };
    }

    @action async getAll() {
        runInAction(() => (this.isLoading = true));
        const res = await RestClient.get(this.endpoint).catch(error => {
            if (error.request.status === 401) {
                //Timeout
                window.location.href =
                    'login?message=Your+session+has+timed+out&redirect_to=config';
            }
        });
        runInAction(() => {
            let next = {};
            res.data[this.collectionWrapper].forEach(item => (next[item[this.rowKey]] = item));
            this.store = next;
            set(this, 'isLoading', false);
            this.loadedAll = true;
        });
    }

    @action async get(id) {
        const endpoint = this.individualEndpoint || this.endpoint;
        try {
            const res = await RestClient.get(`${endpoint}/${id}`);
            this._setData(res);
        } catch (e) {
            console.error(e);
            this.set(id, {});
            if (e.request.status === 401) {
                //Timeout
                window.location.href = `login?message=Your+session+has+timed+out&redirect_to=config`;
            }
        }
        return this.store[id];
    }

    //  Set the data in it's own function so that it can be overridden if required in child classes
    _setData(res) {
        this.set(res.data[this.rowKey], res.data);
    }

    beforeSend(data) {
        return data;
    }

    @action async save(data) {
        const endpoint = this.individualEndpoint || this.endpoint;
        const resp = await RestClient.post(endpoint, this.beforeSend(data));
        this.afterSaveHook();
        return resp.data[this.rowKey];
    }

    @action async update(id, data) {
        const endpoint = this.individualEndpoint || this.endpoint;
        await RestClient.put(`${endpoint}/${id}`, this.beforeSend(data));
    }

    @action async delete(id) {
        const endpoint = this.individualEndpoint || this.endpoint;
        await RestClient.delete(`${endpoint}/${id}`);
        runInAction(() => {
            delete this.store[id];
        });
    }

    @action duplicate(id) {
        let next = toJS(this.store[id]);
        this.current = this.beforeCloneHook(next);
    }

    //Hooks

    /**
     * Perform actions before cloning a record
     */
    beforeCloneHook(rec) {
        if (this.uniques) {
            this.uniques.forEach(field => (rec[field] = null));
        }
        return rec;
    }

    /**
     * After save of a new record
     */
    @action afterSaveHook() {
        this.current = {};
    }

    filter(query) {
        return Object.values(this.store).filter(o => {
            const cols = this.filterFields || [];
            for (const key of cols) {
                if ((o[key] || '').toLowerCase().includes(query.toLowerCase())) return true;
            }
            return false;
        });
    }

    setFilter(query) {
        this.query = query;
    }
}
