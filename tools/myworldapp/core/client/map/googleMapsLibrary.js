// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld/base/core';
import { trace } from 'myWorld/base/trace';

/* global google */

/**
 * Module that loads the Google Maps API library. <br/>
 *  Modules that will use the Google Maps API library should require this module and then listen
 *  for the application's  {@link event:googleMapsApi-loaded} <br/>
 *  @example myw.googleMapsLibrary.load();
 *  @example myw.googleMapsLibrary.load().then(() => {
 *      //code depending on google maps library
 *  });
 *  @module
 */

//use 'weekly' in development so we find any problems early on
const libraryVersion = myw.buildType === 'development' ? 'weekly' : 'quarterly';

export const googleMapsLibrary = {
    loaded: false,
    nChecks: 0,
    promise: null,

    urlParameters: {
        v: libraryVersion, //see https://developers.google.com/maps/documentation/javascript/versions
        sensor: 'true',
        libraries: 'places',
        callback: 'myw.gmapsapicallback'
    },

    load(options) {
        if (!this.promise) {
            const self = this;
            this.promise = new Promise((resolve, reject) => {
                //setup global callback for when google maps api has finished loading,
                //in a way that it resolves the promise
                myw.gmapsapicallback = self._callback.bind(self, resolve);

                //do the actual loading of the library
                self._load(options);

                //for the situation where the library failed to load (ex: no internet access)
                //we'll setup a handler to retry when internet becomes available
                myw.appReady &&
                    myw.appReady.then(app => {
                        //app does an initial check of internet status which throws an event when it is changed from undefined
                        //we want to ignore this first event, as an initial load as already been started - if the load fails we
                        //want to retry on the next internetStatus-changed event that changes the status to true
                        //ENH: ugly - each load operation should be another promise that rejects on a timeout?
                        let initial = true;
                        app.on('internetStatus-changed', e => {
                            if (!self.loaded && e.hasInternetAccess && !initial) self._load();
                            initial = false;
                        });
                    });
            });
        }

        return this.promise;
    },

    _load(options) {
        if (typeof google == 'undefined' || !google.maps.Map) {
            trace('googleMapsLibrary', 2, 'Loading Google Maps library');
            let paramsStr, url;

            //convert into an url parameters string
            paramsStr = new URLSearchParams({ ...this.urlParameters, ...options }).toString();
            url = 'https://maps.googleapis.com/maps/api/js?' + paramsStr;

            $.getScript(url);
        } else {
            //we're retrying but it has finished loading after all
            myw.gmapsapicallback();
        }
    },

    _callback(resolve) {
        if (this.loaded) return;

        if (typeof google != 'undefined' && google.maps.Map) {
            trace('googleMapsLibrary', 2, 'Google Maps library successfully loaded');
            this.loaded = true;
            resolve();
            myw.appReady?.then(app => {
                //create a dummy map, which will force the loading of missing parts of the library
                //this prevents future map instantiations from failing silently if internet is not available at that point)
                //(do this after "appReady" since applying the layout replaces the body content and that could cause an error in google's code)
                var container = document.createElement('div');
                document.body.appendChild(container);

                new google.maps.Map(container);
                $(container).remove();

                app.fire('googleMapsApi-loaded');
            });
        } else {
            //timeout expired and library not loaded
            if (this.nChecks < 20) {
                // inside 20*0.250=5 seconds, keep trying
                this.nChecks++;
                setTimeout(myw.gmapsapicallback, 250);
            } else {
                //give up. wait for internetStatus-changed
                trace(
                    'googleMapsLibrary',
                    3,
                    "Given up checking. Waiting for 'internetStatus-changed' event"
                );
            }
        }
    }
};

export default googleMapsLibrary;
