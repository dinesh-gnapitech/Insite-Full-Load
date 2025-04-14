import { Style, Stroke, Fill, Icon, Circle, RegularShape } from 'ol/style';
import { DEVICE_PIXEL_RATIO } from 'ol/has';
import StyleManager from 'myWorld/layers/styleManager';

//  Maps ESRI symbol types to GeoJSON geometry types
const esriTypeToGeoJSONType = {
    esriPMS: 'point',
    esriSMS: 'point',
    esriSLS: 'linestring',
    esriPFS: 'polygon',
    esriSFS: 'polygon'
};

/*
 * Overrides our base StyleManager class to translate the ESRI feature types into their GeoJSON equivalents
 */
export class EsriStyleManager extends StyleManager {
    _getGeometryTypeFromFeatureDD(featureDD, fieldName, styleDef) {
        const renderer = styleDef.drawing_info.renderer;
        //  classBreaks does not have a defaultSymbol property, so get the first break symbol type here
        let valueLookup = null;
        if (renderer.type == 'classBreaks') {
            valueLookup = renderer.classBreakInfos;
        } else if (renderer.type == 'uniqueValue') {
            valueLookup = renderer.uniqueValueInfos;
        }
        const symbol = renderer.defaultSymbol || renderer.symbol || valueLookup?.[0].symbol;
        return symbol ? esriTypeToGeoJSONType[symbol.type] : null;
    }
}

/*
 * Class to parse all of the drawing information we got from an ESRI FeatureServer layer and return a function to style features with it
 */
export class EsriDrawingInfoParser {
    constructor() {
        this._styleFuncs = {};
        this.styleManager = undefined;
    }

    /*
     * Use this to wrap our own myWorld style class and returns a function to style features appropriately
     */
    parseMyWorldStyle(featureDD, layerFeatureItem) {
        if (!this.styleManager) {
            this.styleManager = new EsriStyleManager();
        }

        const style = this.styleManager.getStyleForField(
            featureDD,
            'Shape',
            layerFeatureItem
        ).normal;
        return {
            style: (feature, map) => {
                this.styleManager._ensureCalcRenderFields(feature, style);

                const olStyle =
                    style && typeof style.olStyle == 'function'
                        ? style.olStyle(map.getView()) //style is a myw style
                        : style; // style should be an OL style
                if (typeof olStyle == 'function') return olStyle(feature, map.getResolution());
                else return olStyle;
            },
            legendInfo: {
                mywStyle: style,
                layerFeatureItem
            }
        };
    }

    /**
     * Takes an ESRI FeatureServer's drawing_info.renderer and returns both a style function and legend information
     * @param {object} renderer The ESRI server's renderer information for this layer (Found in drawing_info.renderer)
     * @returns {object} Object containing a function to apply styling and an object containing legend information
     */
    parseStyle(renderer) {
        const rendererType = renderer?.type;
        switch (rendererType) {
            //  simple styles always return the same style, regardless of the feature passed in
            case 'simple':
                return this._generateSimpleStyleInfo(renderer);

            //  uniqueValue returns a style based on a simple 1-to-1 lookup of a specified feature property
            case 'uniqueValue':
                return this._generateUniqueValueStyleInfo(renderer);

            //  classBreaks returns a style based on if a specified feature property falls within a specified range
            case 'classBreaks':
                return this._generateClassBreaksStyleInfo(renderer);

            case undefined:
                console.log('Unable to obtain ESRI renderer type');
                break;

            default:
                console.log('Unimplemented renderer: ' + rendererType);
                break;
        }

        /*
        Currently un-implemented renderers:

        Dictionary Renderer (Client Side)
        Dot Density Renderer (Client Side)
        Heatmap Renderer (Client Side)
        Predominance Renderer (Client Side)
        Raster Color Map Renderer (Client Side)
        Raster Shaded Relief Renderer (Client Side)
        Stretch Renderer (Client Side)
        Temporal Renderer (Client Side)
        Vector Field Renderer (Client Side)
        */
    }

    /*
     * Functions used to parse a renderer and generate a function to return the generated style
     */
    _generateSimpleStyleInfo(rendererInfo) {
        const simpleStyle = this._esriStyleToOpenLayersStyle(rendererInfo.symbol);
        return {
            style() {
                return simpleStyle;
            },
            legendInfo: {
                type: esriTypeToGeoJSONType[rendererInfo.symbol.type],
                style: simpleStyle
            }
        };
    }

    _generateUniqueValueStyleInfo(rendererInfo) {
        let { field1, field2, field3, fieldDelimiter } = rendererInfo;
        let getCombinedValue = feature => {
            //  First thing we need to do is fix for any potential case mismatches in value keys
            field1 = this._caseCorrectFieldName(feature, field1);
            if (field2) field2 = this._caseCorrectFieldName(feature, field2);
            if (field3) field2 = this._caseCorrectFieldName(feature, field3);

            //  Now override this function call here since the field names have now been case corrected
            getCombinedValue = function (feature) {
                const vals = [feature.get(field1)];
                if (field2) vals.push(feature.get(field2));
                if (field3) vals.push(feature.get(field3));
                return vals.join(fieldDelimiter);
            };
            return getCombinedValue(feature);
        };

        const defaultStyle = rendererInfo.defaultSymbol
            ? this._esriStyleToOpenLayersStyle(rendererInfo.defaultSymbol)
            : null;
        const lookupStyles = {};
        const legendInfo = {};
        rendererInfo.uniqueValueInfos.forEach(valueInfo => {
            const newStyle = this._esriStyleToOpenLayersStyle(valueInfo.symbol);
            lookupStyles[valueInfo.value] = newStyle;
            legendInfo[valueInfo.label] = {
                type: esriTypeToGeoJSONType[valueInfo.symbol.type],
                style: newStyle
            };
        });
        return {
            style(feature) {
                const value = getCombinedValue(feature);
                return lookupStyles[value] || defaultStyle;
            },
            legendInfo
        };
        /*
        Currently un-implemented fields:

        authoringInfo	        An object containing metadata about the authoring process for creating a renderer object. This allows the authoring clients to save specific overridable settings so that next time it is accessed via the UI, their selections are remembered. Non-authoring clients can ignore it.
        backgroundFillSymbol	A symbol used for polygon features as a background if the renderer uses point symbols, e.g. for bivariate types & size rendering. Only applicable to polygon layers. PictureFillSymbols can also be used outside of the Map Viewer for Size and Predominance and Size renderers.
        defaultLabel	        Default label for the default symbol used to draw unspecified values.
        legendOptions	        A legend containing one title, which is a string describing the renderer in the legend.
        rotationExpression  	A constant value or an expression that derives the angle of rotation based on a feature attribute value. When an attribute name is specified, it's enclosed in square brackets. Rotation is set using a visual variable of type rotationInfo with a specified field or valueExpression property.
        rotationType	        String property which controls the origin and direction of rotation. If the rotationType is defined as arithmetic the symbol is rotated from East in a counter-clockwise direction where East is the 0 degree axis. If the rotationType is defined as geographic, the symbol is rotated from North in a clockwise direction where North is the 0 degree axis.
                                If property is present, must be one of the following values:
                                - arithmetic
                                - geographic
        valueExpression	        An Arcade expression evaluating to either a string or a number.
        valueExpressionTitle	The title identifying and describing the associated Arcade expression as defined in the valueExpression property.
        visualVariables	        An array of objects used to set rendering properties.
        */
    }

    _generateClassBreaksStyleInfo(rendererInfo) {
        let { field, minValue } = rendererInfo;
        let getValue = feature => {
            //  First thing we need to do is fix for any potential case mismatches in value keys
            field = this._caseCorrectFieldName(feature, field);

            //  Now override this function call here since the field name has now been case corrected
            getValue = feature => feature.get(field);
            return getValue(feature);
        };

        const defaultStyle = rendererInfo.defaultSymbol
            ? this._esriStyleToOpenLayersStyle(rendererInfo.defaultSymbol)
            : null;
        const lookupStyles = [];
        const legendInfo = {};

        let prevMax = minValue;
        rendererInfo.classBreakInfos.forEach(classBreakInfo => {
            const newStyle = this._esriStyleToOpenLayersStyle(classBreakInfo.symbol);
            const minVal = classBreakInfo.classMinValue ?? prevMax;
            const maxVal = classBreakInfo.classMaxValue;
            prevMax = maxVal;

            lookupStyles.push({ min: minVal, max: maxVal, style: newStyle });
            legendInfo[classBreakInfo.label] = {
                type: esriTypeToGeoJSONType[classBreakInfo.symbol.type],
                style: newStyle
            };
            /*
            description	String value used to describe the drawn symbol.
            label	String value used to label the drawn symbol.
            */
        });

        return {
            style(feature) {
                const value = getValue(feature);
                if (value < minValue) return defaultStyle;
                for (let lookupStyle of lookupStyles) {
                    if (value >= lookupStyle.min && value <= lookupStyle.max)
                        return lookupStyle.style;
                }
                return defaultStyle;
            },
            legendInfo
        };
        /*
        Currently un-implemented fields:
        
        authoringInfo	        An object containing metadata about the authoring process for creating a renderer object. This allows the authoring clients to save specific overridable settings so that next time it is accessed via the UI, their selections are remembered. Non-authoring clients can ignore it.
        backgroundFillSymbol	Supported only for polygon features.
        classBreakInfos	        Array of classBreakInfo objects.
        defaultLabel	        Label for the default symbol used to draw unspecified values.
        legendOptions	        A legend containing one title, which is a string describing the renderer in the legend.
        normalizationField	    Used when normalizationType is field. The string value indicating the attribute field by which the data value is normalized.
        normalizationTotal	    Used when normalizationType is percent-of-total, this number property contains the total of all data values.
        normalizationType	    Determine how the data was normalized.
                                If property is present, must be one of the following values:
                                - esriNormalizeByField
                                - esriNormalizeByLog
                                - esriNormalizeByPercentOfTotal
        valueExpression	        An Arcade expression evaluating to a number.
        valueExpressionTitle	The title identifying and describing the associated Arcade expression as defined in the valueExpression property.
        visualVariables	        An array of objects used to set rendering properties.
        */
    }

    _esriStyleToOpenLayersStyle(esriStyle) {
        this._esriColorToOpenLayers(esriStyle.color);
        const styleProps = {};
        switch (esriStyle.type) {
            case 'esriPFS':
                styleProps['fill'] = this._parseEsriPFS(esriStyle);
                if (esriStyle.outline) {
                    styleProps['stroke'] = this._parseEsriSLS(esriStyle.outline);
                }
                break;

            case 'esriPMS':
                styleProps['image'] = this._parseEsriPMS(esriStyle);
                break;

            case 'esriSFS':
                styleProps['fill'] = this._parseEsriSFS(esriStyle);
                if (esriStyle.outline) {
                    styleProps['stroke'] = this._parseEsriSLS(esriStyle.outline);
                }
                break;

            case 'esriSLS': {
                styleProps['stroke'] = this._parseEsriSLS(esriStyle);
                break;
            }

            case 'esriSMS':
                styleProps['image'] = this._parseEsriSMS(esriStyle);
                break;

            default:
                console.log('Unsupported ESRI Layer type: ' + esriStyle.type);
                break;
        }
        return new Style(styleProps);
        /*
        Currently un-implemented style types:
        
        Text Symbol (esriTS)
        */
    }

    _parseEsriPFS(esriStyle) {
        const fill = new Fill();

        const img = new Image();
        if (esriStyle.imageData) {
            img.src = `data:${esriStyle.contentType};base64,${esriStyle.imageData}`;
        } else {
            img.src = esriStyle.url;
        }

        img.addEventListener('load', () => {
            const canvas = document.createElement('canvas');
            canvas.width = esriStyle.width || img.width;
            canvas.height = esriStyle.height || img.height;
            const context = canvas.getContext('2d');
            context.drawImage(img, 0, 0, canvas.width, canvas.height);

            const pattern = context.createPattern(canvas, 'repeat');
            fill.setColor(pattern);
        });
        //  There are instances where we need to see if the image has finished loading, add it to the Fill here
        fill.image = img;
        return fill;
        /*
        Currently un-implemented fields:
        
        angle
        xoffset	        Numeric value indicating the offset on the x-axis in points.
        xscale	        Numeric value indicating the scale factor in x direction.
        yoffset	        Numeric value indicating the offset on the y-axis in points.
        yscale      	Numeric value indicating the scale factor in y direction.
        */
    }

    _parseEsriPMS(esriStyle) {
        const iconProps = {
            rotation: this._esriAngleToOpenLayers(esriStyle.angle)
        };
        if (esriStyle.imageData) {
            iconProps.src = `data:${esriStyle.contentType};base64,${esriStyle.imageData}`;
        } else {
            iconProps.src = esriStyle.url;
        }
        const ret = new Icon(iconProps);
        const image = ret.getImage();
        image.addEventListener('load', function () {
            if (esriStyle.width && esriStyle.height) {
                const scale = [esriStyle.width / this.width, esriStyle.height / this.height];
                ret.setScale(scale);
            }
        });
        ret.load();
        return ret;
        /*
        Currently un-implemented fields:
        
        contentType	String value indicating the content type for the image.
        xoffset	    Numeric value indicating the offset on the x-axis in points.
        yoffset	    Numeric value indicating the offset on the y-axis in points.
        */
    }

    _parseEsriSFS(esriStyle) {
        const fillProps = {
            color: esriStyle.color
        };
        switch (esriStyle.style) {
            case 'esriSFSNull':
                fillProps.color = [0, 0, 0, 0];
                break;

            case 'esriSFSSolid':
                break;

            case 'esriSFSBackwardDiagonal':
                fillProps.color = this._createFillPattern(
                    esriStyle.color,
                    false,
                    true,
                    false,
                    false
                );
                break;

            case 'esriSFSCross':
                fillProps.color = this._createFillPattern(
                    esriStyle.color,
                    true,
                    false,
                    true,
                    false
                );
                break;

            case 'esriSFSDiagonalCross':
                fillProps.color = this._createFillPattern(
                    esriStyle.color,
                    false,
                    true,
                    false,
                    true
                );
                break;

            case 'esriSFSForwardDiagonal':
                fillProps.color = this._createFillPattern(
                    esriStyle.color,
                    false,
                    false,
                    false,
                    true
                );
                break;

            case 'esriSFSHorizontal':
                fillProps.color = this._createFillPattern(
                    esriStyle.color,
                    false,
                    false,
                    true,
                    false
                );
                break;

            case 'esriSFSVertical':
                fillProps.color = this._createFillPattern(
                    esriStyle.color,
                    true,
                    false,
                    false,
                    false
                );
                break;

            default:
                console.log('Unimplemented esriSFS style: ' + esriStyle.style);
                break;
        }
        return new Fill(fillProps);
    }

    _parseEsriSLS(esriStyle) {
        const strokeProps = {
            color: esriStyle.color,
            width: esriStyle.width
        };
        let style = esriStyle.style;
        if (!style) style = 'esriSLSNull';
        switch (style) {
            case 'esriSLSDash':
                strokeProps.lineDash = [6, 4];
                break;

            case 'esriSLSDashDot':
                strokeProps.lineDash = [6, 4, 1, 4];
                break;

            case 'esriSLSDashDotDot':
                strokeProps.lineDash = [6, 4, 1, 4, 1, 4];
                break;

            case 'esriSLSDot':
                strokeProps.lineDash = [1, 4];
                break;

            case 'esriSLSNull':
                strokeProps.color = [0, 0, 0, 0];
                strokeProps.width = 0;
                break;

            case 'esriSLSSolid':
                break;

            default:
                console.log('Unimplemented esriSLS style: ' + esriStyle.style);
                break;
        }
        return new Stroke(strokeProps);
        /*
        Currently un-implemented fields:
        
        marker	    Represents markers placed along the line.
        style	    String value representing the simple line symbol type.
                    If property is present, must be one of the following values: esriSLSLongDash, esriSLSLongDashDot, esriSLSShortDash, esriSLSShortDashDot, esriSLSShortDashDotDot, esriSLSShortDot
        */
    }

    _parseEsriSMS(esriStyle) {
        const iconProps = {
            angle: this._esriAngleToOpenLayers(esriStyle.angle),
            radius: esriStyle.size,
            fill: new Fill({
                color: esriStyle.color
            })
        };
        if (esriStyle.outline) {
            esriStyle.outline.color = this._esriColorToOpenLayers(esriStyle.outline.color);
            iconProps['stroke'] = this._parseEsriSLS(esriStyle.outline);
        }

        switch (esriStyle.style) {
            case 'esriSMSCircle':
                return new Circle(iconProps);

            case 'esriSMSCross':
                iconProps.points = 4;
                iconProps.radius2 = 0;
                iconProps.angle += Math.PI / 4;
                break;

            case 'esriSMSDiamond':
                iconProps.points = 4;
                break;

            case 'esriSMSSquare':
                iconProps.points = 4;
                iconProps.angle += Math.PI / 4;
                break;

            case 'esriSMSTriangle':
                iconProps.points = 3;
                break;

            case 'esriSMSX':
                iconProps.points = 4;
                iconProps.radius2 = 0;
                break;

            default:
                console.log('Unimplemented esriSMS style: ' + esriStyle.style);
                return {};
        }

        return new RegularShape(iconProps);

        /*
        Currently un-implemented fields:
        
        xoffset	    Numeric value indicating the offset on the x-axis in points.
        yoffset	    Numeric value indicating the offset on the y-axis in points.
        */
    }

    /*
     * Helper functions
     */

    _createFillPattern(color, _0deg, _45deg, _90deg, _135deg) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const canvasDims = 9 * DEVICE_PIXEL_RATIO;
        canvas.width = canvasDims;
        canvas.height = canvasDims;
        context.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

        if (_0deg) {
            context.beginPath();
            context.moveTo(canvasDims / 2, 0);
            context.lineTo(canvasDims / 2, canvasDims);
            context.stroke();
        }

        if (_45deg) {
            context.beginPath();
            context.moveTo(canvasDims, 0);
            context.lineTo(0, canvasDims);
            context.stroke();
        }

        if (_90deg) {
            context.beginPath();
            context.moveTo(0, canvasDims / 2);
            context.lineTo(canvasDims, canvasDims / 2);
            context.stroke();
        }

        if (_135deg) {
            context.beginPath();
            context.moveTo(0, 0);
            context.lineTo(canvasDims, canvasDims);
            context.stroke();
        }

        return context.createPattern(canvas, 'repeat');
    }

    _esriColorToOpenLayers(color) {
        if (color) {
            color[3] /= 255;
            return color;
        } else {
            return undefined;
        }
    }

    _esriAngleToOpenLayers(deg) {
        return deg * (Math.PI / 180);
    }

    _caseCorrectFieldName(feature, fieldName) {
        const lowerFieldName = fieldName.toLowerCase();
        const featureFields = feature.getKeys();
        for (let featureField of featureFields) {
            if (featureField.toLowerCase() == lowerFieldName) return featureField;
        }
        return fieldName;
    }
}

export default EsriDrawingInfoParser;
