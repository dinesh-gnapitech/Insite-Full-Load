import { BaseStore } from './BaseStore';
import { action } from 'mobx';

export class BreadcrumbStore extends BaseStore {
    set(name, path) {
        this.current = { path, name };
    }

    @action clear() {
        this.current = {};
    }
}
