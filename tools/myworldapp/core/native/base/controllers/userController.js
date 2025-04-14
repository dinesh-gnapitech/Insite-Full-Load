// Copyright: IQGeo Limited 2010-2023
import { BaseController } from './baseController';

export class UserController extends BaseController {
    async getUserPermissions(username) {
        const results = await this.runSql(
            'SELECT myw$right.name as right, myw$application.name as app_name, myw$permission.restrictions as restrictions ' +
                'FROM myw$user, myw$user_role, myw$permission, myw$right, myw$application ' +
                'WHERE myw$user.username = :username ' +
                '  AND myw$user_role.user_id = myw$user.id ' +
                '  AND myw$permission.role_id = myw$user_role.role_id ' +
                '  AND myw$right.id = myw$permission.right_id ' +
                '  AND myw$permission.application_id = myw$application.id ',
            { username }
        );
        const applicationRights = {};
        results.forEach(result => {
            if (!applicationRights[result.app_name]) {
                applicationRights[result.app_name] = {};
            }
            if (!result.restrictions) {
                applicationRights[result.app_name][result.right] = true;
            } else {
                try {
                    applicationRights[result.app_name][result.right] = {
                        restrictions: JSON.parse(result.restrictions)
                    };
                } catch (error) {
                    console.warn(`Error parsing permission's restrictions: ${result.restrictions}`);
                }
            }
        });
        return applicationRights;
    }

    async getUserPermissionsForApp(username, applicationName) {
        const perms = await this.getUserPermissions(username);
        return Object.keys(perms[applicationName] || {});
    }

    async getUsers() {
        const recs = await this._db.table('user').all();
        return recs.map(rec => rec.username);
    }
}
