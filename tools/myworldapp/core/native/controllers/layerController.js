// Copyright: IQGeo Limited 2010-2023
import { Util } from 'myWorld-base';
import { BaseController } from '../base/controllers';

export class LayerController extends BaseController {
    async get(name) {
        const layerRec = await this._db.table('layer').get(name);
        if (!layerRec) throw new Error(`No layer with name: ${name}`);

        await layerRec.setFeatureItems();
        return layerRec.serialize();
    }

    /**
     * Sends an external selection request
     * @param  {number}   dsName          Datasource name
     * @param  {string}     params   Parameters to send to the external selection server
     * @param  {object}     options   Parameters to send to the external selection server
     * @param  {string}     [options.urlFieldName='url']    Name of property in datasource's spec that holds the base url for the request
     * @param  {string}     [options.relativeUrl='']        Relative url to append to the base url
     * @param  {string}     [options.owner] Required when request is originated from a private layer
     * @return {Promise<object>}              Json with the selected features
     */
    async externalRequest(dsName, params, options) {
        let spec;
        if (options.owner) {
            const rec = await this._db.table('private_layer').get(dsName);
            spec = rec.datasource_spec;
        } else {
            const rec = await this._db.table('datasource').get(dsName);
            spec = rec.spec;
        }

        const url = this._externalRequestUrl(spec, params, options);
        const requestParams = {
            cache: 'no-store', // Two calls with the same data should get different results
            headers: {}
        };
        if (spec.username) {
            requestParams.headers['Authorization'] = `Basic ${btoa(
                `${spec.username}:${spec.password}`
            )}`;
        }

        return this._externalRequest(url, requestParams);
    }

    _externalRequestUrl(spec, params, options) {
        const urlFieldName = options.urlFieldName;
        const baseUrl = urlFieldName && spec[urlFieldName];
        if (!baseUrl) {
            throw new Error("Missing or invalid value for 'urlFieldName'");
        }
        const relativeUrl = options.relativeUrl || '';
        const url = new URL(relativeUrl, baseUrl);
        for (const [param, value] of Object.entries(params)) {
            url.searchParams.set(param, value);
        }
        return url;
    }
    _externalRequest(requestUrl, requestParams) {
        return Util.timeout(
            (async () => {
                const res = await fetch(requestUrl.href, requestParams);
                const { status } = res;
                const text = await res.text();
                if (status === 200) {
                    if (text.startsWith('<')) {
                        // Error of some kind
                        // ENH: Extract the error message from data
                        return text;
                    } else {
                        return JSON.parse(text);
                    }
                } else {
                    console.log(`Failed with ${text}(${status})`);
                    throw new Error(text || 'External request failure');
                }
            })(),
            5000 //  5 Seconds
        );
    }
}
