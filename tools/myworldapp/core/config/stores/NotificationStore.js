import { BaseStore } from './BaseStore';

export class NotificationStore extends BaseStore {
    constructor() {
        super();

        this.endpoint = 'config/notification';
        this.collectionWrapper = 'notifications';
        this.filterFields = ['name', 'external_name', 'type', 'details'];
        this.rowKey = 'id';
        this.nameField = 'subject';
        this.uniques = ['created'];
    }
}
