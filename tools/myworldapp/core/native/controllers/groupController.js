// Copyright: IQGeo Limited 2010-2023
import { BaseController } from '../base/controllers';

export class GroupController extends BaseController {
    constructor(view) {
        super(view);
        this.groupTable = this._db.table('group');
        this.groupItemTable = this._db.table('group_item');
        this.currentUsername = this.currentUser.username;
    }

    //IDs of the groups of which current user is the owner or a member
    async getGroupsIds(isManager) {
        let whereClause;
        if (isManager) whereClause = { username: this.currentUsername, manager: true };
        else whereClause = { username: this.currentUsername };

        const ids = new Set();
        //groups where user is a member
        const items = await this.groupItemTable.where(whereClause).all();
        items.forEach(rec => ids.add(rec.group_id));
        //groups where user is owner
        const groups = await this.groupTable.where({ owner: this.currentUsername }).all();
        groups.forEach(rec => ids.add(rec.id));

        return [...ids].sort();
    }

    async getGroup(id) {
        const rec = await this.groupTable.get(id);
        return rec.serialize();
    }
}
