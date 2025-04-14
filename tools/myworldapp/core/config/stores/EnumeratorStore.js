import { BaseStore } from './BaseStore';
import { action } from 'mobx';

export class EnumeratorStore extends BaseStore {
    constructor() {
        super();

        this.endpoint = 'config/enumerator';
        this.collectionWrapper = 'enumerators';
        this.filterFields = ['name', 'description'];
        this.rowKey = 'name';
        this.uniques = ['name', 'description'];
    }

    @action updateListValue(id, index, value) {}
}
