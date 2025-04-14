// Copyright: IQGeo Limited 2010-2023
import { MyWorldDatasource } from 'myWorld-base';

export class MyWorldMasterDatasource extends MyWorldDatasource {
    /**
     * Sets 'this.server' to be a database instance for the url specified in options. <br/>
     * Performs a login request with the parameters specified in options
     * @return {Promise}  Promise fulfilled when the database is instantiated and initialized
     */
    _getServer() {
        return Promise.resolve(this.system.server.getMasterViewServer()).then(server => {
            this.server = server;
            return server;
        });
    }

    get baseUrl() {
        return this.server?.baseUrl;
    }
}
