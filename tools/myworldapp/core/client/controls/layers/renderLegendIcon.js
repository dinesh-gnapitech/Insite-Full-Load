import BuilderGroup from 'ol/render/canvas/BuilderGroup';
import ExecutorGroup from 'ol/render/canvas/ExecutorGroup';
import { renderFeature, getSquaredTolerance } from 'ol/renderer/vector';
import Feature from 'ol/Feature';
import { Point, LineString, Polygon } from 'ol/geom';
import { create as createTransform } from 'ol/transform';
import { Icon } from 'ol/style';
import myw from 'myWorld/base/core';
import { svgRenderer } from 'myWorld/styles/styleUtils';
import { SetupImageLoad } from 'myWorld/layers/geoserverImgRequest';
import $ from 'jquery';

/*
 * Takes an OpenLayers style and a GeoJSON type and create a preview canvas for legends
 * @param {string} type The GeoJSON geometry type, can be point, linestring or polygon
 * @param {ol/Style} style The OpenLayers style to render into a legend icon
 * @returns Canvas containing the rendered legend icon
 */
const renderOLLegendIcon = function (type, style) {
    //  Set up the canvas here
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;

    //  Test that all images are loaded and then render to the canvas.
    //  If they're not, set them up to load then render to the canvas
    let imgLoadCount = 0;
    const imgLoaded = function () {
        imgLoadCount--;
        if (imgLoadCount == 0) {
            _renderToCanvas(type, style, canvas);
        }
    };
    const styleImage = style.getImage();
    if (styleImage && styleImage instanceof Icon && !styleImage.getImage().complete) {
        styleImage.getImage().addEventListener('load', imgLoaded);
        imgLoadCount++;
    }

    const fillImage = style.getFill()?.image;
    if (fillImage) {
        fillImage.addEventListener('load', imgLoaded);
        imgLoadCount++;
    }

    if (imgLoadCount == 0) {
        _renderToCanvas(type, style, canvas);
    }
    return canvas;
};

/*
 * Handles rendering of the OL legend icon, based on the process used in the ol/CanvasVectorLayerRenderer class
 * @param {string} type The GeoJSON geometry type, can be point, linestring or polygon
 * @param {ol/Style} style The OpenLayers style to render into a legend icon
 * @param {Canvas} canvas The canvas to render to
 */
const _renderToCanvas = function (type, style, canvas) {
    //  Set up the thumbnail feature geometries and extents based on the size
    let feature = null;
    let extent = null;
    switch (type) {
        case 'point':
            feature = new Feature({
                geometry: new Point([8, 8])
            });
            extent = [0, 0, 16, 16];
            break;

        case 'linestring':
            feature = new Feature({
                geometry: new LineString([
                    [1, 8],
                    [37, 8]
                ])
            });
            extent = [0, 0, 38, 16];
            break;

        case 'polygon':
            feature = new Feature({
                geometry: new Polygon([
                    [
                        [1, 1],
                        [1, 15],
                        [37, 15],
                        [37, 1]
                    ]
                ])
            });
            extent = [0, 0, 38, 16];
            break;

        default:
            return;
    }

    //  Perform the actual rendering here by loading the instructions into the BuilderGroup and then using the ExecutorGroup to do the rendering
    canvas.width = extent[2];
    canvas.height = extent[3];
    const context = canvas.getContext('2d');
    const resolution = 1;
    const pixelRatio = 1;
    const squaredTolerance = getSquaredTolerance(resolution, pixelRatio);
    const replayGroup = new BuilderGroup(0, extent, resolution, pixelRatio);
    const transform = createTransform();
    const execute = function () {
        const instructions = replayGroup.finish();
        const executorGroup = new ExecutorGroup(extent, resolution, pixelRatio, null, instructions);
        executorGroup.execute(context, 1, transform, 0, false);
    };
    const loading = renderFeature(replayGroup, feature, style, squaredTolerance, function () {
        renderFeature(replayGroup, feature, style, squaredTolerance);
        execute();
    });
    if (!loading) execute();
};

/**
 * Takes a myWorld feature and creates a legend icon for it
 * @param {HTMLElement} parent The node to append the legend row to
 * @returns Canvas containing the rendered legend icon
 * @private
 */
const renderMyWorldLegendIcon = function (parent, layer, styleManager, item) {
    if (!myw.isNativeApp && layer.layerDef.rendering == 'geoserver')
        _createLegendForGeoserver(parent, layer, item);
    else {
        const featureDD = layer.datasource.featuresDD[item.name];
        if (featureDD.geometry_type || item.point_style || item.line_style) {
            const style = styleManager.getStyleForField(featureDD, item.field_name, item).normal;
            return renderMyWorldLegendIconFromStyle(parent, style, item, featureDD);
        }
    }
};

function renderMyWorldLegendIconFromStyle(elem, style, item, featureDD) {
    if (item.fill_style != null && item.line_style != null) {
        _createLegendForPolygon(elem, style.styles[0], style.styles[1], featureDD);
    } else if (item.point_style != null) _createLegendForPoint(elem, style, featureDD);
    else if (item.line_style != null) _createLegendForLine(elem, style, featureDD);
}

const getPicklistFromFeatureDD = function (featureDD, picklist) {
    const fieldDD = Object.values(featureDD.fields).find(dd => dd.enum === picklist);
    if (!fieldDD)
        return console.warn(
            `Bad configuration, '${featureDD.external_name}' doesn't have a field with picklist ${picklist}`
        );
    return fieldDD.enumValues;
};

const _valueToDisplayValue = function (value, picklist) {
    return picklist.find(pick => pick.value == value)?.display_value || value;
};

const _createLegendForGeoserver = function (parent, layer, item) {
    const img = $('<img />');
    const imgWrapper = $('<div/>', {
        class: 'icon'
    });
    imgWrapper.append(img);
    _loadGeoserverLegendIcon(img[0], layer, item);
    _createLegendRow(parent, imgWrapper, item.label);
};

const _createLegendForPolygon = function (
    parent,
    lineStyle,
    fillStyle,
    featureDD = null,
    label = null
) {
    if (lineStyle.lookup) {
        //If it has a lookup style
        const lineStyleLookup = lineStyle.lookup;
        const fillStyleLookup = fillStyle.lookup;

        Object.entries(lineStyleLookup).forEach(([lookupStylelabel, lineLookupStyle]) => {
            const picklist = getPicklistFromFeatureDD(featureDD, lineStyle.pickList);
            _createLegendForPolygon(
                parent,
                lineLookupStyle,
                fillStyleLookup[lookupStylelabel],
                featureDD,
                `${featureDD.external_name} - ${_valueToDisplayValue(lookupStylelabel, picklist)}`
            );
        });
    } else {
        const rgbaColor = fillStyle.rgbaColor;
        const legendIcon = $('<div>', { class: 'icon polygon' }).css({
            border: `solid 2px ${lineStyle.color}`,
            background: `rgba(${rgbaColor.join(',')})`
        });
        _createLegendRow(parent, legendIcon, label || featureDD.external_name);
    }
};

const _createLegendForPoint = function (parent, style, featureDD = null, label = null) {
    const pointStyle = style.styles ? style.styles[0] : style; //Handle styles with text styles associated with them
    if (pointStyle.lookup) {
        Object.entries(pointStyle.lookup).forEach(([lookupStylelabel, lookupStyle]) => {
            const picklist = getPicklistFromFeatureDD(featureDD, pointStyle.pickList);
            _createLegendForPoint(
                parent,
                lookupStyle,
                featureDD,
                `${featureDD.external_name} - ${_valueToDisplayValue(lookupStylelabel, picklist)}`
            );
        });
    } else {
        const legendIcon = $('<div/>', { class: 'icon', html: renderPoint(pointStyle) });
        _createLegendRow(parent, legendIcon, label || featureDD.external_name);
    }
};

const _createLegendForLine = function (parent, style, featureDD = null, label = null) {
    const lineStyle = style.styles ? style.styles[0] : style; //Handle styles with text styles associated with them
    if (lineStyle.lookup) {
        Object.entries(lineStyle.lookup).forEach(([lookupStylelabel, lookupStyle]) => {
            const picklist = getPicklistFromFeatureDD(featureDD, lineStyle.pickList);
            _createLegendForLine(
                parent,
                lookupStyle,
                featureDD,
                `${featureDD.external_name} - ${_valueToDisplayValue(lookupStylelabel, picklist)}`
            );
        });
    } else {
        const legendIcon = $('<div/>', { class: 'icon', html: renderLine(lineStyle) });
        _createLegendRow(parent, legendIcon, label || featureDD.external_name);
    }
};

const _createLegendRow = function (parent, icon, label) {
    const legendContainer = $('<div>', { class: 'legend-container' });
    legendContainer.append(icon);
    legendContainer.append($('<span/>', { class: 'label', html: label }));
    parent.append(legendContainer);
};

const renderPoint = function (style) {
    const { symbol, color, borderColor, iconUrl } = style;
    const pointSymbolName = symbol;
    const pointSymbolColour = color || 'transparent';
    const pointSymbolBorderColour = borderColor || 'transparent';

    if (svgRenderer.symbols[pointSymbolName]) {
        const svg = svgRenderer.render(pointSymbolName);
        svg.style.height = '16px';
        svg.style.width = '16px'; //fixes alignment in ie
        svg.style.fill = pointSymbolColour;
        svg.style.transform = 'rotate(180deg)';
        if (pointSymbolBorderColour) {
            svg.style.stroke = pointSymbolBorderColour;
            svg.style.strokeWidth = '4px';
        }
        return svg;
    }

    return $('<img/>', { src: iconUrl, height: '16px' });
};

const renderLine = function (style) {
    const { color, endStyle, lineStyle, startStyle } = style;

    let ends = 0;
    if (startStyle != 'none' || endStyle != 'none') ends = 1;
    if (startStyle != 'none' && endStyle != 'none') ends = 2;

    let line = '';
    if (startStyle == 'arrow') {
        line += `<span class="arrow-begin"><span class="arrow-left" style="border-right-color:${color}"></span></span>`;
    }
    line += _renderLineStyle(lineStyle, color, ends);
    if (endStyle == 'arrow') {
        line += `<span class="arrow-end"><span class="arrow-right" style="border-left-color:${color}"></span></span>`;
    }
    return line;
};

const _renderLineStyle = function (style, color, ends) {
    if (!style) style = 'solid';
    switch (style) {
        case 'shortdash':
            return `<span class="shortdash-line" style="border-bottom-color:${color}"><span class="shortdash"></span><span class="shortdash"></span><span class="shortdash"></span><span class="shortdash"></span><span class="shortdash"></span></span>`;
        case 'dot':
            return `<span class="dot-line" style="border-bottom-color:${color}"></span>`;
        case 'dash':
            return `<span class="dash-line" style="border-bottom-color:${color}"></span>`;
        case 'longdash':
            return `<span class="longdash-line" style="border-bottom-color:${color}"><span class="longdash"></span><span class="longdash"></span></span>`;
        case 'longdashdot':
            return `<span class="longdashdot-line" style="border-bottom-color:${color}"><span class="longdash"></span><span class="dot"></span></span>`;
        case 'solid':
            return `<span class="solid-line" style="border-bottom-color:${color}"></span>`;
        case 'arrowed':
            return `<span class="arrowed-line" style="border-bottom-color:${color}"><span class="solid-line"></span><span class="arrow-left" style=color:${color}></span></span>`;
    }
};

const _loadGeoserverLegendIcon = function (img, layer, featureType) {
    const { url, auth } = layer.datasource.geoserverOptionsFromLayerDef(layer.layerDef);
    const requestUrl = new URL(url);
    requestUrl.searchParams.set('REQUEST', 'GetLegendGraphic');
    requestUrl.searchParams.set('FORMAT', 'image/png');
    requestUrl.searchParams.set('LAYER', featureType.name);
    SetupImageLoad(img, requestUrl, auth);
};

export { renderOLLegendIcon, renderMyWorldLegendIcon, renderMyWorldLegendIconFromStyle };
