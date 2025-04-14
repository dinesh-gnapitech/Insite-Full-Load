// Copyright: IQGeo Limited 2010-2023
import Layer from 'ol/layer/Layer';

/* globals google:false */

/**
 * A layer rendered using a Google library. Only available with Google basemaps.
 */
export class GoogleOverlay extends Layer {
    /**
     * @param  {GoogleDatasource}   datasource
     * @param  {string}                 constructorName   Name of contructor function on 'google.maps' namespace
     * @constructs
     * @extends {ol/layer/Layer}
     */
    constructor(datasource, constructorName, args, options) {
        super(options);

        this.isVisible = false;
        this.datasource = datasource;
        this.constructorName = constructorName;
        this.args = args;

        this.handleBasemapChange = this.handleBasemapChange.bind(this);
    }

    /**
     * Called when the gets added to a map.
     * Instantiates the google layer and adds it to the current google basemap.
     * @param  {MapControl} map
     */
    onAdd(map) {
        this.isVisible = true;

        //ensure the library is loaded before instantiating the layer
        this.datasource.initialized.then(() => {
            if (!this.googleLayer) {
                let Constructor = google.maps[this.constructorName];
                const args = [undefined].concat(this.args); //first arg is this/context which in the case of a constructor can be undefined
                Constructor = Function.prototype.bind.apply(Constructor, args);
                this.googleLayer = new Constructor();
            }

            this.isVisible = !!this.googleLayer; //as in is checked/selected

            this.datasource.system.recordDataAccess(
                this.datasource.database.applicationName,
                `layer.${this.constructorName}`
            );

            this.handleBasemapChange({ layer: map.getCurrentBaseMap() });
        });

        //since the basemap may not be a Google map when the layer is being added, we listen
        //for basemap changes and set it then
        map.on('baselayerchange', this.handleBasemapChange);
    }

    /**
     * Called when the layer is removed from the map
     * @param  {MapControl} map
     */
    onRemove(map) {
        if (this.isVisible) {
            this.googleLayer.setMap(null);
        }
        this.isVisible = false;

        map.off('baselayerchange', this.handleBasemapChange);
    }

    /**
     * Called when the basemap changes
     * If the new basemap is a google one, associate with it
     */
    handleBasemapChange(e) {
        const basemap = e.layer.maplibLayer;
        const isGoogleBasemap = basemap?.datasource == this.datasource;
        const googleLayer = this.googleLayer;
        const isValid = googleLayer && isGoogleBasemap;

        this.dispatchEvent(isValid ? 'valid' : 'invalid');

        if (this.isVisible && isGoogleBasemap) {
            e.layer.onAddPromise.then(() => {
                basemap.addGoogleLayer(googleLayer);
            });
        }
    }

    render() {
        //  Purposefully left blank
    }
}

export default GoogleOverlay;
