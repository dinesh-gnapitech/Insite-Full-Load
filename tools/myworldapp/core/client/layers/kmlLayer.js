// Copyright: IQGeo Limited 2010-2023
import BaseVectorLayer from 'ol/layer/BaseVector';
import KMLFormat, { getDefaultStyle as getDefaultKMLStyle } from 'ol/format/KML';
import CanvasVectorLayerRenderer from 'ol/renderer/canvas/VectorLayer.js';
import ImageState from 'ol/ImageState.js';
import GeoJSONSource from './geoJSONSource';
import { HtmlFieldViewer } from '../controls/feature/htmlFieldViewer';
import { getUserProjection } from 'ol/proj';

const CDATA_REGEX = /^<!\[CDATA\[(.*)\]>$/;

/**
 * A modified ol/renderer/canvas/VectorLayer.js that applies several tweaks
 * @private
 */
export class MywKmlLayerRenderer extends CanvasVectorLayerRenderer {
    /**
     * Before rendering any features, we tweak the styles a little bit
     * @override
     * @param {*} feature
     * @param {*} squaredTolerance
     * @param {*} styles
     * @param {*} builderGroup
     * @param {*} opt_transform
     */
    renderFeature(feature, squaredTolerance, styles, builderGroup, opt_transform) {
        if (!styles) {
            return false;
        }

        if (Array.isArray(styles)) {
            for (var i = 0, ii = styles.length; i < ii; ++i) {
                this._imageHack(styles[i]);
            }
        } else {
            this._imageHack(styles);
        }

        return super.renderFeature(feature, squaredTolerance, styles, builderGroup, opt_transform);
    }

    /**
     * Removes the broken crossOrigin property from the style, and on load, forces the size to become close to 32x32 before applying scaling
     * @param {ol/style/Style} style The style of the feature
     */
    _imageHack(style) {
        //  This will be an ImageIcon
        const icon = style.getImage();
        if (icon.getImageState() === ImageState.IDLE) {
            const domImage = icon.getImage();
            domImage.crossOrigin = null;
            domImage.addEventListener('load', function () {
                //  Rendering is done by setting the scale. Force modify the scale so that it is as close to 32x32 as possible, then re-apply previously set scale
                const xScale = 32 / this.naturalWidth;
                const yScale = 32 / this.naturalHeight;
                const newScale = Math.min(xScale, yScale);
                icon.setScale(icon.getScale() * newScale);
                icon.setAnchor([0.5, 0.5]);
            });
            icon.load();
        }
    }
}

/**
 * A modified ol/format/KML that grabs the innerHTML from the description tag instead of the innerText
 * @private
 */
export class MywKMLFormat extends KMLFormat {
    constructor(opt_options) {
        //  The default style here has a solid white background
        //  Override it here
        let defaultStyle = getDefaultKMLStyle();
        super(opt_options);
        if (defaultStyle === null) {
            defaultStyle = getDefaultKMLStyle();
            defaultStyle.getFill().setColor([255, 255, 255, 0]);
            defaultStyle.getStroke().setColor([255, 255, 255, 0]);
        }
    }
    /**
     * Iterates through every node, and for each name, deletes the value from stripFrom and puts it into stripTo
     * @param {Node} node
     * @param {Object} stripFrom
     * @param {Object} stripTo
     */
    _stripValues(node, stripFrom, stripTo) {
        Array.prototype.forEach.call(node, node => {
            const nodeName = node.getAttribute('name');
            const nodeValue = node.innerHTML;
            const parsedValue = stripFrom[nodeName];
            if (parsedValue?.innerHTML != 'null') {
                delete stripFrom[nodeName];

                //  Check if this uses CDATA, since OpenLayers just strips it out and doesn't turn the contents into raw HTML
                const matches = nodeValue.match(CDATA_REGEX);
                if (matches) {
                    stripTo[nodeName] = nodeValue;
                } else {
                    stripTo[nodeName] = parsedValue;
                }
            }
        });
    }

    /**
     * Replaces any description tags with the innerHTML instead of the innerText
     * @override
     * @param {*} place
     * @param {*} objectStack
     */
    readPlacemark_(place, objectStack) {
        const ret = super.readPlacemark_(place, objectStack);
        //  By default, the returned value has everything from Data and SimpleData, as well as stuff we don't want to render, such as the styleURL
        //  To get around this, iterate through each node of these types and strip the values into a different object
        const retProperties = ret.getProperties();

        const nameValue = place.getElementsByTagName('name')[0]?.innerHTML;
        const snippetValue = place.getElementsByTagName('Snippet')[0]?.innerHTML;
        const name = nameValue || snippetValue || 'Placemark';
        const description = place.getElementsByTagName('description')[0]?.innerHTML;

        const properties = {
            name,
            description
        };
        const elData = place.getElementsByTagName('Data');
        this._stripValues(elData, retProperties, properties);
        const elSimpleData = place.getElementsByTagName('SimpleData');
        this._stripValues(elSimpleData, retProperties, properties);

        //  There's no way to clear the properties in the original return value, so forcefully override them here
        retProperties['name'] = name;
        ret.values_ = retProperties;
        ret.myw_properties = properties;
        return ret;
    }

    readFeatures(feature) {
        return super.readFeatures(feature, {
            featureProjection: getUserProjection()
        });
    }
}

/**
 * A layer that handles rendering from a KML file
 */
export class KmlLayer extends BaseVectorLayer {
    /**
     * @param {String} url The KML file to load
     * @param {Object} layerDef The layer definition
     * @param {Object} datasource The datasource
     */
    constructor(url, layerDef, datasource) {
        const layerOptions = layerDef.options;
        super(layerOptions);
        this.layerDef = layerDef;
        this.options = layerOptions;
        this.datasource = datasource;

        const source = this._createSource(url);
        this.setSource(source);
    }

    /**
     * Returns our own custom renderer
     * @override
     * @returns {MywKmlLayerRenderer}
     */
    createRenderer() {
        return new MywKmlLayerRenderer(this);
    }

    /**
     * Stores a reference to the map and logs data access
     * @param {Map} map
     * @returns {Boolean}
     */
    onAdd(map) {
        this.setMap(map);
        this._map = map;
        this.datasource.system.recordDataAccess(
            this.datasource.database.applicationName,
            `layer.${this.layerDef.name}`
        );
        return true;
    }

    /**
     * Clears the stored reference to the map
     * @param {Map} map
     */
    onRemove(map) {
        this._map = null;
        this.setMap(null);
    }

    /**
     * Performs a select of features around the specified LatLng
     * @param {LatLng} latLng
     * @returns {Promise<Array<Object>>}
     */
    async select(latLng) {
        const pixel = this._map.latLngToPixel(latLng);
        const features = await this.getFeatures(pixel);
        return this._processResults(features);
    }

    /**
     * Performs a box select of points in the specified LatLngBounds
     * @param {LatLngBounds} bounds
     * @returns {Promise<Array<Object>>}
     */
    async selectBox(bounds) {
        const features = this.getSource().getFeaturesInBounds(bounds);
        return this._processResults(features);
    }

    /**
     * Internal function to generate our own custom source. Can be overridden in other classes
     * @param {String} url The URL to fetch
     * @returns {ol/source/Vector}
     * @private
     */
    _createSource(url) {
        const sourceOptions = {
            url,
            format: new MywKMLFormat({
                showPointNames: false
            })
        };
        return new GeoJSONSource(sourceOptions);
    }

    /**
     * Internal function to convert fetched KML features into myWorld recognisable features
     * @param {Array<Object>} features
     * @returns {Array<Object>}
     * @private
     */
    _processResults(features) {
        const ret = [];
        for (let feature of features) {
            if (!feature) continue;
            ret.push(this._processFeature(feature));
        }
        return ret;
    }

    _processFeature(feature) {
        let clazz = this.datasource._getFeatureClassFor('kml_entity');
        clazz.prototype.fieldViewers = { description: HtmlFieldViewer };

        const featureGeom = feature.getGeometry();
        const coordsFlat = featureGeom.getFlatCoordinates();
        const newCoordsFlat = new Array(coordsFlat.length);
        const featureGeomClone = featureGeom.clone();
        for (let i = 0; i < coordsFlat.length; i += 3) {
            const newCoords = this._map.toLatLng(coordsFlat.slice(i, i + 3));
            newCoordsFlat[i] = newCoords.lng;
            newCoordsFlat[i + 1] = newCoords.lat;
            newCoordsFlat[i + 2] = 0;
        }
        featureGeomClone.setFlatCoordinates(featureGeomClone.getLayout(), newCoordsFlat);
        const name = feature.get('name');
        const featureData = {
            geometry: featureGeomClone,
            id: name,
            properties: Object.assign(
                {
                    name,
                    description: feature.get('description')
                },
                feature.myw_properties
            )
        };
        const newfeature = new clazz(featureData);
        newfeature.getTitle = () => name;
        newfeature.getFieldDD = internalName => {
            const ret = clazz.prototype.getFieldDD.call(this, internalName);
            const matches = feature.myw_properties[internalName]?.match(CDATA_REGEX);
            if (matches) {
                ret['type'] = 'kml_html';
            }
            return ret;
        };
        return newfeature;
    }
}

export default KmlLayer;
