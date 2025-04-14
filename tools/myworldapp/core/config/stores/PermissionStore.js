import { action, runInAction, makeObservable, observable } from 'mobx';
import { RestClient } from './RestClient';

const pagesRights = {
    applications: 'manageApplications',
    roles: 'manageRoles',
    users: 'manageUsers',
    features: 'manageFeatures',
    enumerators: 'managePickLists',
    queries: 'manageQueries',
    datasources: 'manageDatasources',
    layers: 'manageLayers',
    'layers/layergroups': 'manageLayers',
    networks: 'manageNetworks',
    settings: 'manageSettings',
    'settings/core.advanced': 'manageSettings',
    notifications: 'manageNotifications',
    upload: 'manageUpload',
    replicas: 'manageReplicas',
    tablesets: 'manageReplicas',
    extracts: 'manageReplicas',
    downloads: 'manageReplicas',
    'replicas/tableSets': 'manageReplicas'
};

export class PermissionStore {
    @observable curUserPerms = {};

    constructor() {
        makeObservable(this);
    }

    @action async getUserPermissions() {
        const res = await RestClient.get('system/rights');

        runInAction(() => {
            let next = {};
            for (let [resource, right] of Object.entries(pagesRights)) {
                next[resource] = res.data.rights['config'][right];
            }
            this.curUserPerms = next;
        });
    }

    async userHasPermission(pageName) {
        const right = pagesRights[pageName];
        return this.permissionForRight(right);
    }

    async userCurrentlyHasPermission(pageName) {
        if (Object.keys(this.curUserPerms).length === 0) {
            await this.getUserPermissions();
        }
        return !!this.curUserPerms?.[pageName];
    }

    async permissionForRight(right) {
        const res = await RestClient.get('system/rights');
        return !!res.data.rights['config'][right];
    }
}
