import { BaseStore } from './BaseStore';

export class RightStore extends BaseStore {
    constructor() {
        super();

        this.endpoint = 'config/rights';
        this.collectionWrapper = 'rights';
        this.filterFields = ['name', 'description'];
        this.rowKey = 'id';
    }
}
