import { LayerStore } from './LayerStore';
import { ApplicationStore } from './ApplicationStore';
import { RoleStore } from './RoleStore';
import { UserStore } from './UserStore';
import { EnumeratorStore } from './EnumeratorStore';
import { NetworkStore } from './NetworkStore';
import { DatasourceStore } from './DatasourceStore';
import { NotificationStore } from './NotificationStore';
import { RightStore } from './RightStore';
import { BreadcrumbStore } from './BreadcrumbStore';
import { LayerGroupStore } from './LayerGroupStore';
import { CurrentUserStore } from './CurrentUserStore';
import { PermissionStore } from './PermissionStore';
import { MyWorldStore } from './MyWorldStore';
import { TableSetStore } from './TableSetStore';
import { ExtractStore } from './ExtractStore';
import { ExtractRoleStore } from './ExtractRoleStore';
import { ReplicaStore } from './ReplicaStore';
import { SettingsStore } from './SettingsStore';
import { DDStore } from './ddStore';
import { configure } from 'mobx';

configure({
    enforceActions: 'observed'
});

export class RootStore {
    constructor() {
        this.myWorldStore = new MyWorldStore(this);
        this.breadcrumbStore = new BreadcrumbStore(this);
        this.layerStore = new LayerStore(this);
        this.applicationStore = new ApplicationStore(this);
        this.roleStore = new RoleStore(this);
        this.userStore = new UserStore(this); //uses RoleStore, so needs to be created after roleStore
        this.enumeratorStore = new EnumeratorStore(this);
        this.networkStore = new NetworkStore(this);
        this.datasourceStore = new DatasourceStore(this);
        this.notificationStore = new NotificationStore(this);
        this.rightStore = new RightStore(this);
        this.layerGroupStore = new LayerGroupStore(this);
        this.currentUserStore = new CurrentUserStore(this);
        this.permissionStore = new PermissionStore(this);
        this.tableSetStore = new TableSetStore(this);
        this.extractStore = new ExtractStore(this);
        this.extractRoleStore = new ExtractRoleStore(this);
        this.replicaStore = new ReplicaStore(this);
        this.settingsStore = new SettingsStore(this);
        this.ddStore = new DDStore(this);
    }
}
