// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { processOptionsFromJson } from 'myWorld/base/util';
import { Datasource } from './datasource';
import { GeocodeFeature } from 'myWorld/features/geocodeFeature';
import googleMapsLibrary from 'myWorld/map/googleMapsLibrary';
import { GoogleOverlay } from 'myWorld/layers/googleOverlay';
import { GoogleBasemap } from 'myWorld/layers/googleBasemap';
import poweredByGoogleImg from 'images/powered_by_google_on_white_hdpi.png';

/* globals google */

export class GoogleDatasource extends Datasource {
    static layerDefFields = [
        {
            name: 'mapType',
            type: 'enumerator',
            enumerator: ['ROADMAP', 'SATELLITE', 'HYBRID', 'TERRAIN'],
            condition(def) {
                return def.category == 'basemap';
            }
        },
        {
            name: 'className',
            type: 'enumerator',
            enumerator: ['TrafficLayer'],
            viewClass: 'EnumWithInputEditor',
            condition(def) {
                return def.category == 'overlay';
            }
        },
        {
            name: 'arguments',
            type: 'json',
            viewClass: 'ListView',
            args: { sortable: false, valType: 'json' },
            condition(def) {
                return def.category == 'overlay';
            }
        },
        {
            name: 'googleMapOptions',
            type: 'json',
            viewClass: 'KeyValueView',
            args: { keyTitle: 'name', valueTitle: 'value', valType: 'json' },
            condition(def) {
                return def.category == 'basemap';
            }
        }
    ];

    static specFields = [
        { name: 'client', type: 'string' },
        { name: 'channel', type: 'string' },
        { name: 'placesAutoCompleteCountry', type: 'string' },
        {
            name: 'libraryUrlParams',
            type: 'json',
            viewClass: 'KeyValueView',
            args: { keyTitle: 'name', valueTitle: 'value' }
        }
    ];

    /**
     * @class Datasource to provide visualisation, selection and search on Google data </br>
     * Implements a myWorld geocoder and a PlacesAutocompleteEngine using the Google maps geocoder library<br/>
     * @constructs
     * @extends {IGeocoder}
     * @extends {IDatasource}
     */
    constructor(database, options) {
        super(database, options);

        this.description = 'Google Places';

        const libraryUrlParams = {
            ...options.libraryUrlParams,
            client: options.client,
            channel: options.channel
        };

        this.initialized = googleMapsLibrary.load(libraryUrlParams).then(() => {
            this._geocoder = new google.maps.Geocoder();
            this._placesAcService = new google.maps.places.AutocompleteService();

            this._handleSuccess(); //inform that datasource is active by firing event
            return this;
        });
    }

    getAttribution() {
        return poweredByGoogleImg;
    }

    /**
     * Instantiates a layer from a layer definition
     * @param {layerDefinition} layerDef
     * @param {GeoMapControl} map
     * @return {ILayer} Either a {@link GoogleOverlay} or a {@link GoogleBasemap} instance
     */
    createLayer(layerDef, map) {
        let layer;
        const layerDefOptions = layerDef.options;

        try {
            if (layerDef.className) {
                //overlay
                let args = processOptionsFromJson(layerDef.arguments);
                layer = new GoogleOverlay(this, layerDef.className, args, layerDefOptions);
            } else {
                //basemap
                const googleMapOptions = processOptionsFromJson(layerDef.googleMapOptions);
                const options = { ...layerDefOptions, googleMapOptions };

                layer = new GoogleBasemap(this, layerDef.mapType, map, options);
            }
        } catch (e) {
            console.log(`Error instantiating layer '${layerDef.name}'. Exception:`, e);
        }

        return layer;
    }

    /**
     * Geocode an address and call the callback
     * @param  {string|autoCompleteResult}   address  The address to search for
     * @param  {LatLngBounds}   bounds   Bounds to influence the geocoding
     * @return {Promise<GeocodeFeature>}
     */
    geocode(addressOrPlacesAC, bounds) {
        const self = this,
            geocoder = this._geocoder;

        return new Promise((resolve, reject) => {
            if (!geocoder) throw new Error('Unable to load Google library');
            self.checkEnabled();

            const gbounds = new google.maps.LatLngBounds(
                    new google.maps.LatLng(bounds.getSouthWest().lat, bounds.getSouthWest().lng),
                    new google.maps.LatLng(bounds.getNorthEast().lat, bounds.getNorthEast().lng)
                ),
                options = {
                    bounds: gbounds
                };

            if (typeof addressOrPlacesAC == 'string') {
                options.address = addressOrPlacesAC;
            } else {
                //we have an autoCompleteResult
                //using address text for business addresses will locate only the street. Use the place_id instead
                options.placeId = addressOrPlacesAC.data.prediction.place_id;
            }

            geocoder.geocode(options, (results, status) => {
                const features = [];
                if (!results) {
                    reject(new Error(status));
                    return;
                } else if (results.length) {
                    // convert each result into a an instance of Feature
                    for (let i = 0; i < results.length; i++) {
                        // convert each result into a an instance of Feature
                        const addressSearchResult = results[i];
                        const feature = self.geocodeFeatureFrom(addressSearchResult, i);
                        features.push(feature);
                    }
                }
                resolve(features);
            });
        });
    }

    /**
     * Obtains an address from the provided point and calls a callback with the result
     * @param  {LatLng}   point    Geographical point for which to obtain a corresponding address
     * @returns {Promise<string>}   Address for the given point
     */
    reverseGeocode(point) {
        return new Promise((resolve, reject) => {
            if (!this._geocoder) throw new Error('Unable to load Google library');
            this.checkEnabled();
            const location = new google.maps.LatLng(point.lat, point.lng);

            this._geocoder.geocode({ location: location }, (results, status) => {
                // For some odd reason Google sometimes returns a range of address "58-62 State St"
                // When getting directions this doesn't work very well so we'll take an average of the numbers
                if (!results.length) {
                    reject(new Error(status));
                    return;
                }

                const theFirstWord = results[0].formatted_address.substr(
                        0,
                        results[0].formatted_address.indexOf(' ')
                    ),
                    theRemainingWords = results[0].formatted_address.substr(
                        results[0].formatted_address.indexOf(' '),
                        results[0].formatted_address.length
                    ),
                    address = !theFirstWord.includes('-')
                        ? results[0].formatted_address
                        : Math.round(
                              (parseFloat(theFirstWord.split('-', 2)[0]) +
                                  parseFloat(theFirstWord.split('-', 2)[1])) /
                                  2
                          ) + theRemainingWords;

                resolve(address);
            });
        });
    }

    /**
     * Sends an external search request
     * @param  {string}         searchTerm      Text to search for
     * @param  {searchOptions}  [options]       Options to influence the search
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     */
    runSearch(searchTerm, options) {
        const service = this._placesAcService;
        const bounds = options.bounds;
        const placesAutoCompleteCountry = this.options.placesAutoCompleteCountry;
        let sw;
        let ne;

        return new Promise((resolve, reject) => {
            if (!service) throw new Error('Unable to load Google library');
            if (!this.checkEnabled(false)) {
                resolve([]);
                return;
            }
            //can only set the variables after we're sure the google namespace is availabe
            sw = new google.maps.LatLng(bounds.getSouth(), bounds.getWest());
            ne = new google.maps.LatLng(bounds.getNorth(), bounds.getEast());
            const options = {
                input: searchTerm,
                bounds: new google.maps.LatLngBounds(sw, ne)
            };

            if (placesAutoCompleteCountry) {
                //if configured, limit suggestions to specified country
                options.componentRestrictions = { country: placesAutoCompleteCountry.split(',') };
            }

            service.getPlacePredictions(options, (predictions, placesServiceStatus) => {
                if (placesServiceStatus == 'ZERO_RESULTS') {
                    this.geocode(searchTerm, bounds)
                        .then(this._convertGeocodeFeaturestoACResults.bind(this))
                        .catch(e => {
                            console.warn(e);
                        })
                        .finally(resolve);
                } else if (placesServiceStatus == 'OK') {
                    //convert predictions to format expected by
                    const results = predictions.map(prediction => ({
                        label: prediction.description,
                        value: prediction.description,
                        type: 'placesAc',
                        data: { prediction: prediction }
                    }));

                    resolve(results);
                } else {
                    reject(new Error(`status: ${placesServiceStatus}`));
                }
            });
        });
    }

    /**
     * Converts a geocode feature into a GeocodeFeature
     * @param  {google.maps.places.PlaceResult} placeResult [description]
     * @param  {number}[index=0]
     * @return {GeocodeFeature}
     */
    geocodeFeatureFrom(placeResult, index = 0) {
        const geom = placeResult.geometry;
        const lng = geom.location
            ? parseFloat(geom.location.lng())
            : parseFloat(geom.coordinates[0]);
        const lat = geom.location
            ? parseFloat(geom.location.lat())
            : parseFloat(geom.coordinates[1]);
        delete placeResult.geometry; //geometry shouldn't be in properties otherwise it will clash later on in OpenLayers
        const jsonResult = {
            properties: placeResult,
            id: index,
            geometry: {
                type: 'Point',
                coordinates: [lng, lat]
            },
            bounds: this._convertBbox(geom.viewport)
        };

        return new GeocodeFeature(jsonResult, placeResult.formatted_address);
    }

    /**
     * Checks if self provides the current basemap for the geographical map
     * @param  {boolean} [throwError=true] Whether to throw an error when not enabled or not
     * @return {boolean}
     */
    checkEnabled(throwError = true) {
        const basemapDs = myw.app?.map?.getCurrentBaseMap()?.datasource;
        const defaultAddressesDsName = myw.app?.system.settings['core.addressDatasource'];
        if (
            basemapDs !== this &&
            defaultAddressesDsName !== this.getName() &&
            !basemapDs.isGoogle //handles custom google datasources
        ) {
            if (throwError) throw new Error('Not a Google basemap');
            else return false;
        }
        return true;
    }

    /*
     * @param  {GeocodeFeature[]} geocodeFeatures
     * @return {autoCompleteResult[]}
     */
    _convertGeocodeFeaturestoACResults(geocodeFeatures) {
        return geocodeFeatures.map(feature => ({
            label: feature.getTitle(),
            value: feature.getTitle(),
            type: 'placesAc',
            data: { prediction: feature.properties }
        }));
    }

    /**
     * Converts a google bounding box into geojson bounds
     * @param  {google.maps.LatLngBounds} bbox
     * @return {Array<number>}      Geojson bounds. Format: [xmin, ymin, xmax, ymax]
     * @private
     */
    _convertBbox(bbox) {
        const ne = bbox.getNorthEast(),
            sw = bbox.getSouthWest(),
            xmin = sw.lng(),
            xmax = ne.lng(),
            ymin = sw.lat(),
            ymax = ne.lat();

        return [xmin, ymin, xmax, ymax];
    }
}

myw.datasourceTypes['google'] = GoogleDatasource;

export default GoogleDatasource;
