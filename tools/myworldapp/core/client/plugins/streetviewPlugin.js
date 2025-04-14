// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { pick } from 'underscore';
import myw, { trace as mywTrace, Util } from 'myWorld/base';
import { Browser, latLng, Plugin, PluginButton } from 'myWorld/base';
import { MapInteractionMode, SelectionMode } from 'myWorld/map';
import { IconStyle } from 'myWorld/styles/styles';
import { GoogleBasemap } from 'myWorld/layers/googleBasemap';
import { GeoJSONVectorLayer } from 'myWorld//layers/geoJSONVectorLayer';

const trace = mywTrace('streetview');

/* globals google */

/**
 * Options for {@link StreetviewPlugin}
 * @typedef streetviewOptions
 * @property {boolean}  showSmallViewInTouch    Whether to show the small view of the streetview in the details panel, even on touch devices,
 *                                              or just a button that expands to the large view
 * @property {Number}   searchRadius=40         Radius (in meters) to use when looking for features around the panorama location
 * @property {Number}   maxLineDrawingDistance  Distance from panorama location until which line geometries are drawnLine geometries are drawn (using markers).
 *                                              Defaults to value of searchRadius*1.25
 */

export class StreetviewPlugin extends Plugin {
    static {
        this.mergeOptions({
            //see above for descriptions
            showSmallViewInTouch: true,
            searchRadius: 40,
            maxLineDrawingDistance: undefined,
            collapsed: false,
            googleDatasourceName: 'google'
        });
    }

    /**
     * @class  Plugin to provide streetview functionality to a myWorld application <br/>
     * The panorama views can be shown in a small panorama that associated with the feature
     * details or in a large panorama that will be displayed alongside the main map.
     * Triggers, on the application, a 'sv-pegman-dropped' event when the pegman is dragged and then released
     * @param  {Application}    owner   The application
     * @param  {streetviewOptions}  options
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);

        const googleDs = this.app.getDatasource(this.options.googleDatasourceName);
        if (!googleDs) return;

        this.googleDs = googleDs;

        this.showSmallView = !Browser.isTouchDevice || this.options.showSmallViewInTouch;

        const accessibleFeatureTypes = this.app.database.getFeatureTypes();

        this.featureConfig = pick(
            this.app.system.settings['core.plugin.streetview'],
            (value, key) => {
                if (!key.includes('/')) key = 'myworld/' + key;
                return !!accessibleFeatureTypes[key];
            }
        );

        //when the pegman is dragged and dropped a click event is usually fired.
        //Create a map interaction mode to prevent the default handling of the click (a selection request)
        this._pegmanInteractionMode = new MapInteractionMode(this.app.map);
        const svPlugin = this;
        this._pegmanInteractionMode.handleMapClick = () => {
            svPlugin._endPegmanDragMode();
            return true;
        };

        this._mapViewManager = this.app.layout.mapViewManager;

        this.initialized = googleDs.initialized.then(this.initializeProps.bind(this));
    }

    /**
     * Initialization that depends on Google library being available
     * Initializes the large streetview control, sets the initial mode, sets up the event handlers
     * @private
     */
    initializeProps() {
        //the Google StreetView service
        this._svService = new google.maps.StreetViewService();
        /** Current panorama where we are displaying street view - will point to either large or small panorama */
        this.panorama = null;
        /** small control - only one will be visible at any time */
        this.smallSvControl = null;
        /** large control - only one will be visible at any time */
        this.largeSvControl = null;
        /** current mode - either "small" or "large" */
        this.mode = null;
        /** Indicate whether to display markers - default is false in small mode, true in large mode */
        this.displayMarkers = false;

        // Array holding features currently displayed in StreetView - based on radius search around current location
        this.features = [];
        // Array holding markers in the panorama, one per pole. swsv.features[i] corresponds to svPanoMarkers[i]
        this.panoMarkers = [];
        // Array holding markers in the map, one per pole. swsv.features[i] corresponds to swsv.mapMarkers[i]
        this.mapMarkers = [];
        // Index for current item = references all three previous arrays
        this.curMarkerIndex = null;
        // Location of the center of the panorama
        this.panoramaLocation = null;
        this.panoId = null;

        // indicates if the previous operation was a click of the pano maker, so we can handle the subsequent currentFeature-changed event without changing the panorama
        this.panoMarkerClicked = false;
        this.addLargeViewContainer();
        this.setMode('large'); //mode to be used if the pegman is dragged onto the map

        //setup handlers for application events

        this.app.on('currentFeature-changed', e => {
            // if StreetView isn't visible, set to use the small one
            // only for desktop - in handheld we never use the small one
            trace(
                4,
                'on currentFeature-changed. Has viewManager:',
                !!this._mapViewManager,
                ' isSvControlVisible:',
                this._isSvControlVisible()
            );
            if (this._mapViewManager && !this._isSvControlVisible()) {
                this.setMode('small');
            }
            this.showStreetViewFor(this.app.currentFeature);
        });

        // if initial base map is a Google one, make sure we are aware. The map
        // may not have a base map at this point. If that is the case, then when that happens
        // we'll be notified by the 'baselayerchange' event. see below
        this.handleBaseLayerChange(this.app.map.getCurrentBaseMap());

        this.app.map.on('baselayerchange', ev => {
            this.handleBaseLayerChange(ev.layer);
        });

        this.app.map.on('rotation-change', () => {
            if (this.app.map.getRotation() !== 0 && this._isSvControlVisible()) {
                this.hidePanorama();
            }
        });

        this.app.on('detailsControlMode-changed', ev => {
            this.showStreetViewFor(ev.mode === 'edit' ? null : this.app.currentFeature);
        });
    }

    /**
     * Callback for when ViewManager resizes view due to making another one visible/hidden
     * @param  {string} width
     * @private
     */
    _onViewResize(width) {
        if (width === '50%') {
            if (this.largeSvControl.expandMoreButton) this.largeSvControl.expandMoreButton.show();
            if (this.largeSvControl.shrinkHalfButton) this.largeSvControl.shrinkHalfButton.hide();
        }
    }

    /**
     * Adds a container and html for the expanded streetview
     * @private
     */
    addLargeViewContainer() {
        const divId = this.params?.divId || 'street-view-large-container';
        const $div = $('#' + divId);
        if (!$div[0]) return;

        this.largeSvControl = new StreetviewControl(this, {
            container: $div,
            addShrinkButton: true,
            includeMarkers: true
        });
        if (this._mapViewManager)
            this._mapViewManager.register(
                'streetview',
                this.largeSvControl,
                true,
                this._onViewResize.bind(this)
            );
    }

    /**
     * Implements detailsControl interface to add a Streetview control/panorama to the details of a feature
     * @param  {Feature}    feature   Feature for which to display the panorama
     * @param  {jqueryElement}  parentDiv Div on which to append the new streetview control/panorama
     */
    updateFeatureDetailsDivFor(feature, parentDiv) {
        trace(3, 'updateFeatureDetailsDivFor');
        if (!this.smallSvControl && this._svService) {
            let containerDiv;
            if (this.showSmallView) {
                containerDiv = $(
                    '<div class="street-view-small-container smallViewContainer noselect"/>'
                );
            } else {
                containerDiv = $(
                    '<div class="left-panel-centered"><div class="feature-plugins-details-button"><span>{:streetview}</span><span class="panel-icon street-view-expandButton"></span></div></div>'
                ).click(this.expandStreetView.bind(this));
            }

            parentDiv.append(containerDiv);

            this.smallSvControl = new StreetviewControl(this, {
                container: containerDiv,
                small: true,
                addExpandButton: true,
                smallControls: true,
                collapsed: this.options.collapsed
            });
        }

        //Must recalculate pano here when small as position may be changed without currentFeature-changed being fired
        //Example: When editMode is entered, the pegman is moved, then editMode is left
        //However, when large view the position is already recalculated when moved.
        if (this.smallSvControl?.isVisible()) this.smallSvControl.show();
    }

    /**
     * Show Streetview for a given feature
     * @param  {Feature}    feature   Feature for which to display the panorama
     */
    showStreetViewFor(feature) {
        //app.hasInternetAccess can be undefined at the start or if there is some problem with the check
        if (this.app.hasInternetAccess === false || !this.googleDs.checkEnabled(false)) {
            this.hidePanorama();
            return;
        }

        if (feature?.geometry) {
            const location = feature.getGeoLocation();
            if (!this.panoMarkerClicked) {
                if (location) this.showStreetViewAt(location);
            } else {
                this.panoMarkerClicked = false; //Reset the flag
            }
        } else if (this.mode == 'small' && this._isSvControlVisible()) {
            this.hidePanorama();
        }
    }

    /**
     * Show StreetView for a given location
     * @param  {LatLng}   targetLocation
     */
    showStreetViewAt(targetLocation) {
        if (!this.panorama) {
            this._targetLocation = targetLocation;
            return;
        }

        this.findPano(targetLocation).then(result => {
            if (!result) {
                this.hidePanorama();
                this.panoramaLocation = null;
            } else {
                this.displayPano(result.id, result.location, targetLocation);
            }
        });
    }

    /**
     * Sets panorama mode to mode ("small" or "large")
     * only sets the mode, doesn't actually show or hide panorama views.
     * This is to enable that the correct panorama view is shown when the users drags the pegman to the map
     */
    setMode(mode) {
        trace(3, 'setMode', mode);
        this.mode = mode;
        this.svControl = mode == 'small' ? this.smallSvControl : this.largeSvControl;
        this.panorama = this.svControl?.panorama;

        //associate the streetview with the google map so that  the correct panorama view is shown if
        //the users drags the pegman to the map
        if (this._googleBasemap) this._googleBasemap.setStreetView(this.panorama);
    }

    /**
     * Handler for the baselayerchange event.
     * If the base layer is a google one, associate it with the panorama so that the pegman is _visible
     * @param  {Layer} layer New baselayer of the main map
     */
    handleBaseLayerChange(layer) {
        if (!layer) return;
        layer.onAddPromise.then(() => {
            const maplibLayer = layer.maplibLayer;
            if (maplibLayer && maplibLayer instanceof GoogleBasemap) {
                this._googleBasemap = maplibLayer;
                const showPegman = !this.app.isHandheld; //Don't show the pegman when using phone layout
                this._associatePanoramaToGoogleMap(showPegman);
            } else {
                this._googleBasemap = null;
            }
            this.showStreetViewFor(this.app.currentFeature);
        });
    }

    /**
     * Associates the current panorama with the googleMapView so that the pegman is displayed on the map
     * @param  {Boolean} showPegman   Whether to display the pegman on the map or not
     * @private
     */
    _associatePanoramaToGoogleMap(showPegman) {
        if (!this._googleBasemap) return;

        if (showPegman) {
            this._googleBasemap.showPegman();
            this._googleBasemap.on('pegman-mousedown', this._pegmanMouseDown.bind(this));
        }
        this._googleBasemap.setStreetView(this.panorama);
    }

    /**
     * Called at beggining of a pegman drag.
     * Ensures a panorama (usually large) is visible and starts an interaction mode which prevents
     *  selection when the mouse is released
     * @private
     */
    _pegmanMouseDown() {
        if (!this._isSvControlVisible()) {
            this.hideSmallPanorama(); //otherwise we could have two visible panoramas
            this.setMode('large');
            this.showPanorama();
        }
        //prevent selections when mouse is released
        this._ensurePegmanInteractionMode();
    }

    /**
     * Initiates the interaction mode which prevents selection and sets it up to finish when the mouse is released
     * @private
     */
    _ensurePegmanInteractionMode() {
        if (this._inPegmanDragMode) return;
        this._inPegmanDragMode = true;

        const map = this.app.map;
        const mode = this.app.map.currentInteractionMode();
        if (mode instanceof SelectionMode) {
            //Only set when SelectionMode as selection already disabled when editing
            map.setInteractionMode(this._pegmanInteractionMode);
            map.getDivElement().one('mouseup', () => {
                setTimeout(this._endPegmanDragMode.bind(this), 500);
            });
        }
    }

    _endPegmanDragMode() {
        if (!this._inPegmanDragMode) return;
        this._inPegmanDragMode = false;
        if (!this.panorama.getVisible()) {
            this.hidePanorama();
        }
        this.app.map.endCurrentInteractionMode();
        this.app.fire('sv-pegman-dropped');
    }

    _isSvControlVisible() {
        return this.svControl?.isVisible();
    }

    /** handler for pegman position changed event of large Panorama
        updates Panorama markers */
    handleSvPositionChanged() {
        this.showPanorama(); //to ensure it's visible
        this.updateSvFeatures();
    }

    /** Refreshes markers for features relevant to panorama */
    updateSvFeatures() {
        // Only do loading of features in the large panorama - for small one just return
        if (this.mode == 'small') return;

        // Get features that are relevant for the current panorama, callback will create markers
        const googleLatLng = this.panorama.getPosition(),
            database = this.app.database,
            pos = latLng(googleLatLng.lat(), googleLatLng.lng()),
            featureTypes = Object.keys(this.featureConfig);

        this.curMarkerIndex = null;

        // clear the features and clear the markers
        this.features = [];
        this.clearMarkers();

        database
            .getFeaturesAround(featureTypes, pos, this.options.searchRadius)
            .then(this.processFeatureResults.bind(this));
    }

    /**
     * Callback to handles features results relevant to the current panorama
     * Stores the features and then creates the markers
     * @param  {Array<Feature>} features    Features to display
     */
    processFeatureResults(features) {
        this.features = this.features.concat(features);

        if (!this.MarkerWithLabel) {
            return import(/* webpackChunkName: "markerwithlabel" */ '@google/markerwithlabel').then(
                markerWithLabel => {
                    this.MarkerWithLabel = markerWithLabel;
                    this.createMarkers(this.features);
                }
            );
        }
        this.createMarkers(this.features);
    }

    /**
     * Creates map markers and panorama markers for given features
     * @param  {Array<Feature>} features     The list of features
     */
    createMarkers(features) {
        if (features.length > 0 && this.displayMarkers) {
            this.clearMarkers();

            for (let i = 0; i < features.length; i = i + 1) {
                const f = features[i];
                const coords = f.getGeometry().coordinates;
                const props = f.getProperties();
                let lat;
                let lng;
                const iconUrl = Util.convertUrl(this.featureConfig[f.type].base.iconUrl);

                let titleText = f.getTitle();
                const shortDescription = f.getShortDescription();
                if (shortDescription) titleText = titleText + '\n' + shortDescription;
                if (f.getGeometryType() == 'LineString') {
                    this.createMarkersForLine(coords, iconUrl, i, titleText);
                } else {
                    if (props.myw_feature_x) {
                        // If the pole has a stored x y offset use that for the marker
                        lng = parseFloat(props.myw_feature_x);
                        lat = parseFloat(props.myw_feature_y);
                    } else {
                        lng = parseFloat(coords[0]);
                        lat = parseFloat(coords[1]);
                    }
                    const location = latLng(lat, lng);
                    const titleTextForPanoMarker =
                        `<dl><dd class='result-title'>${f.getTitle()}</dd>` +
                        `<dd>${f.getShortDescription()}</dd></dl>`;
                    const marker = this.createPanoMarker(
                        location,
                        titleTextForPanoMarker,
                        this.panorama,
                        i,
                        iconUrl,
                        true
                    );
                    this.panoMarkers[i] = marker;
                    this._addMarkerClickListener(marker, i);
                    if (!this.app.isHandheld)
                        this.mapMarkers[i] = this.createMapMarker(
                            location,
                            titleText,
                            this.app.map,
                            i,
                            f.type
                        );
                }
            }
        }
        // Set index - this should highlight current pole, and persist across moves
        this.setSvIndex(null);
    }

    /**
     * Creates markers in the current panorama so they apear as a line geometry
     * @param  {Array<coord>}   coords          The coordinates that make the line geometry
     * @param  {string}         titleText       Title for the marker
     * @param  {string}         iconUrl         Url to the image to show as icon
     * @param  {number}       featureIndex    index of the feature the coordinates relate to in this.features
     */
    createMarkersForLine(coords, iconUrl, featureIndex, titleText) {
        //ENH optimize this. use libraries
        const markers = [],
            maxDistance = this.options.maxLineDrawingDistance || this.options.searchRadius * 1.25,
            panLocationG = this.panorama.getPosition(),
            panLocation = latLng(panLocationG.lat(), panLocationG.lng());
        for (let p = 0; p < coords.length - 1; p++) {
            const x0 = Util.toRadians(parseFloat(coords[p][0])),
                y0 = Util.toRadians(parseFloat(coords[p][1])),
                x1 = Util.toRadians(parseFloat(coords[p + 1][0])),
                y1 = Util.toRadians(parseFloat(coords[p + 1][1]));

            // calculate distance between two consecutive points
            const totalDist = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2));

            // calculate the slope of the line of two consecutive points
            let slope = (y1 - y0) / (x1 - x0);
            if (slope < 0) {
                slope = -1 * slope;
            }

            // calculate points between two consecutive coordinates with a distance increment
            // ENH: use a distance in meters
            for (let dist = 0; dist < totalDist; dist = dist + 0.0000002) {
                const denomValue = Math.sqrt(1 + Math.pow(slope, 2));
                const x = x1 >= x0 ? x0 + dist / denomValue : x0 - dist / denomValue;
                const y =
                    y1 >= y0 ? y0 + (dist * slope) / denomValue : y0 - (dist * slope) / denomValue;
                const markerLocation = latLng(Util.toDegrees(y), Util.toDegrees(x));

                //only create a marker if it's close enough
                if (panLocation.distanceTo(markerLocation) <= maxDistance) {
                    markers.push(
                        this.createPanoMarker(
                            markerLocation,
                            titleText,
                            this.panorama,
                            featureIndex,
                            iconUrl,
                            false
                        )
                    );
                }
            }
        }
        this.panoMarkers[featureIndex] = markers;
    }

    /**
     * Creates a marker to represent a feature in the panorama view
     * @param  {LatLng} location          Location for the marker
     * @param  {string} titleText    Text to associate with the marker
     * @param  {google.maps.StreetViewPanorama} gmap         A google map or streetview panorama
     * @param  {Integer} featureIndex Index of the feature to represent
     * @param  {string} iconUrl      Url of the icon to use with the marker
     * @return {google.maps.Marker}  The new marker
     */
    createPanoMarker(location, titleText, gmap, featureIndex, iconUrl, withLabel) {
        const MarkerClass = withLabel ? this.MarkerWithLabel : google.maps.Marker;
        const args = {
            position: new google.maps.LatLng(location.lat, location.lng),
            map: gmap,
            title: titleText,
            icon: iconUrl
        };
        if (withLabel) {
            Object.assign(args, {
                icon: {
                    url: iconUrl
                },
                labelContent: titleText,
                labelAnchor: new google.maps.Point(-20, 71),
                labelClass: 'streetview-label'
            });
            delete args.title;
        }
        return new MarkerClass(args);
    }

    _addMarkerClickListener(marker, featureIndex) {
        google.maps.event.addListener(marker, 'click', () => {
            const reselect = featureIndex === this.curMarkerIndex;
            this.setSvIndex(featureIndex);

            if (reselect) {
                const pos = marker.getPosition(); //a google LatLng
                this.showStreetViewAt(latLng(pos.lat(), pos.lng()));
            } else {
                this.panoMarkerClicked = true;
            }
            this.app.setCurrentFeature(this.features[featureIndex]);
        });
    }

    /**
     * Creates a marker to represent a feature on a map view
     * @param  {LatLng} location    Location for the marker
     * @param  {string} titletext   Text to associate with the marker
     * @param  {MapControl} map     Map view on which to add the new marker
     * @param  {number}index      Index of the desired feature
     * @param  {string} type        Type of the feature
     * @return {MywOlFeature}           The created marker
     */
    createMapMarker(location, titletext, map, index, type) {
        const typeConfig = this.featureConfig[type];

        if (!typeConfig.baseIcon) {
            Util.fixIconDefPath(typeConfig.base);
            typeConfig.baseIcon = new IconStyle({
                iconUrl: typeConfig.base.iconUrl,
                iconAnchor: typeConfig.base.iconAnchor
            });
            Util.fixIconDefPath(typeConfig.bright);
            typeConfig.brightIcon = new IconStyle({
                iconUrl: typeConfig.bright.iconUrl,
                iconAnchor: typeConfig.bright.iconAnchor
            });
        }
        if (!this._markersLayer) {
            this._markersLayer = new GeoJSONVectorLayer({ map });
            this._markersLayer.setZIndex(1); //Ensure markers appear over other vector layers
        }
        const layer = this._markersLayer;

        const markerStyle = typeConfig.baseIcon;
        const marker = layer.addPoint([location.lng, location.lat], markerStyle);

        marker.on('click', () => {
            const reselect = index == this.curMarkerIndex;
            this.setSvIndex(index);

            if (reselect) {
                this.showStreetViewAt(marker.getLatLng());
            } else {
                this.app.setCurrentFeature(this.features[index]);
            }
        });

        return marker;
    }

    /**
     * Removes all streetview markers, from both the panorama and from the main map
     */
    clearMarkers() {
        //clear panorama Markers
        this.panoMarkers.flat().forEach(marker => {
            marker.setMap(null);
        });
        this.panoMarkers = [];

        // clear map markers
        this._markersLayer?.clear();
        this.mapMarkers = [];
        this.curMarkerIndex = null;
    }

    /**
     * Highlights a feature by setting to the bright style its corresponding markers (both the panorama and the map markers)
     * Unhighlights the markers of the previous highlighted feature
     * @param {number}i The index of the feature to be highlighted
     */
    setSvIndex(i) {
        // Resets the markers for the previous features to the normal icon current highlight, if applicable
        let featSvConfig;
        const curMarkerIndex = this.curMarkerIndex;
        const map = this.app.map;
        if (curMarkerIndex !== null && curMarkerIndex !== i) {
            featSvConfig = this.featureConfig[this.features[curMarkerIndex].type];
            if (this.mapMarkers[curMarkerIndex])
                this.mapMarkers[curMarkerIndex].setStyle(featSvConfig.baseIcon.olStyle(map));
            this.panoMarkers[curMarkerIndex]
                .getStyle()
                .setImage(Util.convertUrl(featSvConfig.base.iconUrl));
        }

        // If we received a new index, set the markers of the corresponding feature to the bright style
        if (i !== null) {
            this.curMarkerIndex = i;

            if (this.displayMarkers) {
                featSvConfig = this.featureConfig[this.features[i].type];
                if (this.mapMarkers[i])
                    this.mapMarkers[i].setStyle(featSvConfig.brightIcon.olStyle(map));
                this.panoMarkers[i].setIcon(Util.convertUrl(featSvConfig.bright.iconUrl));
            }
        }
    }

    /**
     * Obtains the panorama information for a given location
     * @param  {LatLng} location The position for which we want a panorama view
     * @returns {Promise<panoramaLocation>} Details of the panorama location found. Has id and location properties
     */
    findPano(location) {
        return new Promise((resolve, reject) => {
            const currentFeature = this.app.currentFeature;
            let targetLocation;
            if (currentFeature?.properties.myw_pano_x) {
                const x = parseFloat(currentFeature.properties.myw_pano_x),
                    y = parseFloat(currentFeature.properties.myw_pano_y);
                targetLocation = new google.maps.LatLng(y, x);
            } else {
                targetLocation = location;
            }
            if (!targetLocation) {
                resolve();
                return;
            }

            const gLatlng = new google.maps.LatLng(targetLocation.lat, targetLocation.lng);

            this._svService.getPanoramaByLocation(gLatlng, 50, (svPanoramaData, svStatus) => {
                if (svPanoramaData) {
                    const panLocationG = svPanoramaData.location.latLng;
                    const panoLocation = latLng(panLocationG.lat(), panLocationG.lng());
                    resolve({
                        id: svPanoramaData.location.pano,
                        location: panoLocation
                    });
                } else resolve();
            });
        });
    }

    /**
     * Displays the panorama associated with the information stored in panoId and panoramaLocation
     * @param  {string}   panoId
     * @param  {LatLng}   panoLocation
     * @param  {LatLng}   targetLocation
     */
    displayPano(panoId, panoLocation, targetLocation) {
        if (panoId !== this.panorama.getPano()) {
            this.panoramaLocation = panoLocation;
            this.panorama.setPano(panoId);
        }
        this.orientPano(this.panoramaLocation, targetLocation);
        this.showPanorama();
    }

    /**
     * Orients the current panorama
     * @param  {LatLng}   sourceLocation  If null, the current panorama position is used
     * @param  {LatLng}   targetLocation
     */
    orientPano(sourceLocation, targetLocation) {
        //ENH: should only take target and use panorama location
        if (!sourceLocation) {
            const p = this.panorama.getPosition();
            sourceLocation = latLng(p.lat(), p.lng());
        }

        // Calculate the heading
        let b;

        const currentFeature = this.app.currentFeature;

        if (currentFeature?.gType == 'polyline') {
            //ENH can't make sense of this....
            sourceLocation = targetLocation;

            const lastPoint = currentFeature.geometry.coordinates[1];
            targetLocation = latLng(lastPoint[1], lastPoint[0]);

            const panLocation = this.panoramaLocation;
            const dist1 = parseFloat(sourceLocation.distanceTo(panLocation));
            const dist2 = parseFloat(targetLocation.distanceTo(panLocation));

            if (dist1 > dist2) {
                b = targetLocation.bearingTo(sourceLocation);
            } else {
                b = sourceLocation.bearingTo(targetLocation);
            }
        } else {
            b = sourceLocation.bearingTo(targetLocation);
        }

        // Estimate pitch
        // And assume streetview camera height ~6ft, 2m
        const featureType = currentFeature?.getType();
        const curFeatSvConfig = this.featureConfig[featureType];
        const heightDiff =
            curFeatSvConfig && !isNaN(curFeatSvConfig['z-orientation'])
                ? curFeatSvConfig['z-orientation']
                : 1;

        const dist = sourceLocation.distanceTo(targetLocation);
        const pitch = Util.toDegrees(Math.atan2(heightDiff, dist));

        this.panorama.setPov({
            heading: b,
            zoom: 1,
            pitch: pitch
        });
    }

    /**
     * Copies panorama settings from @param {google.maps.StreetViewPanorama} pan1 to @param {google.maps.StreetViewPanorama} pan2
     * @return {boolean} true if position of pan1 is different than that of pan2
     * @private
     */
    copyPanoramaSettings(pan1, pan2) {
        const posChanged = !pan1.getPosition().equals(pan2.getPosition());
        pan2.setPano(pan1.getPano());
        pan2.setPov(pan1.getPov());
        return posChanged;
    }

    /** Makes large panorama visible
     * @private
     */
    showLargePanorama() {
        if (this._mapViewManager) this._mapViewManager.show('streetview');
        else this.largeSvControl.show();

        this.displayMarkers = true;
        this.largeSvControl.showMarkersButton.hide();
        this.largeSvControl.hideMarkersButton.show();
    }

    /** Hides large panorama
     * @private
     */
    hideLargePanorama() {
        if (this._mapViewManager) this._mapViewManager.hide('streetview');
        else this.largeSvControl?.hide();

        this.clearMarkers();
    }

    /** Makes small panorama visible
     * @private
     */
    showSmallPanorama() {
        this.smallSvControl.show();
        this.displayMarkers = false;
    }

    /** Hides small panorama
     * @private
     */
    hideSmallPanorama() {
        if (this.smallSvControl) this.smallSvControl.hide();
    }

    /**
     * Public interface
     */

    /** If hidden, turns visible the panorama for the current mode */
    showPanorama() {
        // if (!this.panorama.getVisible()) {
        if (!this._isSvControlVisible()) {
            if (this.mode == 'large') this.showLargePanorama();
            else this.showSmallPanorama();
        }
        if (this._googleBasemap.isPegmanActive()) {
            // There's an odd bug in iOS where the positioning of the pegman goes wrong. Correct that here
            // Only apply this fix if the pegman is active, otherwise causes issue in iOS when keyboard is shown in phone layout
            this._googleBasemap._mutant.getMutantContainer().style.position = 'static';
        }
    }

    /** hides the current panorama */
    hidePanorama() {
        this.clearMarkers();
        if (this._markersLayer) this.app.map?.removeLayer(this._markersLayer);

        if (this.mode == 'large') {
            this.hideLargePanorama();
        } else {
            this.hideSmallPanorama();
        }
    }

    /** returns current visible panorama */
    getPanorama() {
        return this.panorama;
    }

    /** Changes from small view of StreetView information to large view */
    expandStreetView() {
        this.hidePanorama();
        this.setMode('large');
        const posChanged = this.copyPanoramaSettings(
            this.smallSvControl.panorama,
            this.largeSvControl.panorama
        );
        this.showPanorama();
        if (!posChanged) this.updateSvFeatures(); // if position hasn't changed there will be no trigger to call handleSvPositionChanged()
    }

    /** Changes from large view of StreetView information to small view */
    shrinkStreetView() {
        this.hidePanorama();
        if (this.app.currentFeature && this.smallSvControl) {
            this.setMode('small');
            this.copyPanoramaSettings(this.largeSvControl.panorama, this.smallSvControl.panorama);
            this.showPanorama();
        }
    }

    /**
     * Hides and shows the details in the details tab
     */
    toggleCollapsed() {
        const collapse = !this.smallSvControl.isCollapsed();

        if (collapse) {
            this.smallSvControl.collapse();
            this.setMode('large'); //mode to be used if the pegman is dragged onto the map
        } else {
            this.setMode('small');
            this.smallSvControl.expand();
        }
    }

    toggleSvMarkers() {
        if (this.displayMarkers) {
            this.displayMarkers = false;
            this.clearMarkers();
        } else {
            this.displayMarkers = true;
            this.updateSvFeatures();
        }
    }

    /** added for mobile exiting streetview */
    exitStreetView() {
        this.clearMarkers();
    }

    /**
     * Implementation of TabControl's interface
     * Resizes the panorama when the left panel is toggled to show.
     * Fixes the issue where the small panaroma did not appear on left panel show,
     * if it had previously been shrunk while the panel was hidden
     */
    visibilityChanged(isVisible) {
        if (isVisible && this.panorama) {
            this.invalidateSize();
        }
    }

    invalidateSize() {
        if (this.svControl) this.svControl.invalidateSize();
    }

    getState() {
        return {
            collapsed: this.smallSvControl?.isCollapsed()
        };
    }
}

export class StreetviewControl extends Plugin {
    static {
        this.mergeOptions({
            collapsed: false
        });
    }

    /**
     * @class  Controls an area of the page where a Google Streetview panorama is to be displayed
     * @param  {StreetviewPlugin} owner
     * @param  {StreetviewControlOptions} options
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);

        this._visible = false;

        this.createUIElements(owner, options);

        if (options.collapsed) this.collapse();
    }

    /**
     * Creates the DOM elements for the control, including the goole streetview panorama and buttons
     * @param  {StreetviewPlugin} svPlugin  The SV plugin (owner)
     * @param  {StreetviewControlOptions} options  [description]
     */
    createUIElements(svPlugin, options) {
        let mainDiv;
        const that = this;
        const panoramaDivClass = options.small ? 'street-view-small' : 'street-view-large';

        this.mainDiv = mainDiv = options.container;
        mainDiv.hide().appendTo(options.container).append('<div class="clearit"></div>');

        this.panoramaDiv = $('<div/>', { class: panoramaDivClass }).appendTo(mainDiv);

        // The street view is served by google map and it is drawing with canvas and our
        // anywhere in iOS is running inside WKWebView. How iOS WKWebView handle
        // canvas cause memory issue, it will cache canvas data in memory.
        // During navigation in street view, the canvas keep updating until
        // the cache reached max memory limit, it doesn't free memory and causing
        // fail access canvas. We don't have any control about this process.
        // We can reduce the chance of it happening, disable navigation in street view
        // when using anywhere in iPad.
        const isAnywhereiOS = myw.isNativeApp && Browser.ipad;
        const allowNavigation = !isAnywhereiOS;
        const panoramaOptions = {
            addressControl: !options.smallControls, //address overlay on top left
            clickToGo: allowNavigation, // ability to click on "rectangle view"
            linksControl: allowNavigation, // arrows overlay that navigate to next location when clicked
            panControl: !options.smallControls, //compass on bottom right
            imageDateControl: true,
            visible: false,
            fullscreenControl: false,
            zoomControlOptions: {
                position: google.maps.ControlPosition.LEFT_TOP
            }
        };
        this.panorama = new google.maps.StreetViewPanorama(
            this.panoramaDiv.get(0),
            panoramaOptions
        );

        if (options.addShrinkButton) {
            $('<button title="{:display_smaller}" alt="{:display_smaller}"/>')
                .addClass('overMapButton shrinkButton')
                .click(svPlugin.shrinkStreetView.bind(svPlugin))
                .appendTo(mainDiv);

            this.shrinkHalfButton = $(
                '<button type="button" class="shrinkHalfButton overMapButton" title="{:shrink_half}"/>'
            )
                .click(this.shrinkToHalf.bind(this))
                .appendTo(mainDiv);

            this.expandMoreButton = $(
                '<button type="button" class="expandMoreButton overMapButton" title="{:expand_more}"/>'
            )
                .click(this.expandFull.bind(this))
                .appendTo(mainDiv);
        }

        if (svPlugin.showSmallView && options.addExpandButton) {
            this.smallViewHeader = $(
                '<div class="feature-plugins-header noselect">{:streetview}</div>'
            )
                .click(svPlugin.toggleCollapsed.bind(svPlugin))
                .prependTo(mainDiv);

            $('<button title="{:display_large}" alt="{:display_large}"/>')
                .addClass('overMapButton street-view-expandButton')
                .click(svPlugin.expandStreetView.bind(svPlugin))
                .appendTo(this.panoramaDiv);
        }
        if (options.includeMarkers) {
            this.hideMarkersButton = $(
                '<button id = "street-view-hideMarkersButton" title="{:no_markers}" alt="{:no_markers}"/>'
            )
                .addClass('overMapButton')
                .click(function (e) {
                    $(this).hide();
                    that.showMarkersButton.show();
                    svPlugin.toggleSvMarkers();
                })
                .appendTo(mainDiv);

            this.showMarkersButton = $(
                '<button id = "street-view-showMarkersButton" title="{:show_markers}" alt="{:no_markers}"/>'
            )
                .addClass('overMapButton')
                .click(function (e) {
                    $(this).hide();
                    that.hideMarkersButton.show();
                    svPlugin.toggleSvMarkers();
                })
                .appendTo(mainDiv);

            google.maps.event.addListener(
                this.panorama,
                'position_changed',
                svPlugin.handleSvPositionChanged.bind(svPlugin)
            );
        }

        this.translate(mainDiv);
    }

    /**
     * Shows the control and panorama
     */
    show() {
        this.mainDiv.show();
        if (!this._collapsed) {
            this._visible = true;
            this.panorama.setVisible(true);
        }
    }

    /**
     * Hides the control (and panorama)
     */
    hide() {
        this.mainDiv.hide();
        this.panorama.setVisible(false);

        this._visible = false;
    }

    collapse() {
        this.smallViewHeader.toggleClass('collapsed', true);
        this.mainDiv.css('height', '40px');
        this.panoramaDiv.hide();
        this.panorama.setVisible(false);
        this._visible = false;
        this._collapsed = true;
    }

    expand() {
        this.smallViewHeader.toggleClass('collapsed', false);
        this.mainDiv.css('height', '240px');
        this.panoramaDiv.show();
        this.panorama.setVisible(true);
        this._visible = true;
        this._collapsed = false;
    }

    /**
     * Handler when the expand full button is pressed
     */
    expandFull() {
        this.mode = 'fullscreen';
        if (this.owner._mapViewManager.showInFull('streetview')) {
            this.expandMoreButton.hide();
            this.shrinkHalfButton.show();
            this.invalidateSize();
        }
    }

    /**s
     * Shrink large container to half the screen
     */
    shrinkToHalf() {
        this.mode = 'halfscreen';
        if (this.owner._mapViewManager) this.owner._mapViewManager.show('streetview');
        this.expandMoreButton.show();
        this.shrinkHalfButton.hide();
        this.invalidateSize();
    }

    css(options) {
        this.mainDiv.css(options);
    }

    /**
     * @return {Boolean} Whether self is visible or not
     */
    isVisible() {
        return this._visible;
    }

    isCollapsed() {
        return this._collapsed;
    }

    invalidateSize() {
        google.maps.event.trigger(this.panorama, 'resize');
    }
}

class StreetviewCurrentFeatureButton extends PluginButton {
    static {
        this.prototype.id = 'details-streetview';
        this.prototype.titleMsg = 'streetview';
    }

    render() {
        const currentFeature = this.app.currentFeature,
            active = this.app.hasInternetAccess && currentFeature && this.owner.panoramaLocation;

        this.$el.prop('class', active ? 'active' : 'inactive');

        if (active) this.delegateEvents();
        else this.undelegateEvents();
    }

    action() {
        this.app.layout.showStreetview();
        this.owner.showStreetViewAt(this.app.currentFeature.getGeoLocation());
        this.owner.visibilityChanged(true);
    }
}

StreetviewPlugin.prototype.buttons = {
    currentFeature: StreetviewCurrentFeatureButton
};

export default StreetviewPlugin;
