// Copyright: IQGeo Limited 2010-2023
import { latLng } from 'myWorld/base';
import { Layer } from 'myWorld/layers/layer';
import { MapControl } from './mapControl';
import { BasemapControl } from './basemapControl';

//TODO: handle options:
// maxZoom: config['core.map.maxZoom'],
// minZoom: 1

export class GeoMapControl extends MapControl {
    /**
     * @class  Map Control for the geographical world.
     *         Extends MapControl adding functionality to load, manage and handle layers
     * @param  {Application} app        The current myWorld application instance
     * @param {string|HTMLElement} divID     The div element (or it's id) to render the map onto.
     * @constructs
     * @extends {MapControl}
     */
    constructor(app, divID, worldId = 'geo', options) {
        const mapOptions = app.system.settings['core.map.options'];
        super(app, divID, worldId, { ...mapOptions, ...options });

        this.app.on('internetStatus-changed', e => {
            if (e.hasInternetAccess && e.hadInternetAccess !== undefined) {
                //refresh current basemap which may not be displaying properly as internet was not available
                const basemap = this.getCurrentBaseMap();
                basemap?.redraw?.();
            }
        });

        //wait for the map to be ready before adding layers, otherwise somethings like map bounds may not be
        //ready when initializing layers (which is relevant for myworld feature layers)
        this.ready = this.ready.then(async () => {
            //initialize the available base maps. Needs to happen after Map is "ready" because that's when the initialBaseMapName is also set
            await this.initializeBaseMapsFromDb();

            // loads the layers for the current user
            return this.layerManager.ensureInitialLayers();
        });
    }

    /**
     * Obtains the available background maps and sets the initial one
     *
     * The initial background map is obtained from the 'home' bookmark
     */
    async initializeBaseMapsFromDb() {
        const layersDefs = await this.app.getLayersDefs();
        let defs = layersDefs.filter(layerDef => layerDef.category == 'basemap');
        defs.sort((a, b) => (a.name > b.name ? 1 : b.name > a.name ? -1 : 0));
        this.baseLayerDefs = defs;

        defs.forEach(def => {
            this.addBaseLayer(def);
        });

        //set the initial base map
        const firstBaseMap = defs[0];
        //If there is an initialBaseMapName setting and it exists in the currently available basemaps, set that
        if (
            this.initialBaseMapName &&
            defs.find(def => def.display_name == this.initialBaseMapName)
        ) {
            this.setCurrentBaseMap(this.initialBaseMapName);
        } else if (firstBaseMap) {
            //Otherwise set the first basemap in the list of available basemaps as the current basemap
            this.setCurrentBaseMap(firstBaseMap.name);
        }

        //If there are more than 1 basemaps added to the application,
        //add the control that allows the user to choose the base map
        //need to be done after we have the layers
        if (Object.keys(this.baseMaps).length > 1) this.addBaseMapControl(this.baseMaps);
    }

    /**
     * Tries to create a layer from a definition and if successful adds it to the list of available basemaps
     * @param {layerDefinition} def     Definition of the layer to add
     * @return {Promise} Promise for the created layer or null if it was not possible to create it
     */
    addBaseLayer(def) {
        def.options = {
            zIndex: -1, //so it goes behind overlays
            maxZoom: def.max_scale,
            minZoom: (def.min_scale ?? 0) - 1, //in OL, minZoom of layers (not views) is exclusive, so we need to subtract 1 to get the visibility we expect
            attribution: def.attribution,
            opacity: 1.0 - def.transparency / 100
        };

        try {
            const datasource = this.app.database.getDatasource(def.datasource);
            if (!datasource) throw new Error(`***Warning: No datasource for layer: ${def.name}`);

            const layer = new Layer(datasource, def, this);

            layer.initialized.then(maplibLayer => maplibLayer?.setZIndex(-1));

            //store the name directly in the layer object so we can use it when handling
            //basemap changes, as the layer definition will not be available
            layer.display_name = def.display_name;
            this.baseMaps[def.display_name] = layer;
        } catch (error) {
            console.warn(`Unable to add baselayer '${def.name}': ${error.message}`);
        }
    }

    /**
     * Adds the Open Layers control that allows the user to choose the base map
     * Adds some custom styles to the control
     */
    addBaseMapControl(backgroundLayers) {
        this.basemapControl = new BasemapControl({
            backgroundLayers,
            map: this
        });
    }

    /**
     * Reconfigures the map with the information saved in the boomark
     * @param  {Object} bookmarkDetails [description]
     */
    useBookmark(bookmarkDetails) {
        //set the map view
        this.setView(latLng(bookmarkDetails.lat, bookmarkDetails.lng), bookmarkDetails.zoom);

        if (bookmarkDetails.map_display) {
            // Get the map information from the bookmark
            const mapProperties = bookmarkDetails.map_display.split('|'),
                baseMapName = mapProperties[0];

            // Update the basemap.
            this.setCurrentBaseMap(baseMapName);

            // Update the overlays.
            if (mapProperties[1]) {
                this.layerManager.setLayersVisibility(mapProperties[1].split(','));
            }
        }
    }

    /**
     * Refreshes the myworld_vector layers
     */
    update() {
        this.layerManager.refreshMywVectorLayers();
    }
}

export default GeoMapControl;
