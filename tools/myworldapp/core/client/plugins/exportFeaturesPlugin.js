// Copyright: IQGeo Limited 2010-2023
import convert from 'xml-js';
import JSZip from 'jszip';
import webColorsList from './webcolors.json';
import StyleManager from 'myWorld/layers/styleManager';
import { Plugin, PluginButton } from 'myWorld-base';
import { UnitScale } from 'myWorld/base/unitScale';
import { Feature } from 'myWorld/features/feature';
import { GeocodeFeature } from 'myWorld/features/geocodeFeature';

import {
    Style,
    PointStyle,
    SymbolStyle,
    IconStyle,
    LineStyle,
    FillStyle,
    LookupStyle
} from '../styles/styles';
import exportImg from 'images/actions/export.svg';
import exportInactiveImg from 'images/actions/export-inactive.svg';

export class FeatureExporter {
    constructor(owner) {
        this.owner = owner;
        this.options = owner.options;
    }

    export() {
        const features = this.owner._getCurrentFeatures();
        this._run(features);
    }

    _run(features) {
        throw new Error('Not Implemented');
    }

    _download(url, filename) {
        const element = document.createElement('a');
        element.setAttribute('href', url);
        element.setAttribute('download', filename ? filename : url);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    generateDownload(content, filename) {
        if (!(content instanceof Blob)) {
            content = new Blob([content], { type: 'octet/stream' });
        }

        this._download(window.URL.createObjectURL(content), filename);
    }
}

export class JSONCSVFeatureExporter extends FeatureExporter {
    async _sendFeatureData(features, formattedFeatures, resultedFeatures, exportFormat) {
        //Make sure the features are completely loaded(have all their attributes)
        const promises = features.map(feature => feature.ensure(['simple', 'calculated']));

        // Perform the export action only when all the promises are resolved
        // Ignore the ones that are not resolved
        await Promise.allSettled(promises);
        resultedFeatures = this._formatFeatures(resultedFeatures, features);
        this._postData(exportFormat, formattedFeatures);
    }

    _formatFeatures(resultedFeatures, features) {
        throw new Error('Not Implemented');
    }

    _formatFeature(feature) {
        const aFeature = {};
        const fieldsOrder = feature.getFieldsOrder();
        const fieldsDD = feature.getFieldsDD();

        fieldsOrder.forEach(internalFieldName => {
            const fieldDD = fieldsDD[internalFieldName];
            const requiresUnitConversion = Boolean(
                fieldDD.display_unit && fieldDD.display_unit != fieldDD.unit
            );
            let propertyName = internalFieldName;
            let propertyValue = feature.properties[internalFieldName];

            // get external names and use it for exported file
            if (this.options.useExternalNames) {
                propertyName = fieldDD['external_name'];
            }
            // convert to display_unit if required.
            if (requiresUnitConversion) {
                const unit_scale = fieldDD.unit_scale;
                const fromUnit = fieldDD.unit;
                const toUnit = fieldDD.display_unit;

                const conf = this.owner.app.system.settings['core.units'][unit_scale];
                const unitScale = new UnitScale(conf);
                propertyValue = unitScale.convert(propertyValue, fromUnit, toUnit);
            }

            aFeature[propertyName] = propertyValue;
        });

        return aFeature;
    }

    /**
     * Parses thorugh the features/address and adds the following attributes:
     * -address
     * -latitude
     * -longitude
     * @return {object} modified 'resultedFeatures'
     * @private
     */
    _formatAddresses(features) {
        return features.map(feature => ({
            address: escape(feature.formattedAddress),
            latitude: feature.getLocation().lat,
            longitude: feature.getLocation().lng
        }));
    }

    /**
     * Ajax POST for the formattedFeatures data and triggers a download
     * Also adds the encoding to the request in the case of csv export
     * @private
     */
    async _postData(exportFormat, formattedFeatures) {
        const exportResponse = await this.owner.app.system.export(exportFormat, formattedFeatures);
        this.generateDownload(exportResponse.body, exportResponse.filename);
    }
}

export class JSONFeatureExporter extends JSONCSVFeatureExporter {
    /**
     * Exports the current feature set or current feature to Json
     */
    _run(features) {
        const formattedFeatures = {
            type: 'FeatureCollection',
            features: []
        };
        const resultedFeatures = formattedFeatures['features'];

        if (features[0] instanceof Feature) {
            //database results
            this._sendFeatureData(features, formattedFeatures, resultedFeatures, 'json');
        } else if (features[0] instanceof GeocodeFeature) {
            // geocode results
            formattedFeatures['features'] = this._formatAddresses(features);
            this._postData('json', formattedFeatures);
        }
    }

    /**
     * Parses through the features:
     * -adds a unique id and myWorldLink to each feature
     * -removes all the feature attributes that are 'myw_' suffixed
     *
     * @return {object} modified 'resultedFeatures'
     * @private
     */
    _formatFeatures(resultedFeatures, features) {
        features.forEach(feature => {
            // format data for export to JSON
            const aFeature = {
                myw_short_description: feature.getShortDescription(),
                myw_title: feature.getTitle(),
                properties: this._formatFeature(feature),
                ID: feature.id,
                type: 'Feature',
                geometry: feature.geometry
            };
            resultedFeatures.push(aFeature);
        });
        return resultedFeatures;
    }
}

export class CSVFeatureExporter extends JSONCSVFeatureExporter {
    /**
     * Exports the current feature or current feature set to CSV
     */
    _run(features) {
        const formattedFeatures = { results: {} };
        const resultedFeatures = formattedFeatures['results'];
        if (features[0] instanceof Feature) {
            //database results
            this._sendFeatureData(features, formattedFeatures, resultedFeatures, 'csv');
        } else if (features[0] instanceof GeocodeFeature) {
            // geocode results
            resultedFeatures['google_addresses'] = this._formatAddresses(features);
            this._postData('csv', formattedFeatures);
        }
    }

    /**
     * Parses through the features:
     * -adds a unique id and myWorldLink to each feature
     * -removes all the feature attributes that are 'myw_' suffixed
     *
     * @return {object} modified 'resultedFeatures'
     * @private
     */
    _formatFeatures(resultedFeatures, features) {
        features.forEach(feature => {
            // check for object type and create new list
            const featureObjectType = feature.getType();
            if (!Object.prototype.hasOwnProperty.call(resultedFeatures, featureObjectType)) {
                resultedFeatures[featureObjectType] = [];
            }
            // select only the fields without myw_
            const aFeature = this._formatFeature(feature);
            // add unique id for the report
            Object.assign(aFeature, {
                'unique id': feature.id,
                myWorldLink: this._mapLink(feature),
                myw_short_description: feature.getShortDescription(),
                myw_title: feature.getTitle()
            });
            // Add the feature to the object
            resultedFeatures[featureObjectType].push(aFeature);
        });
        return resultedFeatures;
    }

    /**
     * Creates a map link for the passed feature
     *
     * @return: url for the feature on the map with all the visible layers
     * @private
     */
    _mapLink(feature) {
        if (!feature.getType()) return '';

        // get turned on layers
        const currentLayers = this.owner.app.map.getCurrentLayerIds();
        const layersArg = currentLayers.length ? `&layers=${currentLayers}` : '';

        let url = this.owner.app.getUrl();
        if (url.endsWith('#')) {
            url = url.substring(0, url.length - 1);
        }
        url += `?s=${encodeURIComponent(feature.getUrn())}${layersArg}`;
        return url;
    }
}

export class KMLFeatureExporter extends FeatureExporter {
    /**
     * Exports the current feature set or current feature to KML
     */
    _run(features) {
        const first = features[0];
        this.generateDownload(this.generateKml(features), `${first.getType()}_export.kml`);
    }

    generateKml(features) {
        const styleManager = new StyleManager();
        let featureTypesStyles = {};

        features.map(feature => {
            const type = feature.getType();
            if (featureTypesStyles[type]) return; //If we already have styles for this featureType, skip.

            feature.datasource.layerDefs
                .filter(layerDef => layerDef.rendering === 'vector')
                .forEach(layerDef => {
                    const styleDef = layerDef.feature_types.find(
                        featureType =>
                            featureType.name === type && featureType.field_name != 'annotation'
                    );

                    if (!styleDef) return; //If we don't have a styleDef, we're done for this feature

                    let style = undefined;
                    if ('line_style' in styleDef && 'fill_style' in styleDef) {
                        style = styleManager.getPolygonStyle(
                            styleDef.line_style,
                            styleDef.fill_style
                        );
                        if (style instanceof LookupStyle)
                            style = style.defaultStyle || style.lookup[0];
                    } else if ('line_style' in styleDef) {
                        style = styleManager.getLineStyle(styleDef.line_style);
                        if (style instanceof LookupStyle)
                            style = style.defaultStyle || style.lookup[0];
                    } else if ('point_style' in styleDef) {
                        style = styleManager.getPointStyle(styleDef.point_style);
                        if (style instanceof LookupStyle)
                            style = style.defaultStyle || style.lookup[0];
                    }

                    if (style) featureTypesStyles[type] = style;
                });
        });

        return convert.js2xml(
            {
                _declaration: {
                    _attributes: {
                        version: '1.0',
                        encoding: 'utf-8'
                    }
                },
                kml: {
                    _attributes: {
                        xmlns: 'http://www.opengis.net/kml/2.2',
                        'xmlns:gx': 'http://www.google.com/kml/ext/2.2',
                        'xmlns:kml': 'http://www.opengis.net/kml/2.2',
                        'xmlns:atom': 'http://www.w3.org/2005/Atom'
                    },
                    Document: {
                        Style: Object.entries(featureTypesStyles).map(([id, style]) => {
                            let s = {
                                _attributes: {
                                    id
                                }
                            };

                            this._appendKMLStyle(s, style);
                            return s;
                        }),
                        Placemark: features.map(feature => {
                            let doc = {
                                name: feature.getTitle(),
                                styleUrl: `#${feature.getType()}`,
                                ExtendedData: {
                                    Data: Object.keys(feature.properties).map(prop => ({
                                        _attributes: { name: prop },
                                        value: this._formatKMLValue(feature, prop)
                                    }))
                                }
                            };

                            if (!feature.geometry) return doc; //ENH: Raise a warning

                            switch (feature.geometry.type) {
                                case 'LineString':
                                    doc['LineString'] = {
                                        extrude: { _text: 1 },
                                        altitudeMode: { _text: 'clampToGround' },
                                        coordinates: {
                                            _text: this._formatCoords(feature.geometry.coordinates)
                                        }
                                    };
                                    break;
                                case 'Point':
                                    doc['Point'] = {
                                        coordinates: {
                                            _text: feature.geometry.coordinates.toString()
                                        }
                                    };
                                    break;
                                case 'Polygon':
                                    doc['Polygon'] = {
                                        extrude: { _text: 1 },
                                        altitudeMode: { _text: 'clampToGround' },
                                        outerBoundaryIs: {
                                            LinearRing: {
                                                coordinates: {
                                                    _text: this._formatCoords(
                                                        feature.geometry.coordinates[0]
                                                    )
                                                }
                                            }
                                        }
                                    };
                                    break;
                                case 'MultiLineString':
                                    doc['MultiGeometry'] = {
                                        LineString: feature.geometry.coordinates.map(points => ({
                                            coordinates: this._formatCoords(points)
                                        }))
                                    };
                                    break;

                                case 'MultiPoint':
                                    doc['MultiGeometry'] = {
                                        Point: feature.geometry.coordinates.map(points => ({
                                            coordinates: points.toString()
                                        }))
                                    };
                                    break;

                                case 'MultiPolygon':
                                    doc['MultiGeometry'] = {
                                        Polygon: feature.geometry.coordinates.map(group => {
                                            const outer = group[0];
                                            group.shift();
                                            const inner = group;
                                            return {
                                                extrude: { _text: 1 },
                                                altitudeMode: { _text: 'clampToGround' },
                                                outerBoundaryIs: {
                                                    LinearRing: {
                                                        coordinates: {
                                                            _text: this._formatCoords(outer)
                                                        }
                                                    }
                                                },
                                                innerBoundaryIs: inner.map(boundary => ({
                                                    LinearRing: {
                                                        coordinates: {
                                                            _text: this._formatCoords(boundary)
                                                        }
                                                    }
                                                }))
                                            };
                                        })
                                    };
                                    break;
                                default:
                                    return;
                            }
                            return doc;
                        })
                    }
                }
            },
            { ignoreComment: true, spaces: 4, compact: true }
        );
    }

    _formatKMLValue(feature, prop) {
        const fieldDD = feature.featureDD.fields[prop];
        const fieldType = fieldDD.type;
        const fieldValue = feature.properties[prop];
        switch (fieldType) {
            case 'timestamp':
                return fieldValue?.toISOString();

            default:
                return fieldValue;
        }
    }

    _formatCoords(coords) {
        return coords.map(c => `${c[0]},${c[1]}`).join(' ');
    }

    /**
     * Converts a colour string, hex or web color name to RGB
     * @return [r,g,b]   Array split on channel
     */
    _colorToRGB(str) {
        if (!str) return ['00', '00', '00'];
        if (!str.includes('#')) {
            const color = webColorsList.filter(c => c.name.toLowerCase() === str.toLowerCase())[0];
            str = color ? color.hex : '#000';
        }
        return str.replace('#', '').match(/..?/g);
    }

    _appendKMLStyle(element, style) {
        switch (style.constructor) {
            case FillStyle:
                {
                    //ENH: have another method that takes an optional opacity and returns a string with corresponding kml color
                    const [r, g, b] = this._colorToRGB(style.color);
                    const fillOpacityHex = Math.floor((style.opacity / 100) * 255);

                    element['PolyStyle'] = {
                        color: `${fillOpacityHex.toString(16)}${b}${g}${r}`,
                        colorMode: 'normal',
                        fill: 1,
                        outline: 1
                    };
                }
                break;

            case LineStyle:
                {
                    const [r, g, b] = this._colorToRGB(style.color);
                    element.LineStyle = {
                        color: `ff${b}${g}${r}`,
                        width: style.width
                    };
                }
                break;

            case PointStyle:
            case SymbolStyle:
            case IconStyle:
                element.IconStyle = {
                    Icon: {
                        href: {
                            _text: 'http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png'
                        }
                    }
                };
                if (style.constructor == SymbolStyle) {
                    const [r, g, b] = this._colorToRGB(style.color);
                    element.IconStyle.color = `ff${b}${g}${r}`;
                }
                break;

            case Style:
            default:
                style.styles?.forEach(substyle => this._appendKMLStyle(element, substyle));
        }
    }
}

export class KMZFeatureExporter extends KMLFeatureExporter {
    /**
     * Exports the current feature set or current feature to KMZ
     */
    async _run(features) {
        const first = features[0];
        let zip = new JSZip();
        zip.file(`${first.getType()}_export.kml`, this.generateKml(features));
        const content = await zip.generateAsync({ type: 'blob' });
        this.generateDownload(content, `${first.getType()}_export.kmz`);
    }
}

export class DXFFeatureExporter extends FeatureExporter {
    async _run(features) {
        const featureStyles = {};
        const ctx = document.createElement('canvas').getContext('2d');
        const normalizeColor = color => {
            ctx.fillStyle = color;
            return ctx.fillStyle;
        };

        const app = this.owner.app;
        const zoom = app.map.getZoom();
        const visibleLayers = app.map.layerManager.getVisibleLayers(zoom);

        features.map(feature => {
            const urn = feature.getUrn();
            const type = feature.getType();
            let visibleLayerFound = false;

            feature.datasource.layerDefs
                .filter(layerDef => layerDef.rendering === 'vector')
                .forEach(layerDef => {
                    const styleDef = layerDef.feature_types.find(
                        featureType =>
                            featureType.name === type && featureType.field_name != 'annotation'
                    );
                    if (!styleDef) return; //If we don't have a styleDef, we're done for this feature
                    if (visibleLayerFound) return;
                    if (visibleLayers.findIndex(a => a.layerDef == layerDef) >= 0)
                        visibleLayerFound = true;

                    let style = null;
                    try {
                        //  Due to StyleManager caching values for feature types, we have to initialize a new one each time
                        style = new StyleManager().getStyleFor(feature, styleDef)?.normal;
                    } catch (error) {
                        //ignore errors in feature's getCustomStyles() - style may not be in use(?)
                        return;
                    }
                    if (!style) return;
                    if (style.isLookup) style = style.getStyleFor(feature);

                    let styles = [];
                    if (style.styles) styles = style.styles;
                    else styles = [style];

                    //  Sometimes we get a color as a code, eg. 'slateblue'. We can't use this on the server, so convert it here
                    for (let s of styles) {
                        if (s.color) s.color = normalizeColor(s.color);
                        if (s.borderColor) s.borderColor = normalizeColor(s.borderColor);
                        if (s.backgroundColor)
                            s.backgroundColor = normalizeColor(s.backgroundColor);
                    }

                    featureStyles[urn] = {
                        feature,
                        styles
                    };
                });
        });

        const res = await this.owner.app.system.server.export('dxf', featureStyles);
        this.generateDownload(res.body, res.filename);
    }
}

/**
 * Plugin that provides export functionality to be used on result lists<br/>
 * A button is exposed to be used in controls. It exports the app's currentFeatureSet or currentFeature
 * @name ExportFeaturesPlugin
 * @constructor
 * @extends {Plugin}
 */
export class ExportFeaturesPlugin extends Plugin {
    static {
        this.mergeOptions({
            useExternalNames: false
        });
    }

    exportToJson() {
        new JSONFeatureExporter(this).export();
    }

    exportToCsv() {
        new CSVFeatureExporter(this).export();
    }

    exportToKml() {
        new KMLFeatureExporter(this).export();
    }

    exportToKmz() {
        new KMZFeatureExporter(this).export();
    }

    exportToDxf() {
        new DXFFeatureExporter(this).export();
    }

    _getCurrentFeatures() {
        if (this.app.currentFeature) return [this.app.currentFeature];
        else return this.app.currentFeatureSet.items;
    }
}

class ExportButton extends PluginButton {
    static {
        this.prototype.className = 'list-export';
        this.prototype.imgSrc = exportImg;
        this.prototype.inactiveImgSrc = exportInactiveImg;
        this.prototype.titleMsg = 'export';

        this.prototype.events = {
            mouseover: 'showMenu',
            mouseout: 'hideMenu',
            'click .export-to-json': 'exportToJson',
            'click .export-to-csv': 'exportToCsv',
            'click .export-to-kml': 'exportToKml',
            'click .export-to-kmz': 'exportToKmz',
            'click .export-to-dxf': 'exportToDxf'
        };
    }

    initUI() {
        const html = `<ul class='hidden sub-list-export'>
                        <li class='export-to-csv'>CSV</li>
                        <li class='export-to-json'>JSON</li>
                        <li class='export-to-kml'>KML</li>
                        <li class='export-to-kmz'>KMZ</li>
                        <li class='export-to-dxf'>DXF</li>
                    </ul>`;
        this.$el.append(html);

        //remove buttons not in configuration. ENH: improve all of this
        for (const [p, setting] of Object.entries(
            this.app.system.settings['core.featureDetails'].exportControls
        )) {
            if (!setting) this.$(`.${p}`).remove();
        }
    }

    /*
     * Sets the title of the button only when its part of a menu
     * @param {string} titleMsg Message key to retrieve the button title
     */
    setTitle(titleMsg) {
        if (this.mode === 'menu') {
            this.buttonTitle.html(this.owner.msg(titleMsg));
        }
    }

    showMenu() {
        if (this.$el.attr('class').includes('inactive')) return;
        this.$('ul').show();
    }

    hideMenu() {
        this.$('ul').hide();
    }

    exportToJson() {
        this.owner.exportToJson();
    }

    exportToCsv() {
        this.owner.exportToCsv();
    }

    exportToKml() {
        this.owner.exportToKml();
    }

    exportToKmz() {
        this.owner.exportToKmz();
    }

    exportToDxf() {
        this.owner.exportToDxf();
    }
}

ExportFeaturesPlugin.prototype.buttons = {
    exportCurrentSet: ExportButton,
    exportCurrentFeature: ExportButton
};

export default ExportFeaturesPlugin;
