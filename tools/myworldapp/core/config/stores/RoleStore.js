import { BaseStore } from './BaseStore';

export class RoleStore extends BaseStore {
    constructor() {
        super();

        this.endpoint = 'config/role';
        this.collectionWrapper = 'roles';
        this.filterFields = ['name', 'description'];
        this.rowKey = 'id';
    }
}
