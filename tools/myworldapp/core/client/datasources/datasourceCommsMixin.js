// Copyright: IQGeo Limited 2010-2023
import { xml2json } from 'xml2json-light';
import { MywError, AuthenticationError } from 'myWorld/base/errors';
import { timeout } from 'myWorld/base/util';
import { GeoserverImgRequest, CONNECTION_METHODS } from 'myWorld/layers/geoserverImgRequest';

export const JsonParseError = MywError.extend('JsonParseError');

/* Defines methods that provide fetch-based and tunnelled communication to http servers */
export const DatasourceCommsMixin = {
    /*
     * Sends an external search or selection request
     * @param  {object}     requestParams   Parameters to send to the external selection server
     * @param  {string}     options.featureType
     * @param  {string}     options.urlFieldName        Name of datasource field that holds the base url
     * @param  {string}     [options.relativeUrl='']
     * @return {Promise<Array<Feature>>}  Promise for the external features
     */
    async _sendFeaturesRequest(requestParams, options) {
        const asFeature = featureData => this._asFeature(featureData, options.featureType);

        const data = await this._sendRequest(requestParams, options);
        if (data?.features) {
            const features = data.features.map(asFeature);
            return Object.assign(features, { totalCount: data.totalFeatures }); //totalcount is used by the resultListControl
        } else if (data && options.format == 'xml') {
            return xml2json(data).wfs.numberOfFeatures;
        } else {
            throw new Error(
                `Unexpected result from datasource '${this.options.name}' - missing 'features' property. Feature type: ${options.featureType}`
            );
        }
    },

    /*
     * Sends a generic external request
     * @param  {object}     requestParams   Parameters to send to the external selection server
     * @param  {string}     options.urlFieldName        Name of datasource field that holds the base url
     * @param  {string}     [options.relativeUrl='']
     * @return {Promise}
     */
    _sendRequest(requestParams, options) {
        options = { relativeUrl: '', ...options };

        if (!options.tunnelled) {
            const baseUrl = this.options[options.urlFieldName];
            const url = options.url ? new URL(options.url) : new URL(options.relativeUrl, baseUrl);

            //direct fetch request to the external server
            return this.fetchRequest(url, requestParams);
        } else {
            //request throught the myWorld server
            if (this.owner) options.owner = this.owner;
            return this.tunnelRequest(requestParams, options);
        }
    },

    /*
     * Performs the external selection via a fetch request
     * @param  {URL}     url
     * @param  {Object}     requestParams   Parameters for the request
     * @return {Promise<json>}              Selected feature details
     */
    fetchRequest(url, requestParams) {
        return timeout(
            (async () => {
                for (const [paramName, param] of Object.entries(requestParams)) {
                    url.searchParams.set(paramName, param);
                }
                await this._ensureAuthenticated(url); //authenticate if necessary
                //send the selection request to the external server
                const res = await GeoserverImgRequest(url, this._getGeoserverRequestParams());
                if (res.status == 200) {
                    try {
                        const text = await res.text();
                        new DOMParser().parseFromString(text, 'text/xml');
                        return text;
                    } catch (error) {
                        throw new JsonParseError();
                    }
                } else {
                    throw new Error(res.statusText);
                }
            })(),
            this.options.requestTimeout || 4000
        );
    },

    _getGeoserverRequestParams() {
        if (this.options.username) {
            return {
                type: CONNECTION_METHODS.BASIC,
                username: this.options.username,
                password: this.options.password
            };
        } else {
            return {
                type: CONNECTION_METHODS.NONE
            };
        }
    },

    /*
     * Authenticates the browser session with a given url
     * Username and password will be obtained from datasource's options/spec
     * @private
     */
    _ensureAuthenticated(url) {
        if (this.options.username) {
            if (!this._authenticationPromise) this._authenticationPromise = {};
            const key = url.origin + url.pathname;
            if (!this._authenticationPromise[key]) {
                this._authenticationPromise[key] = timeout(
                    (async () => {
                        let res = await GeoserverImgRequest(url, this._getGeoserverRequestParams());
                        if (res.status != 200) {
                            const responseText = await res.text();
                            const error = new Error(`Status code was ${res.status}`);
                            error.status = res.status;
                            error.responseText = responseText;
                            throw error;
                        }
                        res = await res.text();
                        return res;
                    })(),
                    4000
                ).catch(e => {
                    //We expect XML for this request, so an error is thrown in that situation
                    if (e.status == 200) {
                        //the configuration is working. error was to XML instead of script
                        return 'success';
                    } else if (e.status == 401) {
                        throw new AuthenticationError();
                    } else if (e.name === 'TimeoutError') {
                        throw new AuthenticationError('Timeout');
                    } else {
                        throw e;
                    }
                });
            }
            return this._authenticationPromise[key];
        } else {
            return Promise.resolve();
        }
    }
};

export default DatasourceCommsMixin;
