// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { escape } from 'underscore';
import FeatureViewer from './featureViewer';
import { Control } from 'myWorld/base/control';
import { msg } from 'myWorld/base/localisation';

export class FeatureBriefControl extends Control {
    static {
        this.mergeOptions({
            collapsed: true
        });

        this.prototype.events = {
            'click .feature-brief-header': '_toggleFeatureBriefDetail',
            'click #feature-brief-actions-panel, #feature-set-brief': '_showDetailsPanel'
        };
    }

    /**
     * @class Control that displays brief information about the current feature over the map. <br/>
     *        Used when the left panel is closed
     * @param  {Application|Control}    owner   The owner of self. The application or another control.
     * @param  {controlOptions}                 options
     * @constructs
     */

    constructor(owner, options) {
        super(owner, options);

        const app = this.app;
        this.collapsed = this.options.collapsed;

        this.featureViewer = new FeatureViewer(this);
        this.nothingToShow = true; //Set the flag used to determine if the feature brief should be shown
        this.render();

        // Setup handlers for application events
        app.on('currentFeature-changed currentFeatureSet-changed', () => {
            this.update();
        });
    }

    render() {
        this.featureTitle = $('<div class="panel-title" id="feature-brief-1"></div>');
        this.featureDesc = $('<div class="panel-subtitle" id="feature-brief-2"></div>');

        const moreButton = $("<span class='more-right panel-icon'></span>");

        this.buttonsPanel = $('<div id="feature-brief-actions-panel"></div>')
            .attr('title', this.msg('details'))
            .append(moreButton);
        const masterIcon = $('<span>', {
            class: 'master-layer-icon',
            title: msg('LayersControl', 'master_layer')
        });

        this.toggleButton = $('<div class="feature-brief-header"></div>')
            .addClass(!this.collapsed ? 'expanded panel-header' : '')
            .append(this.featureTitle)
            .append(this.featureDesc)
            .append(masterIcon); //the master icon is hidden by css for header without master-view class

        this.featureDetailContainer = $(
            '<div id="feature-brief-detail">' +
                '<div id="feature-brief-table"><div class="tbl-details left-panel-centered"></div></div>' +
                '</div>'
        )
            .append(this.buttonsPanel) // eslint-disable-next-line no-unexpected-multiline
            [!this.collapsed ? 'show' : 'hide']();

        this.featureSetBrief = $('<div class="panel-title" id="feature-set-brief"></div>');

        this.featureBrief = $('<div id="feature-brief-container"></div>')
            .append(this.toggleButton)
            .append(this.featureDetailContainer);

        this.$el.append(this.featureBrief).append(this.featureSetBrief);

        $(window).resize(() => {
            this.invalidateSize();
        });
    }

    _toggleFeatureBriefDetail() {
        this.collapsed = !this.collapsed;
        this.featureDetailContainer.toggle('blind');
        this.toggleButton.toggleClass('expanded panel-header');
        this.invalidateSize();
    }

    _showDetailsPanel() {
        this.app.layout.displayCurrentFeatureDetails();
    }

    show() {
        if (!this.nothingToShow) this._visibility('show');
    }

    hide() {
        this._visibility('hide');
    }

    /**
     * Shows or hides the Feature brief container
     * @param  {String} visibility ["show" or "hide"]
     * @private
     */
    _visibility(visibility) {
        this.$el[visibility]();
    }

    /**
     * Updates the feature brief according to the current feature
     */
    update() {
        const app = this.app,
            feature = app.currentFeature;

        this.nothingToShow = false; //Set the flag used to determine if the feature brief should be shown to true

        if (feature !== null && !feature.isNew) {
            // A feature

            const isMasterView = feature.datasource?.options.masterMode || false; //to make sure its a boolean, since masterMode could be undefined

            this.toggleButton.toggleClass('master-view', isMasterView);

            const title = feature.getTitle(),
                desc = feature.getShortDescription();

            if (title) this.featureTitle.html(escape(title)).show();
            else this.featureTitle.hide();

            if (desc) this.featureDesc.html(escape(desc)).show();
            else this.featureDesc.hide();

            // Show the feature brief only if the left panel is closed
            this[app.layout.state.west.isClosed ? 'show' : 'hide']();

            const tableBody = this.featureDetailContainer.find('.tbl-details').empty().show();
            this.featureViewer.renderAttributeList(feature, tableBody);

            this.featureBrief.show();
            this.invalidateSize();
            this.featureSetBrief.hide();
        } else if (
            app.currentFeatureSet.items.length > 0 &&
            !app.currentFeatureSet.items[0].isNew
        ) {
            // A feature set

            this.featureSetBrief
                .html(this.msg('result_count', { count: app.currentFeatureSet.items.length }))
                .show();
            this.featureBrief.hide();

            // Show the feature brief only if the left panel is closed
            this[app.layout.state.west.isClosed ? 'show' : 'hide']();
        } else {
            // There is no information for the selected object
            this.nothingToShow = true;
            this.hide();
        }
    }

    invalidateSize() {
        this.$el
            .find('#feature-brief-table')
            .css(
                'max-height',
                $(window).height() -
                    this.toggleButton.outerHeight() -
                    this.buttonsPanel.outerHeight() -
                    125
            );
    }

    getState() {
        return {
            collapsed: this.collapsed
        };
    }
}

export default FeatureBriefControl;
