// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control } from 'myWorld/base/control';
import { FeatureListControl } from './featureListControl';

export class RelatedFeaturesControl extends Control {
    static {
        this.prototype.events = {
            'click .feature-plugins-minor-header': 'toggleContent'
        };
    }

    /**
     * @class Displays contents of a reference_set field in a collapsible panel.<br>
     * @param  {Plugin}   owner   Owner of self
     * @constructs
     * @extends {Control}
     */
    // ENH: Document mandatory options title, featureListClass
    constructor(owner, options) {
        super(owner, options);
        this.title = this.options.title;
        this.featureListClass = this.options.featureListClass || FeatureListControl;

        // Create toggle bar
        this.titleBar = $('<div class="feature-plugins-minor-header collapsed"></div>')
            .text(this.title)
            .appendTo(this.$el);

        // Create content
        this.content = new this.featureListClass(this);
        this.content.$el.appendTo(this.$el);
        this.expanded = false;
    }

    /**
     * Get data and display it
     */
    async render(featuresPromise) {
        this.features = await featuresPromise;

        if (this.features.length == 0) {
            this.$el.hide();
            return;
        }

        this.$el.show();
        if (this.expanded) this.buildContent();
    }

    /**
     * Show content
     */
    expandContent() {
        if (!this.contentBuilt) {
            this.buildContent();
        }

        if (!this.expanded) {
            this.content.$el.show();
            this.titleBar.toggleClass('collapsed', false);
            this.expanded = true;
        }
    }

    /**
     * Hide content
     */
    collapseContent() {
        if (this.expanded) {
            this.content.$el.hide();
            this.titleBar.toggleClass('collapsed', true);
            this.expanded = false;
        }
    }

    /**
     * Build content
     */
    buildContent() {
        this.content.setFeatures(this.features);
        this.contentBuilt = true;
        if (!this.expanded) this.content.$el.hide();
    }

    /**
     * Toggle content
     */
    toggleContent() {
        if (this.expanded) {
            this.collapseContent();
        } else {
            this.expandContent();
        }
    }
}

export default RelatedFeaturesControl;
