import { BaseStore } from './BaseStore';

export class ReplicaStore extends BaseStore {
    constructor() {
        super();

        this.endpoint = 'config/replica';
        this.collectionWrapper = 'replicas';
        this.filterFields = ['id', 'type', 'status', 'owner', 'location'];
        this.rowKey = 'id';
    }
}
