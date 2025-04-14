// Copyright: IQGeo Limited 2010-2023

/**
 * Base class for controllers
 * @example
class MyController extends BaseController {
    async myService({ featureType, id}) {
        await this.currentUser.assertAuthorized('myworld', featureType);
        const feature = await this.view.table(featureType).get(id);
        //do something else...
    }
}
routing.register('modules/custom/myservice/{featureType}/{id}', MyController, 'myservice');
 */
export class BaseController {
    /**
     * Initialize controller
     * @param {FeatureView} view
     */
    constructor(view) {
        /**
         * View of the database for accessing features
         * @type {FeatureView}
         */
        this.view = view;
        /**
         * Database. Could be used to obtain a view for a specific version/delta
         * @type {MyWorldDatabase}
         */
        this._db = view.db;

        this.dd = view.dd;

        /**
         * @type {CurrentUser}
         */
        this.currentUser = this.dd.currentUser;
    }

    /**
     * Executes the given SQL statement on the local database
     * @param {string} sql
     * @param {object} params Bind parameters for the statement
     * @returns {SqlResult}
     */
    runSql(sql, params = {}) {
        return this._db.runSql(sql, params);
    }

    /**
     * Current user's session variables
     * @returns {object}
     */
    sessionVars() {
        return this.currentUser.sessionVars();
    }
}

/**
 * The result of a SQL statement
 * If statement is a query it will be a list of objects representing matching rows
 * If statement is an INSERT it will be the key of the inserted record
 * If statement is an UPDATE it will be an object with the changes made
 * @typedef {object[]|number|string|object} SqlResult
 */
