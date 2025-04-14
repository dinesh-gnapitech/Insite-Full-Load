import myw from 'myWorld-base';
import React from 'react';
import { symbols, svgRenderer } from 'myWorld/styles/styleUtils';

/**
 * Creates input with a style preview inside
 * //ENH: Localise lookup text
 * @param {string} type one of point linestring or polygon
 * @param {Object} data
 */
export function createStylePreviewFor(type, data) {
    if (!data) return null;
    else if (data.isLookup) {
        //lookup style
        return (
            <span data-style-preview style={{ fontWeight: 600 }}>
                {' '}
                {myw.msg('StylePicker', 'lookup')}{' '}
            </span>
        );
    }
    let previewEl = '';
    switch (type) {
        case 'point':
            previewEl = buildPointStyle(data);
            break;
        case 'linestring':
            previewEl = buildLinestringStyle(data);
            break;
        case 'polygon':
            previewEl = buildPolygonStyle(data);
            break;
        case 'text':
            previewEl = buildTextStyle(data);
            break;
        default:
            break;
    }
    return <span className="style-input">{previewEl}</span>;
}

/**
 * Creates input object and shows fill color, border color and svg shape for point data
 * @param {Object} data
 */
function buildPointStyle(data) {
    if (data.symbol) {
        //symbol style
        return (
            <span className="in-emulate-input" data-style-preview>
                <svg
                    viewBox={'0 0 100 100'}
                    style={{
                        height: '20px',
                        width: '20px',
                        fill: data.color || 'transparent',
                        stroke: data.borderColor || data.color,
                        transform: 'rotate(180deg)',
                        strokeWidth: '5px'
                    }}
                >
                    {data.symbol === 'circle' ? (
                        _createCircle()
                    ) : (
                        <path d={svgRenderer.convertPointsToPath(symbols[data.symbol])}></path>
                    )}
                </svg>
            </span>
        );
    } else
        return (
            <span className="in-emulate-input" data-style-preview>
                {data.iconUrl}
            </span>
        );
}

/**
 * Creates path for circle svg
 */
function _createCircle() {
    const pathObj = svgRenderer.createCirclePath();
    return <circle cx={pathObj.cx} cy={pathObj.cy} r={pathObj.r}></circle>;
}

/**
 * Creates a rectangle to show the fill colour and opacity of the polygon style
 * The rectangle has a border to represent the polygon border colour if any.
 * @param  {string} ls   String containing border style attributes [dash-type:colour:size]
 * @param  {string} fs   String containing fill style attributes [colour:opacity]
 * @param  {Boolean} simplified Indicates that a simplified version of the picker should be display
 * @return {reactComponent} HTML representation of the style strings 'ls' and 'fs'
 */
function buildPolygonStyle(data) {
    const { fill, line } = data;
    const fillColour = fill?.color || 'transparent';
    const fillOpacity = fill?.opacity || '0';
    const polygonBorderColour = line?.color || 'transparent';

    return (
        <span
            className="polygon-rep-container"
            style={{ height: '13px', borderColor: polygonBorderColour }}
        >
            <span
                className="in-emulate-input polygon-representation"
                data-style-preview
                style={{ backgroundColor: fillColour, opacity: fillOpacity }}
            />
        </span>
    );
}

function buildTextStyle(data) {
    return (
        <span
            className="in-emulate-input label-representation"
            style={{
                color: data.color,
                fontWeight: 700,
                backgroundColor: data.backgroundColor,
                border: `${data.borderWidth ? '1px solid ' + data.color : ''}`
            }}
            data-style-preview
        >
            {data.textProp}
        </span>
    );
}

/**
 * Creates a line to show the line style, color and ends for a lineStyle Object
 * @param {Object} style
 */
function buildLinestringStyle(style) {
    return (
        <span className="in-emulate-input" data-style-preview>
            {createBeginArrowHtml(style.startStyle, style.color)}
            {createLineStylePreviewHTMLFor(style)}
            {createEndArrowHtml(style.endStyle, style.color, style.lineStyle === 'arrowed')}
        </span>
    );
}

/**
 * Creates linestyle HTML for linestyle preview
 * @param {LineStyle} lineStyle
 */
function createLineStylePreviewHTMLFor(lineStyle) {
    const { opacity, color } = lineStyle;
    switch (lineStyle.lineStyle) {
        case 'dot':
        case 'solid':
        case 'dash':
            return (
                <span
                    className={lineStyle.lineStyle + '-line'}
                    style={{ borderBottomColor: color, opacity }}
                ></span>
            );
        case 'shortdash':
            return (
                <span className="shortdash-line" style={{ borderBottomColor: color }}>
                    <span className="shortdash"></span>
                    <span className="shortdash"></span>
                    <span className="shortdash"></span>
                    <span className="shortdash"></span>
                    <span className="shortdash"></span>
                    <span className="shortdash"></span>
                    <span className="shortdash"></span>
                    <span className="shortdash"></span>
                    <span className="shortdash"></span>
                </span>
            );

        case 'longdash':
            return (
                <span className="longdash-line" style={{ borderBottomColor: color }}>
                    <span className="longdash"></span>
                    <span className="longdash"></span>
                    <span className="longdash"></span>
                </span>
            );
        case 'longdashdot':
            return (
                <span className="longdashdot-line" style={{ borderBottomColor: color }}>
                    <span className={'longdash'}></span>
                    <span className={'dot'}></span>
                    <span className={'longdash'}></span>
                    <span className={'dot'}></span>
                </span>
            );
        case 'arrowed':
            return (
                <span className="arrowed-line" style={{ borderBottomColor: color }}>
                    <span className="solid-line"></span>
                    <span className="arrow-right" style={{ color }}></span>
                    <span className="arrow-right" style={{ color }}></span>
                    <span className="arrow-right" style={{ color }}></span>
                    <span className="arrow-right" style={{ color }}></span>
                </span>
            );
        default:
            return (
                <span className={'solid-line'} style={{ borderBottomColor: color, opacity }}></span>
            );
    }
}

/**
 * Creates HTML for arrow begin style for linestrign preview
 * @param {string} startStyle
 * @param {string} color
 */
function createBeginArrowHtml(startStyle, color) {
    switch (startStyle) {
        case 'arrow':
            return <span className="arrow-left" style={{ color }}></span>;
    }
}

/**
 * Creates HTML for arrow end style for linestrign preview
 * @param {string} endStyle
 * @param {string} color
 */
function createEndArrowHtml(endStyle, color, addMargin = false) {
    switch (endStyle) {
        case 'arrow':
            return (
                <span
                    className="arrow-right"
                    style={{ color, marginLeft: addMargin ? '14px' : '' }}
                ></span>
            );
    }
}
