import { BaseStore } from './BaseStore';

export class ExtractStore extends BaseStore {
    constructor() {
        super();

        this.endpoint = 'config/extract';
        this.collectionWrapper = 'extracts';
        this.filterFields = ['name'];
        this.rowKey = 'name';
    }
}
