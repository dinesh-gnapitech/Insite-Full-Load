// Copyright: IQGeo Limited 2010-2023
import { Plugin, PluginButton } from 'myWorld/base';
import geometry from 'myWorld/geometry/geometry';
import { TabPanel, Dialog } from 'myWorld/uiComponents/';
import { IconStyle } from 'myWorld/styles';
import traceService from './tracePluginService';
import { TraceOutPane } from './traceOutPane';
import { TraceFindRoutePane } from './findRoutePane';
import { GeoJSONVectorLayer } from 'myWorld/layers/geoJSONVectorLayer';
import networkTraceImg from 'images/toolbar/network-trace.svg';
import greenImg from 'images/markers/green.png';
import redImg from 'images/markers/red.png';

// Provides GUI for tracing from current feature
export class TracePlugin extends Plugin {
    static {
        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.titleMsg = 'toolbar_msg';
                    this.prototype.imgSrc = networkTraceImg;
                }

                action() {
                    this.app.recordFunctionalityAccess('core.toolbar.network_trace');
                    this.owner.toggleDialog();
                }
            }
        };

        this.prototype.state = {};
    }

    /**
     * @class Plugin with a dialog to run network traces
     * Provides a 'dialog' button to open the dialog
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.owner = owner;
        this.database = this.app.database;
        const self = this;
        this.resetState();

        this.traceOutPanel = new TraceOutPane({
            app: this.app,
            owner: this.owner
        });

        const findRoutePanel = new TraceFindRoutePane({
            name: 'tracePanel',
            app: this.app,
            owner: this.owner
        });

        this.tabPanel = new TabPanel({
            app: this.app,
            selected: 0,
            tabs: [
                { title: this.msg('trace_out_tab_title'), pane: this.traceOutPanel },
                { title: this.msg('find_route_tab_title'), pane: findRoutePanel }
            ]
        });

        this.dialog = new Dialog({
            title: this.msg('modal_title'),
            dialogClass: 'networkTraceModal',
            contents: this.tabPanel.$el,
            modal: false,
            buttons: null,
            autoOpen: false,
            minWidth: 450,
            minHeight: 295
        });
        this.dialog.render();

        this.dialog.$el.on('dialogclose', () => {
            self.owner.fire('tracePlugin-close');
            self._clearMarkers();
            self.resetState();
        });

        this._registerEvents();
    }

    resetState() {
        this.state = {
            active: false,
            activeTab: 0,
            selectedFeatures: {
                from: null,
                to: null
            },
            availableNetworks: [],
            availableDirections: [],
            availableSubpaths: [],
            network: null
        };
    }

    toggleDialog() {
        const d = this.dialog.$el;
        const isOpen = d.dialog('isOpen');

        if (isOpen) {
            d.dialog('close');
            return;
        }

        d.dialog('open');
        this.state.active = true;

        geometry.init().then(() => {
            const feature = this.app.currentFeature;
            if (feature) {
                this.owner.fire('tracePlugin-setFromFeature', { feature: feature });
            }
        });
    }

    /*
     * Updates internal state and dispatches new state information to tab panels
     */
    _triggerRender() {
        const state = this.state;
        const owner = this.owner;
        owner.fire('tracePlugin-stateChange', state);
    }

    _registerEvents() {
        const owner = this.owner;
        const app = this.app;
        const self = this;

        app.on('currentFeature-changed', args => {
            self._triggerRender(self.state);
        });

        app.on('tabPanel-activeTab', tab => {
            self.state.activeTab = tab.id;
            self._clearMarkers();
            self._displayMarkers();
        });

        owner.on('tracePlugin-setFromFeature', args => {
            const feature = args.feature;
            self.state.selectedFeatures.from = feature;
            self._displayFromMarker();
            self._getNetworkAndDirection(feature);
        });

        owner.on('tracePlugin-setToFeature', args => {
            const feature = args.feature;
            self.state.selectedFeatures.to = feature;
            self._displayToMarker();
            self._triggerRender(self.state);
        });
    }

    _displayMarkers() {
        switch (this.state.activeTab) {
            case 0:
                this._displayFromMarker();
                break;
            default:
                this._displayFromMarker();
                this._displayToMarker();
        }
    }

    _getNetworkAndDirection(feature) {
        const state = this.state;
        const self = this;
        traceService
            .getFeatureNetwork(feature)
            .then(response => {
                state.networks = response.networks;
                state.availableNetworks = Object.entries(response.networks)
                    .map(([id, value]) => ({
                        id,
                        label: this.app.localise(value.external_name, id)
                    }))
                    .filter(e => !!e.label) //exclude networks where display name is not set
                    .sort((a, b) => {
                        if (a.label < b.label) return -1;
                        if (a.label > b.label) return 1;
                        return 0;
                    });
                state.network = response.selectedNetwork;
                state.availableDirections = [];
                self._triggerRender(state);
            })
            .catch(e => {
                console.log('error', e);
                state.networks = {};
                state.availableNetworks = [];
                state.availableDirections = [];
                state.network = null;
                self._triggerRender(state);
            });
    }

    _displayFromMarker() {
        const state = this.state;
        const feature = state.selectedFeatures.from;

        if (state.active && feature) {
            if (state.fromMarker) this._overlay.remove(state.fromMarker);
            const m = this._renderMarker(feature, 'From', 'green');
            state.fromMarker = m;
        }
    }

    _displayToMarker() {
        const state = this.state;
        const feature = state.selectedFeatures.to;

        if (state.active && feature) {
            if (state.toMarker) this._overlay.remove(state.toMarker);
            this.state.toMarker = this._renderMarker(feature, 'To', 'red');
        }
    }

    /**
     * Render either a green 'From' marker or a red 'To' marker
     * Places marker at middle of linestring, on a point, or on first point of polygon
     * @param {FeatureRepresentation} feature
     * @param {string} label for tooltip
     * @param {string} type red or green
     * @returns {ol/Feature} openlayers point feature
     * @private
     */
    _renderMarker(feature, label, type) {
        const geom = feature.getGeometry();
        if (!geom) return;

        let layer = this._overlay;
        if (!layer) {
            //setup overlay to show markers
            const map = this.app.map;
            const zIndex = 130; //Ensure markers appear over other vector layers
            layer = this._overlay = new GeoJSONVectorLayer({ map, zIndex });
        }

        const markerStyle = this._getTracePluginMarkerStyle(type);
        let markerPosition;
        //Get marker position
        if (geom.type == 'LineString') {
            //Find middle point of linestring
            const length = geom.length() / 2;
            markerPosition = feature.getGeometry().pointAtDistance(length).coordinates;
        } else if (geom.type == 'Polygon') {
            //get any (first) coordinate
            markerPosition = feature.getGeometry().coordinates[0][0];
        } else {
            //point
            markerPosition = feature.getGeometry().coordinates;
        }

        return this._overlay.addPoint(markerPosition, markerStyle).bindTooltip(label);
    }

    _getTracePluginMarkerStyle(type) {
        const iconUrl = type === 'green' ? greenImg : redImg;
        return new IconStyle({ iconUrl, iconAnchor: [0.5, 1] });
    }

    /*
     * Removes both from and to markers from map, if displayed
     */
    _clearMarkers() {
        const state = this.state;
        this._overlay?.clear();
        state.fromMarker = null;
        state.toMarker = null;
    }
}
