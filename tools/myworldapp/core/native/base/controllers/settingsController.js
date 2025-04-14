// Copyright: IQGeo Limited 2010-2023

import { BaseController } from './baseController';

export class SettingsController extends BaseController {
    get() {
        return this._db.table('setting').all();
    }
    //returns settings as an object (key, value). values are raw/unprocessed
    async getKeyed() {
        const settings = await this.get();
        const keyed = {};
        settings.forEach(setting => (keyed[setting.name] = setting.value));
        return keyed;
    }

    put(id, params) {
        return this.runSql(
            // Note: Using 'insert or replace' requires specifying values for all columns
            // in the table that don't have sensible defaults.
            'insert or replace into myw$setting (name, type, value) values (:name, :type, :value)',
            JSON.parse(params)
        );
    }

    set(id, type, value) {
        return this.runSql(
            // Note: Using 'insert or replace' requires specifying values for all columns
            // in the table that don't have sensible defaults.
            'insert or replace into myw$setting (name, type, value) values (:id, :type, :value)',
            { id, type, value }
        );
    }
}
