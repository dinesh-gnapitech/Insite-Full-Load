// Copyright: IQGeo Limited 2010-2023
import { escape } from 'underscore';
import Backbone from 'backbone';
import GeoJSONVectorLayer from '../../layers/geoJSONVectorLayer';
import { Control } from 'myWorld/base/control';
import { IconStyle, LineStyle, FillStyle } from 'myWorld/styles';
import circleEmptyImg from 'images/circle-empty2.png';

export class FeatureListControl extends Control {
    static {
        this.prototype.className = 'feature-list';
    }

    /**
     * @class Displays an interactive list of features
     * @param  {Plugin}   owner   Owner of self
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options = {}) {
        super(owner, options);
        this.map = this.app.map;
        this.itemClass = options.itemClass || FeatureListItem;
    }

    /**
     * Show 'features'
     */
    setFeatures(features) {
        this.$el.empty();
        for (let i = 0; i < features.length; i++) {
            const item = new this.itemClass({
                control: this,
                feature: features[i]
            });
            this.$el.append(item.$el);
            item.render();
        }
    }
}

/**
 * An item in a FeatureList
 *
 * Shows feature title and short description. Provides hover and select functionality
 */
export class FeatureListItem extends Backbone.View {
    static {
        this.prototype.className = 'feature-list-item';

        this.prototype.events = {
            mouseover: 'highlightFeature',
            mouseout: 'clearHighlights',
            click: 'select'
        };
    }

    constructor(options) {
        super(options);
        this.options = options;
        this.feature = options.feature;
        this.control = options.control;
        this.app = this.control.app;
    }

    /**
     * Build list item
     */
    render() {
        const title = escape(this.feature.getTitle());
        const desc = escape(this.feature.getShortDescription());

        let text = `<span class=feature-list-item-title> ${title} </span>`;
        if (desc) text += `<span class=feature-list-item-desc> ${desc} </span>`;

        this.$el.html(`<div> ${text} </div>`);
    }

    /**
     * Make self's feature as the application's current feature
     */
    select() {
        this.app.setCurrentFeature(this.feature, { zoomTo: true });
    }

    /**
     * Show location of self's feature on map
     * @private
     */
    highlightFeature() {
        const geom = this.feature.geometry;
        if (!geom) return;

        // Create highlght layer (if necessary)
        if (!this.layer) {
            const map = this.app.map;
            this.layer = new GeoJSONVectorLayer({ map });
            this.layer.setZIndex(0);
        }

        // Create highlght styles (if necessary)
        if (!this.markerStyles) {
            this.markerStyles = {
                Point: new IconStyle({
                    iconUrl: circleEmptyImg,
                    iconAnchor: [18, 18]
                }),
                LineString: new LineStyle({ color: '#0000FF', width: 5, opacity: 0.5 }),
                Polygon: new FillStyle({ color: '#0000FF', opacity: 0.5 })
            };
        }

        // Add highlight
        const geomType = geom.getType();
        this.layer.addGeom(geom, this.markerStyles[geomType]);
    }

    /**
     * Remove marker from display
     */
    clearHighlights() {
        this.layer?.clear();
    }
}

export default FeatureListControl;
