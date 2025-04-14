import { BaseStore } from './BaseStore';
import myw from 'myWorld-base';
import System from 'myWorld/base/system';
import RestServer from 'myWorld/base/restServer';
import { datasourceTypes } from 'myWorld/datasources';
import { toJS } from 'mobx';

export class DatasourceStore extends BaseStore {
    constructor() {
        super();

        this.endpoint = 'config/datasource';
        this.collectionWrapper = 'datasources';
        this.filterFields = ['name', 'external_name', 'type'];
        this.rowKey = 'name';
    }

    /*
     * Restructures the spec fields before sending them to the server
     */
    unformatData(data) {
        data.spec = data.spec || {};
        Object.entries(data).forEach(([field, value]) => {
            if (field.includes('spec.')) {
                data.spec[field.split('.')[1]] = value;
                delete data[field];
            }
        });
        return data;
    }

    /*
     * Over-riding to restructure the spec fields before sending them to the server
     */
    async save(data) {
        const clone = toJS(data);
        return super.save(this.unformatData(clone));
    }

    /*
     * Over-riding to restructure the spec fields before sending them to the server
     */
    async update(id, data) {
        const clone = toJS(data);
        return super.update(id, this.unformatData(clone));
    }

    createDS(def) {
        if (!this.database) {
            const system = new System(new RestServer());
            this.database = new myw.Database(system, 'standard');
        }
        const Datasource = datasourceTypes[def.type];
        def = this.unformatData({ ...def }); //To add the spec fields to the spec object
        const opts = {
            ...def,
            ...def.spec
        };
        if (def.datasource) {
            const ds = this.store[def.datasource];
            Object.assign(opts, ds.spec);
        }
        return new Datasource(this.database, opts);
    }

    async runTest(def, method) {
        const datasource = this.createDS(def);
        let url;
        switch (method) {
            case 'testLayerURL':
                url = datasource.getLayerURL(this.unformatData({ ...def }));
                break;
            case 'testWms':
                url = datasource.options.wmsUrl;
                break;
            case 'testWfs':
                url = datasource.options.wfsUrl;
                break;
            default:
                url = datasource.options.url;
        }
        try {
            const response = await datasource[method](url, false);
            return { url: url, success: true, msg: response };
        } catch (e) {
            return { url: url, success: false, msg: e.message };
        }
    }

    getEnumeratorValues(datasourceName, enumerator) {
        const dsDef = this.store[datasourceName];
        if (!dsDef) throw new Error(`No definition for datasource '${datasourceName}'`);
        const datasource = this.createDS(dsDef);
        const values = myw.Util.evalAccessors(enumerator, { datasource }, true);
        return values;
    }
}
