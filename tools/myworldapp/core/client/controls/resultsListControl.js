// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import config from 'myWorld/base/config';
import { Control } from 'myWorld/base/control';

/**
 * Control to render the title and short description of the features in the current feature set <br/>
 * Each item includes behaviour to allow the user to select and zoom to the feature
 * @name ResultsListControl
 * @constructor
 * @extends {Control}
 */
export class ResultsListControl extends Control {
    static {
        this.prototype.events = {
            'mouseenter .tbl-results tr:visible': 'handleMouseEvent',
            'mouseleave .tbl-results tr:visible': 'handleMouseEvent',
            'click .result-info-col': 'selectFeature',
            'click .result-zoom-col': 'zoomToFeature'
        };

        this.prototype.selectedRowCssClass = 'tbl-result-selected';
    }

    constructor(...args) {
        super(...args);
        this.$el.append(`<div class="content-centered" id="results-limit-report"></div>`);
        this.$el.append(`<div id="results-content-table"></div>`);
        this.$el.append(
            `<div class="content-centered" id="more-results"><div id="results-report"></div></div>`
        );
    }

    /**
     * Renders the UI to display the information about the current feature set
     */
    render() {
        this.table = $('<table />', { class: 'tbl-results' });
        let zoomClass, row;

        // Add a new element for each selected feature.
        this.app.currentFeatureSet.items.forEach(feature => {
            const title =
                typeof feature.getResultsHoverText == 'function'
                    ? feature.getResultsHoverText()
                    : this.msg('result-info-link');
            zoomClass = feature.getGeometryInWorld('geo') ? '' : 'inactive';
            const urn = feature.getUrn(true, true); //include delta to support same feature in different deltas (forward view)
            row = $('<tr />', { class: 'result', id: `tr-${urn}` });
            row.append(
                `<td class="result-info-col"><div class="result-title" title="${title}">` +
                    `${feature.getResultsHtmlDescription()}</td>${feature.getExtraButtonsHTML()}`
            ).append(
                `<td class="result-zoom-col ${zoomClass}" title="${this.msg(
                    'result-zoom-link'
                )}"></td>`
            );

            this.table.append(row);
        });

        this.tableContainer = this.$('#results-content-table')
            .empty()
            .append(this.table)
            .scrollTop(0);

        this.formatResults();

        this._setTableHeight();

        this.delegateEvents();
    }

    /**
     * Renders the record count and sets css on the table
     */
    formatResults() {
        const app = this.app,
            currentQueryDetails = app.getCurrentQueryDetails(),
            queryTotal = currentQueryDetails
                ? currentQueryDetails.totalCount
                : app.currentFeatureSet.totalCount,
            featuresSize = app.currentFeatureSet.size();

        this.limitReport = this.$('#results-limit-report').html(
            this.msg('show_first', { count: featuresSize })
        );

        if (featuresSize === config['core.queryResultLimit'] && featuresSize < queryTotal) {
            this.limitReport.show();
        } else {
            this.limitReport.hide();
        }
        this.$('#results-report').html(this.msg('result', { count: featuresSize }));

        this.$('.tbl-results tr').removeClass('treven');
        this.$('.tbl-results tr:even').addClass('treven');
        this.$('.tbl-results tr:first td').addClass('trfirst');
    }

    /**
     * Sets the heights of the various components in the feature details panel
     * This is required esp. to support all screen sizes and the use of virtual keyboard on touch devices
     * @private
     */
    _setTableHeight() {
        const detailsTabSpace = this.$el.parent(),
            resultReportHeight = this.limitReport?.is(':visible')
                ? this.limitReport.outerHeight()
                : 0,
            navBarHeight = this.$el.siblings('.navigation-bar').outerHeight(),
            panelContentHeight = detailsTabSpace.height() - navBarHeight,
            topBarHeight = this.$el.siblings('.top').outerHeight() || 0; //Used in the phone layout

        this.tableContainer.height(
            panelContentHeight -
                resultReportHeight -
                this.$('#more-results').height() -
                topBarHeight
        );
    }

    /**
     * Called by the owner when the available area for self changes
     * Adjusts the height of the results table container
     */
    invalidateSize() {
        if (this.tableContainer) this._setTableHeight();
    }

    /**
     * Highlights or unhighlights the feature associated with a given event
     */

    handleMouseEvent(ev) {
        const featureId = $(ev.currentTarget).attr('id'),
            feature = this.app.currentFeatureSet.getFeatureByUrn(
                featureId.substr(3, featureId.length)
            );
        if (ev.type == 'mouseenter') this.app.fire('highlight-feature', { feature: feature });
        else this.app.fire('unhighlight-feature', { feature: feature });
    }

    /**
     * Finds the clicked on feature and sets it as the current feature
     * @param {event} ev results list row that is clicked on.
     *      Contains attribute featureId which is used to select the feature
     */
    selectFeature(ev) {
        const featureId = $(ev.currentTarget).parent('tr').attr('id'),
            feature = this.app.currentFeatureSet.getFeatureByUrn(
                featureId.substr(3, featureId.length)
            );
        this.setAsCurrentFeature(feature);
    }

    setAsCurrentFeature(feature) {
        if (feature.hasDetailsToPresent()) {
            this.app.setCurrentFeature(feature, { keepFeatureSet: true, zoomTo: true });
        } else {
            // no details to show, so just zoom to the result
            this.app.map.zoomTo(feature);
        }
    }

    zoomToFeature(ev) {
        const selectedRowClass = this.selectedRowCssClass,
            featureId = $(ev.currentTarget).parent('tr').attr('id');

        this.app.map.zoomTo(featureId.substr(3, featureId.length));

        //highlight the row
        this.$(`.${selectedRowClass}`).removeClass(selectedRowClass);
        this.$(ev.currentTarget).parent('tr').addClass(selectedRowClass);
    }

    hide() {
        this.$el.hide();
        this.undelegateEvents();
    }
}
