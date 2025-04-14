// Copyright: IQGeo Limited 2010-2023
import { MyWorldDatasource, EsriDatasource, EsriFeature, OGCDatasource } from 'myWorld-base';
import { ProxyDatasource } from './proxyDatasource';
import { LocalDatasource } from './localDatasource';
import { MyWorldMasterDatasource } from './myWorldMasterDatasource';

export class ProxyDatasourceMyWorld extends ProxyDatasource {
    static {
        this.prototype.LocalDatasource = MyWorldDatasource;
        this.prototype.MasterDatasource = MyWorldMasterDatasource;
    }
}

export class ProxyDatasourceEsri extends ProxyDatasource {
    static {
        this.prototype.LocalDatasource = class extends LocalDatasource {
            static {
                this.prototype.defaultFeatureModel = EsriFeature;
            }
        };

        this.prototype.MasterDatasource = EsriDatasource;
    }
}

export class ProxyDatasourceOGC extends ProxyDatasource {
    static {
        this.prototype.LocalDatasource = LocalDatasource;
        this.prototype.MasterDatasource = OGCDatasource;
    }
}
