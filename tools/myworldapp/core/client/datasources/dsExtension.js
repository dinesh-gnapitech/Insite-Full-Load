import { MywClass } from 'myWorld/base/class';

export class DsExtension extends MywClass {
    /**
     * @class Superclass for Datasource extensions.
     *  Datasource extensions are way to organise code related to a module and its services, where this code might be used across a mix feature models, plugins or other modules.
     *  Datasource extensions provide a way to share this kind of code while avoiding naming clashes (which could happen if one just added methods to a Datasource prototype).
     * @param  {Datasource} datasource
     * @constructs
     * @extends MywClass
     * @example
     * var MyModuleDatasourceExtension  = DsExtension.extend({
     *     myService(anArg) {
     *        return this.ds.moduleGet(`modules/myModule/myService/${anArg}`);
     *     }
     * });
     * //And register with:
     * MyWorldDatasource.extensions.myModule = MyModuleDatasourceExtension;
     */
    constructor(datasource) {
        super();
        /** Provides access to underlying datasource
         * @type {Datasource} */

        this.ds = datasource;
    }
}

export default DsExtension;
