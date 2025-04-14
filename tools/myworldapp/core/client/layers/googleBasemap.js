// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import TileLayer from 'ol/layer/Tile';
import GoogleSource from './googleSource';
export * from './googleSource';

const { isTouchDevice } = myw;

//returns a method that delegates the call to the GoogleSource instance
function delegateMethod(methodName) {
    return function (...args) {
        if (this._mutant) return this._mutant[methodName](...args);
    };
}

/**
 * Layer that renders tiles from Google basemaps
 */
export class GoogleBasemap extends TileLayer {
    /**
     * Creates a layer for Google basemaps
     * @param {GoogleDatasource} datasource
     * @param {string} type one of SATELLITE, ROADMAP, HYBRID, TERRAIN
     * @param {object} options
     */
    constructor(datasource, type, map, options) {
        const source = new GoogleSource(type, map, { isTouchDevice, ...options });

        const basemapOptions = {
            minZoom: 0,
            maxZoom: 23,
            source,
            ...options
        };

        super(basemapOptions);

        this.datasource = datasource;

        this._onPegmanDown = this._onPegmanDown.bind(this);
        this.showPegman = delegateMethod('showPegman');
        this.hidePegman = delegateMethod('hidePegman');
        this.isPegmanActive = delegateMethod('isPegmanActive');
        this.setStreetView = delegateMethod('setStreetView');
    }

    onAdd(map) {
        this._map = map;
        this.setMap(map);

        this._mutant = this.getSource();
        //pass through pegman events
        this._mutant.on('pegman-mousedown', this._onPegmanDown);
        this._mutant.onAdd(map);

        this._googleMap = this._mutant.getMutant();
        return true;
    }

    onRemove(map) {
        this._map = null;
        this.setMap(null);

        this._mutant.un('pegman-mousedown', this._onPegmanDown);
        this._mutant.onRemove(map);
        this._mutant = null;

        this._googleMap = null;
        return true;
    }

    _onPegmanDown() {
        return this.dispatchEvent('pegman-mousedown');
    }

    addGoogleLayer(googleLayer) {
        googleLayer.setMap(this._googleMap);
    }
}

export default GoogleBasemap;
