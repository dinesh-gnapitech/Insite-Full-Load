// Copyright: IQGeo Limited 2010-2023
import { MyWorldDatasource, DDFeature } from 'myWorld-base';

export class LocalDatasource extends MyWorldDatasource {
    static {
        this.prototype.defaultFeatureModel = DDFeature;
    }

    /**
     * @class To be used with {@link ProxyDatasource} as the datasource class for Local mode.
     *        In local mode the data will be rendered as vector ({@link MywVectorLayer})
     * @constructs
     * @augments Datasource
     * @augments IDatasource
     */
    constructor(app, options) {
        super(app, options);

        Object.assign(this.featuresDD, this.options.featuresDD);

        //set the featureDD.name (aka featureType) property
        for (const key in this.featuresDD) {
            this.featuresDD[key].name = key;
        }
    }

    /**
     * Instantiates a layer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {TileLayer|MywVectorLayer}  The instantiated layer
     * @private
     */
    createLayer(layerDef) {
        layerDef.feature_types.forEach(lfi => {
            //ENH: obtain these styles from a shared location which can be passed on to the stylePicker when used in the config pages
            if (!lfi.point_style) lfi.point_style = 'circle:green:7';
            if (!lfi.line_style) lfi.line_style = 'green:2:solid';
            if (!lfi.fill_style) lfi.fill_style = 'green:40';
        });

        const layer = this._createVectorLayer(layerDef);

        this._registerLayer(layerDef);

        return layer;
    }
}
