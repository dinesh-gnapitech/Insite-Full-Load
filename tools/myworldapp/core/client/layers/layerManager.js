// Copyright: IQGeo Limited 2010-2023
import { difference, intersection, pick, sortBy } from 'underscore';
import { MywClass } from 'myWorld/base/class';
import { convertUrl } from 'myWorld/base/util';
import { Overlay } from 'myWorld/layers/overlay';
import { trace as mywTrace } from 'myWorld/base/trace';
const trace = mywTrace('layers');

export class LayerManager extends MywClass {
    /**
     * @class Handles obtaining layer configuration and instantiating those layers
     * @param  {GeoMapControl}  map
     * @constructs
     */
    constructor(map, options) {
        super();
        this.app = map.app;
        this.options = options = options || {};

        /** @type {GeoMapControl} */
        this.map = map;
        /** @type {System} */
        this.system = this.app.system;

        /** holds the layer objects. Keyed on layer id
         * @type {Object<string, Layer>} */
        this.layers = {};

        /** Holds the layers, layer groups  and layer group items in the user's layer list.
         * It is maintained by any layer additions or deletions on the map
         * @type {Array<layerListItem>} */
        this.layerList = [];

        this._availableLayers = null;
        this._createLayerHooks = [];

        map.app.on('featureCollection-modified', this.handleFeatureChanges, this);
    }

    /**
     * Ensures the initial layer list is determined and visible layers are added to the map.
     * If the initial list hasn't been specified via a call to setLayerList (usually by LayerControl from its saved state),
     * all available layers are added as the initial list
     * @return {Promise}
     */
    ensureInitialLayers() {
        if (this._initialLayersPromise) return this._initialLayersPromise;

        let defaultListPromise;
        if (Object.entries(this.layerList).length) defaultListPromise = Promise.resolve();
        else {
            defaultListPromise = this.getDefaultLayerList().then(async layerList => {
                trace(2, 'setting layers to default layer list', layerList.length);
                //layer list may have been set meanwhile, so we check again before setting it
                await this.setLayerList(layerList, false);
            });
        }

        this._initialLayersPromise = defaultListPromise.then(() => {
            if (this.initialVisibleLayers) this.setLayersVisibility(this.initialVisibleLayers);
        });

        return this._initialLayersPromise;
    }

    /**
     * Obtains a layer list with all available layers for the current user and application.
     * @return {Promise<Array<layerListItem>>}
     */
    async getDefaultLayerList() {
        trace(2, 'getDefaultLayerList');
        const list = await this.getLayerListLayersAndGroups();
        const layerArray = [...new Set([...list.layers, ...list.layerGroups])];
        return sortBy(layerArray, 'layer_name');
    }

    /**
     * Sets the given layerList as the current layer list and adds the corresponding layers to the map
     * @param {Array<layerListItem>} layerList
     * @param {boolean} overwrite If false, it won't overwrite an existing (non-empty) list
     */
    async setLayerList(layerList, overwrite = true) {
        const applicationName = this.map.app.name;
        const result = await this.system.getStartupInfo(applicationName);

        if (this.layerList.length && !overwrite) return;

        trace(3, `setting layer list to:`, layerList);
        trace(8, `previous layer list`, this.layerList);

        //Remove any existing layers from the map and add the default layers
        if (this.layerList?.length > 0) {
            this.removeAllLayers();
        }

        for (let i = 0; i < result.layers.length; ++i) {
            if (result.layers[i].thumbnail)
                result.layers[i].thumbnail = convertUrl(result.layers[i].thumbnail);
        }

        this.layerList = this._setLayerDefs(layerList, result.layers, result.layerGroups);
        this._removeAllDuplicatedLayers();
        this._addLayersToMap(this.layerList);
    }

    /**
     * returns a new layerlist with specs and without inacessible layers
     * also  excludes layers or groups that may have had their definitions removed from the database
     * @private
     */
    _setLayerDefs(layerList, layerDefs, layerGroups) {
        const updateLayerGroup = (layerList, layerGroup) => {
            //returns a new layer list with the items from layerGroup and the state available in layerList
            //means new items in the group become available and removed items also disapear from the list
            //if layerGroup is missing, will return an empty array (empty layer list)
            const layerNames = layerGroup?.layers || [];
            const seq = layerList[0]?.sequence;
            return layerNames.map((layerName, index) => {
                const existingItem = layerList.find(l => l.layer_name === layerName);
                return {
                    type: 'layer_group_item',
                    sequence: seq, //ENH: this shouldn't be necessary
                    subsequence: index + 1, //ENH: this shouldn't be necessary
                    layer_name: layerName,
                    turned_on: existingItem?.turned_on || false,
                    zIndex: existingItem?.zIndex,
                    zIndexPointOffset: existingItem?.zIndexPointOffset
                };
            });
        };

        layerList.forEach(item => {
            if (item.type == 'layer_group') {
                const groupDef = layerGroups.find(l => l.name === item.layer_name);
                item.subLayers = updateLayerGroup(item.subLayers, groupDef);
                item.subLayers = this._setLayerDefs(item.subLayers, layerDefs);
                if (item.exclusive) {
                    item.subLayers = this._sanitizeExclusiveGroupSubLayers(item.subLayers);
                }

                if (item.subLayers.length === 0) delete item.subLayers;
                //removes the group
                else {
                    item.description = groupDef.description;
                    item.thumbnail = groupDef.thumbnail;
                    item.display_name = groupDef.display_name;
                }
            } else {
                item.layerDef = layerDefs.find(l => l.id === item.layer_name);
            }
        });

        //exclude layers or groups that may have had their definitions removed from the database
        return layerList.filter(item => item.layerDef || item.subLayers);
    }

    getLayerListLayersAndGroups() {
        return this.getAvailableLayersAndGroups().then(layersAndGroups => {
            //make the result look like a layer list

            const layers = layersAndGroups.layers.map(layerDef =>
                this._createLayerListLayerFromDef(layerDef)
            );

            const layerGroups = layersAndGroups.layerGroups.map(groupDef =>
                this._createLayerListGroupFromDef(groupDef, layers)
            );

            const groupedLayerNames = layersAndGroups.layerGroups.flatMap(l => l.layers);
            //We only show the layers that are not part of any groups
            const layersToShow = layers.filter(
                layer => !groupedLayerNames.includes(layer.layer_name)
            );

            return { layers: layersToShow, layerGroups: layerGroups };
        });
    }

    /**
     * Creates a layerListItem object using the layerDef
     * @param  {layerDefinition} layerDef
     * @return {layerListLayer}            The layer object in layerListItem format
     * @private
     */
    _createLayerListLayerFromDef(layerDef) {
        return {
            type: 'layer',
            layer_name: layerDef.id,
            turned_on: true, //By default we always want the layer to be turned on, esp. when we add a new layer or group
            layerDef: layerDef
        };
    }

    /**
     * Creates a layerListGroup object using the groupDef
     * @param  {object} groupDef
     * @param  {Array<layerDefinition>} layerDefs
     * @return {object}                 The layerListGroup object in the layerListGroup format
     * @private
     */
    _createLayerListGroupFromDef(groupDef, layers) {
        //Create layers from the subLayerNames
        let subLayersArray = groupDef.layers.reduce((prev, subLayerName) => {
            //Only the subLayers accessible to the application will be added to the subLayerArray
            const subLayer = layers.find(l => l.layer_name === subLayerName);
            if (subLayer) prev.push(subLayer);
            return prev;
        }, []);

        if (groupDef.exclusive) {
            subLayersArray = this._sanitizeExclusiveGroupSubLayers(subLayersArray);
        }

        return {
            type: 'layer_group',
            layer_name: groupDef.name,
            display_name: groupDef.display_name,
            turned_on: true, //turned on by default
            description: groupDef.description,
            exclusive: groupDef.exclusive,
            thumbnail: groupDef.thumbnail,
            subLayers: subLayersArray
        };
    }

    /**
     * Obtain all overlay layer definitions available to the current user & application
     * @return {Promise<Array<layerDefinition>>}
     */
    getAvailableLayers() {
        if (!this._availableLayers) {
            this._availableLayers = this.getAvailableLayersAndGroups().then(
                availableLayersAndGroups => availableLayersAndGroups.layers
            );
        }
        return this._availableLayers;
    }

    /**
     * Obtain all overlay layer definitions and layer group definitions available to the current user & application
     * @return {Promise<object>} Object with available layers and layerGroups
     */
    getAvailableLayersAndGroups() {
        return this.system.getStartupInfo(this.app.name).then(results => {
            const overlays = results.layers.filter(layer => layer.category == 'overlay');
            const layerGroups = this._filterAvailableLayerGroups(results.layerGroups, overlays);

            return { layers: overlays, layerGroups: layerGroups };
        });
    }

    /**
     * Removes the layerGroups that don't have any accessible layers from the list returned by the API
     * @param  {Array<object>} layerGroups List of Layer groups returned by the API (all defined layer groups)
     * @param  {Array<object>} layers      List of Layers accessible to the application
     * @return {Array<object>}             List of layerGroups with accessible layers
     * @private
     */
    _filterAvailableLayerGroups(layerGroups, layers) {
        const overlays = layers.filter(
            layer => !Object.prototype.hasOwnProperty.call(layer, 'owner')
        );
        const layerNames = overlays.map(o => o.name);
        const availableLayerGroups = [];

        layerGroups.forEach(group => {
            //If any of the group layers are accessible, add it to the list of availableLayerGroups
            if (intersection(group.layers, layerNames).length > 0) {
                availableLayerGroups.push(group);
            }
        });
        return availableLayerGroups;
    }

    /**
     * Return the layer with the provided name.
     * @param {string} id Identifier of the layer to obtain. Name for system layers
     * @return {Layer}
     */
    getLayer(id) {
        return this.layers[id];
    }

    /**
     * Returns a layer or a layer-group with the provided name in the layerList
     * @param  {string}  layerItemName Name of the layer or group to obtain
     * @param  {Boolean} isGroup       [description]
     * @return {layerListLayer|layerListGroup}                [description]
     */
    getLayerFromLayerList(layerItemName, isGroup) {
        const type = isGroup ? 'layer_group' : 'layer';
        return this.layerList.find(l => l.type === type && l.layer_name === layerItemName);
    }

    /**
     * Obtain the layers that represent a given feature type
     * @param  {string} featureType
     * @return {Array<Layer>}
     */
    getLayersForFeatureType(featureType) {
        const layers = [];

        Object.values(this.layers).forEach(layer => {
            const layerFeatureTypes = layer.layerDef.feature_types.map(f => f.name);
            if (layerFeatureTypes.includes(featureType)) {
                layers.push(layer);
            }
        });
        return layers;
    }

    /**
     * Returns the max and min zoom levels of the levels defined in each layer
     * @returns {object} { maxZoom, minZoom }
     */
    getZoomRange() {
        let maxZoom = 0;
        let minZoom = Infinity;
        for (let layer of Object.values(this.layers)) {
            const layerMaxZoom = layer.getMaxZoom();
            const layerMinZoom = layer.getMinZoom();
            if (layerMaxZoom > maxZoom) maxZoom = layerMaxZoom;
            if (layerMinZoom < minZoom) minZoom = layerMinZoom;
        }
        if (minZoom == Infinity) minZoom = 0;
        if (maxZoom == 0) maxZoom = 35;
        return { minZoom, maxZoom };
    }

    /**
     * Instantiate layers and add them to the map
     * @param {Array<layerListItem>} layerList     List of layer list items
     * @param {boolean} [active=true]              Whether the list is active/on
     * @param {boolean} [fireEvent=true]           Whether to fire the 'overlays-changed' event
     * @private
     */
    _addLayersToMap(layerList, active = true, fireEvent = true) {
        // add layer to map, and to the layer datasourceConfig
        layerList.forEach(layerListItem => {
            if (layerListItem.type == 'layer_group') {
                //add sub layers
                this._addLayersToMap(layerListItem.subLayers, layerListItem.turned_on, false);

                return; //not a layer, continue
            }

            const layerDef = layerListItem.layerDef;
            let visible;

            if (this.initialVisibleLayers) {
                visible = this.initialVisibleLayers.includes(layerDef.code);
            } else {
                visible = active && layerListItem.turned_on === true;
            }

            try {
                this._addLayerFromDef(layerDef, visible);
            } catch (e) {
                console.log('Adding layer ', layerListItem.layer_name, e);
            }
        });

        if (fireEvent) this.map.app.fire('overlays-changed');
    }

    /**
     * Instantiates a layer from a definition and adds it to the map
     * @param {layerDefinition} layerDef        A layer definition
     * @param {boolean}         setChecked      Whether the layer should be "checked", i.e. visible when enabled
     * @return {Layer} The new and added layer wrapper
     */
    addLayerFromDef(layerDef, setChecked) {
        //ENH: should return a promise for when the layer has effectively been added
        const layer = this._addLayerFromDef(layerDef, setChecked);

        //update layerList, making sure duplicates are not added
        if (!this.layerList.find(l => l.type === 'layer' && l.layer_name === layerDef.id)) {
            const layerListLayer = this._createLayerListLayerFromDef(layerDef);
            this.layerList.push(layerListLayer);
            this.map.app.fire('overlays-changed', { map: this.map, layer });
        }
        return layer;
    }

    /**
     * Instantiates a layer from a definition and adds it to the map
     * @param {layerDefinition} layerDef        A layer definition
     * @param {boolean}         setChecked      Whether the layer should be "checked", i.e. visible when enabled
     * @return {Layer} The new and added layer wrapper
     * @private
     */
    _addLayerFromDef(layerDef, setChecked) {
        let layer = this.layers[layerDef.id];
        if (!layer) {
            layer = this.createLayer(layerDef);
        }
        if (layer) {
            // add the layer to the map
            this.addLayerToMap(layer, setChecked);
        }
        return layer;
    }

    /**
     * Adds a group to the layerList and its subLayers to the map.
     * Fires the "overlays-changed" event.
     * @param {layerListGroup} group  Object with layer group properties
     * @param {Array<layerDefinition>} subLayersArray Array of layers in the group
     */
    addLayerGroupToList(group) {
        if (
            !this.layerList.find(l => l.type === 'layer_group' && l.layer_name === group.layer_name)
        ) {
            if (group.exclusive) {
                //Since its an exclusive group
                //Make all the sub layers other than the first one turned off
                //So only the first layer is turned on by default
                group.subLayers = group.subLayers.map((subLayer, index) => {
                    if (index !== 0) subLayer.turned_on = false;
                    return subLayer;
                });
            }
            this.layerList.push(group);
            this._addLayersToMap(group.subLayers);
            this._removeDuplicatedLayers(group);
        }
    }

    //  Looks through every layer group in the list and calls _removeDuplicatedLayers on it
    _removeAllDuplicatedLayers() {
        this.layerList
            .filter(entry => entry.type === 'layer_group')
            .forEach(group => this._removeDuplicatedLayers(group, true));
    }

    //  For a layer group, looks through the list for any duplicate single layers, and removes them if we finds one
    _removeDuplicatedLayers(group, suppressEvent = false) {
        const singleLayers = this.layerList.filter(entry => entry.type === 'layer');
        const groupLayerDefs = group.subLayers.map(subLayer => subLayer.layerDef);
        let hasChanged = false;
        singleLayers.forEach(singleLayer => {
            const layerDef = singleLayer.layerDef;
            if (groupLayerDefs.includes(layerDef)) {
                this.removeLayerFromList(singleLayer.layer_name, true);
                hasChanged = true;
            }
        });

        if (hasChanged && !suppressEvent) this.map.app.fire('overlays-changed', { map: this.map });
    }

    /**
     * Adds a layer to map, first checking if it should be available
     * @param {Layer} layer A record from table layer
     * @param {boolean}         setChecked  Whether the layer should be "checked", i.e. visible when enabled
     */
    addLayerToMap(layer, setChecked) {
        const layerDef = layer.layerDef;
        this.layers[layerDef.id] = layer;
        this.setLayerChecked(layerDef.id, setChecked);
    }

    /**
     * Creates a layer as specified by layerDef
     * @param  {layerDefinition}  layerDef   A record of table layer
     * @return {Layer}                       The newly created layer
     */
    createLayer(layerDef) {
        const {
            min_scale,
            max_scale,
            attribution,
            transparency,
            extraOptions,
            render_order = 0,
            render_order_point_offset = 0
        } = layerDef;

        layerDef.options = {
            ...{
                attribution,
                maxZoom: max_scale,
                minZoom: (min_scale ?? 0) - 1, //in OL, minZoom of layers (not views) is exclusive, so we need to subtract 1 to get the visibility we expect
                opacity: 1.0 - transparency / 100,
                //Overlays zIndex range = 0 to 100
                zIndex: render_order + 50,
                zIndexPointOffset: render_order_point_offset,
                schema: extraOptions?.schema
            },
            ...layerDef.options
        };

        this._createLayerHooks.forEach(hook => {
            hook(layerDef);
        });
        const datasource = this.app.getDatasource(layerDef.datasource);
        return new Overlay(datasource, layerDef, this.map);
    }

    /**
     * Saves and makes available a given private layer definition
     * @param {privateLayerDef} privateLayerDef
     * @return {Promise}
     */
    async savePrivateLayerDef(privateLayerDef) {
        privateLayerDef = await this.system.savePrivateLayer(privateLayerDef);

        //make datasource available
        const datasourceDef = {
            name: privateLayerDef.id,
            external_name: `${privateLayerDef.name} (${privateLayerDef.owner})`,
            owner: privateLayerDef.owner,
            ...privateLayerDef.datasource_spec
        };
        this.app.database.saveUserDatasource(datasourceDef);

        const startupInfo = await this.system.getStartupInfo(this.app.name);

        //make layer available
        //do startupinfo post-processing so it's stored in same structure
        privateLayerDef.datasource = privateLayerDef.id;
        Object.assign(privateLayerDef, privateLayerDef.spec);
        delete privateLayerDef.spec;

        const existingDef = startupInfo.layers.find(l => l.id === privateLayerDef.id);
        if (existingDef) Object.assign(existingDef, privateLayerDef);
        else startupInfo.layers.push(privateLayerDef);

        this._availableLayers = null;

        return privateLayerDef;
    }

    /**
     * Deletes a private layer definition
     * @param {string} id
     * @return {Promise}
     */
    async deletePrivateLayerDef(id) {
        await this.system.deletePrivateLayer(id);

        const startupInfo = await this.system.getStartupInfo(this.app.name);
        const index = startupInfo.layers.findIndex(l => l.id === id);
        startupInfo.layers.splice(index, 1);
        this._availableLayers = null;
        return true;
    }

    /**
     * get an overlay definition with the one character code
     * @param  {Array<layerDefinition>} overlayDefs
     * @param  {string} layerCode
     * @return {object}          a myWorld overlay definition object
     * @private
     */
    _getOverlayDefWithCode(overlayDefs, layerCode) {
        return overlayDefs.find(o => o.code === layerCode);
    }

    /**
     * Removes all layers from the map before adding default layers
     */
    removeAllLayers() {
        this.layerList = [];
        for (const layerName in this.layers) {
            this._removeLayer(layerName);
        }
    }

    /**
     * Removes the layer from the layerList
     * @param  {string} layerName the layer's name
     */
    removeLayerFromList(layerName, suppressEvent = false) {
        this.layerList = this.layerList.filter(
            layer => layer !== this.getLayerFromLayerList(layerName)
        );
        this._reSequenceLayerList();

        const isUnique = !this.layerList.some(layerItem =>
            layerItem.subLayers?.find(l => l.layer_name === layerName)
        );

        if (isUnique) {
            this._removeLayer(layerName);
        }
        if (!suppressEvent) this.map.app.fire('overlays-changed', { map: this.map });
    }

    //  We previously had a typo here, include it for backwards compatibility
    removeLayerFomList(layerName) {
        this.removeLayerFromList(layerName);
    }

    /**
     * Removes layer from map and from the myWorld layers object
     * @param  {string} layerName the layer's name
     * @private
     */
    _removeLayer(layerName) {
        const layer = this.getLayer(layerName);
        //if the layer exists, remove it from the map and the layer object
        if (layer) layer.setVisibility(false);

        delete this.layers[layerName];
    }

    /**
     * Removes the layer group from the map and the layerList
     * @param  {string} groupName  The group's name
     */
    removeGroup(groupName) {
        const groupInList = this.getLayerFromLayerList(groupName, true);
        this.layerList = this.layerList.filter(layer => layer !== groupInList);
        this._reSequenceLayerList();

        //Only remove the layers from map if the same layer is not present in a group in the current list
        groupInList.subLayers.forEach(subLayer => {
            const subLayerName = subLayer.layer_name;

            const isUnique = !this.layerList.some(
                layerItem =>
                    //check if its unique
                    layerItem.layer_name == subLayerName ||
                    layerItem.subLayers?.find(l => l.layer_name === subLayerName)
            );
            if (isUnique) this._removeLayer(subLayerName);
        });
    }

    /**
     * Updates the layer groups expanded property in the layerList
     * @param  {string}  groupName Name of the layer group
     * @param  {boolean} expanded  Refers to the state of the layer group in the layerControl
     */
    updateGroupExpandedState(groupName, expanded) {
        this.layerList.forEach(item => {
            if (item.layer_name === groupName) item.expanded = expanded;
        });
    }

    _reSequenceLayerList() {
        let sequence = 1;
        this.layerList.forEach(layer => {
            layer.sequence = sequence;
            if (layer.type === 'layer_group') {
                layer.subLayers.forEach(subLayer => {
                    subLayer.sequence = sequence;
                });
            }
            sequence++;
        });
    }

    /**
     * Removes all layers from the map
     */
    removeLayers() {
        for (const layerName in this.layers) {
            this.removeLayerFromList(layerName);
        }
    }

    /**
     * Returns the currently visible overlay layers
     * The layer has to be turned on and the configuration for the layer has to match the provided zoom level.
     * If a layer does not have a code then there is no entry for it in the list.
     * @return {Array<Layer>}
     */
    getVisibleLayers(zoomLevel) {
        return Object.values(this.layers).filter(
            layer => layer.isVisibleAtZoom(zoomLevel) && layer.isVisible
        );
    }

    /**
     * Returns an array of ids describing the currently ON overlay maps
     * The layer has to be turned on.
     * If a layer does not have a code then there is no entry for it in the list.
     * @return {string[]} List with ids of the layers
     */
    getCurrentLayerIds() {
        const ids = [];

        // For all of the map type collections.
        // For all of the overlays within a collection.
        Object.values(this.layers).forEach(layer => {
            const code = layer.getCode();
            // Make sure that it is the overlays that the user had turned on
            if (layer.isChecked && code !== '') {
                ids.push(code);
            }
        });
        return ids;
    }

    /**
     * Returns a description/tooltip to add to the layer item and the sublayer item in the layer control and add layer control
     * Includes the datasource external name/name for external datasources
     * @param  {layerDefinition} layerDef  Layer to be added to the layer control
     * @return {string}                    Tooltip for the layer item
     */
    getLayerItemDescription(layerDef) {
        const layer = this.layers[layerDef.id] || this.createLayer(layerDef);
        let description = layerDef.description || '';
        const datasourceExternalName = layer.datasource.getExternalName();
        const isExternalDatasource = layerDef.datasource !== 'myworld';

        if (isExternalDatasource && datasourceExternalName) {
            description += ` (${datasourceExternalName})`;
        }

        return description;
    }

    /**
     * Sets the desired visibility of a layer (the "checked" state)
     * Triggers overlayState-changed event (even if it was already in the desired state)
     * @param  {string|Layer}   layerId       The layer or the name of the layer
     * @param  {boolean}            checked         desired visibility of the overlay
     */
    setLayerChecked(layerId, checked) {
        //Update layer item in the layerList
        const layerItem = this.getLayerFromLayerList(layerId);
        if (layerItem) layerItem.turned_on = checked;

        const layer = this.getLayer(layerId);
        return layer.setVisibility(checked);
    }

    /**
     * Sets the desired visibility of a group (the "checked" state)
     * @param {string}   groupName   Name of the layer group
     * @param {bookean}  checked     Desired visibility of the group
     */
    setGroupChecked(groupName, checked) {
        const group = this.layerList.find(
            l => l.type === 'layer_group' && l.layer_name === groupName
        );
        this.getLayerFromLayerList(groupName, true).turned_on = checked;

        group.subLayers.forEach(subLayer => {
            // Only set any other layer with this name as checked since we want to preserve the turned_on state of the subLayers
            if (subLayer.turned_on) this.setLayerChecked(subLayer.layer_name, checked);
        });
    }

    /**
     * Sets the desired visibility of a layer that belongs in a group (the "checked" state)
     * @param {string}   groupName     Name of the layer group
     * @param {string}   subLayerName  Name of the layer
     * @param {bookean}  checked       Desired visibility of the layer
     * @param {bookean}  markOnly      Only update the checked status, don't make it visible
     */
    setSubLayerChecked(groupName, subLayerName, checked, markOnly) {
        const layer = this.getLayer(subLayerName);
        if (markOnly) layer.setCheckedStatus(checked);
        else layer.setVisibility(checked);

        //Update sub layer in the layerList
        this.updateSubLayerInLayerList(groupName, subLayerName, checked);
    }

    /**
     * Updates the turned_on flag of the sub-layer in the layerList
     * @param {string}   groupName     Name of the layer group
     * @param {string}   subLayerName  Name of the layer
     * @param {bookean}  checked       Desired visibility of the layer
     */
    updateSubLayerInLayerList(groupName, subLayerName, checked) {
        const group = this.layerList.find(
            l => l.type === 'layer_group' && l.layer_name === groupName
        );
        group.subLayers.find(l => l.layer_name === subLayerName).turned_on = checked;
    }

    /**
     * Sets the visibility of the layers in the application
     * @param  {string[]} visibleLayers List of ids of the layers that should be visible
     */
    async setLayersVisibility(visibleLayers) {
        const availableLayerDefs = await this.getAvailableLayers();
        let layersChanged = false;
        let layerCodesToAdd = [];

        const layersArr = Object.values(this.layers);
        if (layersArr.length) {
            //check if there are layers that were requested but weren't added and are available
            const layerCodes = layersArr.map(layer => layer.getCode());
            layerCodesToAdd = difference(visibleLayers, layerCodes);
            this._setGroupsVisible(visibleLayers);
        } else {
            //layers haven't been added yet - save the information to be used when they are added
            this.initialVisibleLayers = visibleLayers;
            layerCodesToAdd = visibleLayers;
        }

        layerCodesToAdd.forEach(layerCode => {
            //allow for forward slash in url
            if (layerCode && layerCode != '/') {
                const overlayDef = this._getOverlayDefWithCode(availableLayerDefs, layerCode);
                if (overlayDef) {
                    layersChanged = true;
                    this.addLayerFromDef(overlayDef, true);
                }
            }
        });

        if (layersChanged) {
            this.map.app.fire('overlays-changed');
        }
        return Promise.all(
            Object.entries(this.layers).map(([name, layer]) => {
                const visible = visibleLayers.includes(encodeURI(layer.getCode()));
                return this.setLayerChecked(name, visible);
            })
        );
    }

    /**
     * Since the layer groups are not included in the mapLink and bookmarks.
     * This method turns the group with a visible layer ON.
     * @param {Array<string>} layerCodes Layer codes of the visible layers
     * @private
     */
    _setGroupsVisible(layerCodes) {
        const visibleLayers = Object.values(this.layers)
            .filter(layer => layerCodes.includes(layer.layerDef.code))
            .map(layer => layer.layerDef.name);

        this.layerList.forEach(layerItem => {
            if (
                layerItem.type === 'layer_group' &&
                layerItem.subLayers.find(subLayer => visibleLayers.includes(subLayer.layer_name))
            ) {
                layerItem.turned_on = true;
            }
        }, this);
    }

    /**
     * Handler for feature collection modified event
     * Informs relevant layers that features have changed, so they can refresh
     *
     */
    handleFeatureChanges(e) {
        const layers = this.getLayersForFeatureType(e.featureType);

        layers.forEach(layer => {
            try {
                layer.featureModified(e.changeType, e.feature ?? e.features);
            } catch (error) {
                const title = e.feature?.getTitle?.() ?? e.featureType;
                console.error(
                    `Updating layer '${layer.layerDef.id}' for ${e.changeType} of '${title}':`,
                    error
                );
            }
        });
    }

    /**
     * Redraws each visible layer
     */
    redraw() {
        Object.values(this.layers).forEach(layer => {
            if (layer.isVisible) layer.redraw();
        });
    }

    getState() {
        const itemStateFunc = item => {
                const itemState = pick(item, [
                    'type',
                    'sequence',
                    'subsequence',
                    'layer_name',
                    'turned_on',
                    'exclusive',
                    'expanded'
                ]);
                if (item.type == 'layer_group') {
                    itemState.subLayers = item.subLayers.map(itemStateFunc);
                } else {
                    itemState.zIndex = item.layerDef.options.zIndex;
                }
                return itemState;
            },
            layerList = this.layerList.map(itemStateFunc);

        return layerList;
    }

    /**
     * Add a hook function which will be called just before a layer is created
     * @param {function} hook   The hook function
     * The function will be passed a layerDefinition object which is used to
     * construct the layer.
     */
    addCreateLayerHook(hook) {
        this._createLayerHooks.push(hook);
    }

    /**
     * prevent more than one sub layers is turned on in exclusive layer group
     * @param {Array<Layer>} subLayers sub layers from exclusive layer group
     * @return {Array<Layer>} sanitized sub layers
     * @private
     */
    _sanitizeExclusiveGroupSubLayers(subLayers) {
        let isAnySubLayerAlreadyOn = false;
        return subLayers.map(subLayer => {
            if (!subLayer.turned_on) return subLayer;

            if (isAnySubLayerAlreadyOn) {
                subLayer.turned_on = false;
            } else {
                isAnySubLayerAlreadyOn = true;
            }
            return subLayer;
        });
    }
}

export default LayerManager;
