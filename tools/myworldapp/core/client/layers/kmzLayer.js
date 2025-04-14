// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import KmlLayer, { MywKMLFormat } from './kmlLayer';
import VectorSource from 'ol/source/Vector';

export class MywKMZFormat extends MywKMLFormat {
    /**
     * A modified MywKMLFormat which converts internal hrefs into myWorld server calls
     * @param {Object} layerDef The layer definition
     * @param {Object} options The options for the format
     */
    constructor(layerDef, options) {
        super(options);
        this.layerDef = layerDef;
    }

    /**
     * Before sending the styles off to load, ensure that any hrefs that are absolute are converted
     * @override
     * @param {XMLDocument} source
     * @param {Object} opt_options
     * @returns {Promise<Array<Object>>}
     */
    async readFeatures(source, opt_options) {
        const hrefs = source.getElementsByTagName('href');
        for (let node of hrefs) {
            if (!/^http[s]?:\/\//.test(node.innerHTML)) {
                //ENH: fix for no-await-in-loop
                // eslint-disable-next-line no-await-in-loop
                node.innerHTML = await myw.app.system.getUrlForKmz(this.layerDef, node.innerHTML);
            }
        }
        return super.readFeatures(source, opt_options);
    }
}

/**
 * A small customization that handles MywKMZFormat.readFeatures promise
 * @private
 */
export class MywKMZSource extends VectorSource {
    /**
     * Resolves the passed in promise, then adds the features
     * @override
     * @param {Promise<Array<Object>>} featuresPromise
     */
    async addFeatures(featuresPromise) {
        const features = await featuresPromise;
        return super.addFeatures(features);
    }
}

/**
 * A customised KmlLayer that uses a MywKMZSource instead
 */
export class KmzLayer extends KmlLayer {
    /**
     * Returns a ol/source/Vector that use a MywKMZFormat
     * @override
     * @param {String} url
     * @returns {ol/source/Vector}
     * @private
     */
    _createSource(url) {
        const sourceOptions = {
            url,
            format: new MywKMZFormat(this.layerDef, {
                showPointNames: false
            })
        };
        const ret = new MywKMZSource(sourceOptions);
        return ret;
    }
}

export default KmzLayer;
