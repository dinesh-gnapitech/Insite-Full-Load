import { RestClient } from './RestClient';
import { BaseStore } from './BaseStore';

export class ExtractRoleStore extends BaseStore {
    constructor() {
        super();

        this.endpoint = 'config/extract_role';
        this.collectionWrapper = 'roles';
        this.filterFields = ['name'];
        this.rowKey = 'name';
        this.extractsForAll = [];
    }

    async get(id) {
        const endpoint = this.individualEndpoint || this.endpoint;
        try {
            const res = await RestClient.get(`${endpoint}/${id}`);
            const extractByRole = res.data['roles'].find(item => item.name === id);
            this.set(extractByRole.name, extractByRole);
            this.extractsForAll = res.data['roles'].find(item => item.name === 'all').extracts;
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

    getExtractsInAll() {
        const allRole = this.store['all'];
        return allRole ? allRole.extracts : [];
    }
}
