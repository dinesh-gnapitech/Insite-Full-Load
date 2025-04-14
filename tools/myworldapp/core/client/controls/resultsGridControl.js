// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import config from 'myWorld/base/config';
import { Plugin } from 'myWorld/base/plugin';
import { Control } from 'myWorld/base/control';
import { PluginButton } from 'myWorld/base/pluginButton';
import { DataTable } from './dataTable';
import ajaxLoaderImg from 'images/ajax-loader.gif';
import loadingImg from 'images/loading.svg';
import gridImg from 'images/actions/grid.svg';
import listImg from 'images/actions/list.svg';
import zoomImg from 'images/actions/zoom.svg';

export class ResultsGridControl extends Control {
    /**
     * @class Displays multiple-results / selected-features in a grid layout. Uses [DataTable]{@link DataTable} to create the grid layout.
     * @constructs
     * @param  {Application|Control} owner         Owner of self
     * @param  {object}                     options
     * @param  {string}                     options.divId  Id for the DOM element where the grid should be created
     *
     */
    constructor(owner, options) {
        super(owner, options);

        this.plugin_name = 'resultsgrid';
        this.currentSelectionOrigin = null;
        this.initHtml();
        this.initUserEventHandlers();
        this.initAppEventHandlers();
    }

    /**
     * Adds the multiple results grid HTML to the bottom panel
     */
    initHtml() {
        this.resultsGridId = 'results-grid';

        this.$el.append(
            '<div class="results-grid-report-container" id="results-grid-warning"></div>'
        );

        const buttonsDiv = $('<ul class="results-grid-actions"></ul>');
        this.addButtons(buttonsDiv, this.options.buttons);
        this.$el.append(buttonsDiv);

        this.$el.append(`<div id="${this.resultsGridId}"></div>`);
    }

    /**
     * Sets up handlers for application events
     */
    initAppEventHandlers() {
        this.app.on('selection-started query-started', data => {
            this.showResultsLoading();
        });

        this.app.on('currentFeatureSet-changed currentFeature-changed', this.update, this);
    }

    /**
     * Sets up handlers for user events
     */
    initUserEventHandlers() {
        const app = this.app,
            that = this;

        // Select feature on row click
        this.$el.on('click', 'tbody > tr', function (e) {
            that.selectGridRow($(this));
        });

        // Highlight on hover
        this.$el.on('mouseenter mouseleave', 'tbody > tr', function (event) {
            const feature = that.getFeatureInRow($(this));
            if (feature) {
                if (event.type === 'mouseenter') app.map.highlightFeature(feature);
                else if (feature !== app.currentFeature) {
                    app.map.unHighlightFeature(feature);
                }
            }
        });
    }

    /**
     * Called when the visibility of the holding panel is changed
     * @param  {boolean} visible
     */
    visibilityChanged(visible) {
        this.update(); //can't just render because we may need to request further details
    }

    /**
     * Gets the feature associated with a result row
     * @param  {object} row    DOM object for a grid row
     * @return {Feature}        Feature associated with the row
     */
    getFeatureInRow(row) {
        const featureId = $(row).prop('id');
        if (featureId.length === 0) return null;
        return this.app.currentFeatureSet.getFeatureByUrn(
            featureId.split(`${this.resultsGridId}-`)[1]
        );
    }

    /**
     * Selects a data row in the grid and navigates the map to the selected feature
     * @param  {object} row  DOM element for a resultsGrid row
     */
    selectGridRow(row) {
        const app = this.app;
        this.$('tr.grid-row-selected').removeClass('grid-row-selected');
        $(row).addClass('grid-row-selected');

        const feature = this.getFeatureInRow(row);
        if (feature) {
            if (feature.hasDetailsToPresent()) {
                app.setCurrentFeature(feature, { keepFeatureSet: true, zoomTo: true });
            } else {
                // no details to show, so just zoom to the result
                app.map.zoomTo(feature);
            }
        }
    }

    /**
     * Handler for currentFeature(s) changing
     */
    update(ev) {
        const currentItems = this.app.currentFeatureSet.items,
            currentFeature = this.app.currentFeature;

        if (
            (currentFeature === null && currentItems.length === 0) || //No results to display
            (currentFeature && (currentFeature.isNew || currentItems.length === 1)) || // It's a new feature or there's only one result in the set
            currentItems[0]?.formattedAddress
        ) {
            // Its a google address

            //remove grid
            this.itemsPromise = null;
        } else if (this.$el.is(':visible')) {
            // set of features
            // Check if the items are homogeneous (all of the same type)
            const itemType = currentItems[0].type;
            const isListHomogeneous = currentItems.every(item => item.type == itemType);
            this.itemsPromise = isListHomogeneous ? this.ensureValues() : null;
        } else {
            // pane is hidden, do nothing (keeping what ever is drawn)
            return;
        }

        this.render();
    }

    /**
     * Ensures that all the necessary properties for the items are available
     * @return {Promise}
     */
    ensureValues() {
        const database = this.app.database;
        const currentQuery = this.app.getCurrentQueryDetails();

        if (currentQuery && !currentQuery.options.displayValues) {
            //features came from a query, we can re redo it to get display values
            currentQuery.options.displayValues = true;
            this._valuesPending = true; //so we don't try to render before all values are available

            return database.runQuery(currentQuery.def, currentQuery.options).then(features => {
                //will trigger another call to this method where 'calculated' aspect will be ensured
                this.app.setCurrentFeatureSet(features, { queryDetails: currentQuery });
                return this._ensureValues();
            });
        }
        return this._ensureValues();
    }

    _ensureValues() {
        //ensure all required aspects are loaded. in particular 'calculated' is not loaded when running a query
        const aspects = ['simple', 'display_values', 'calculated'];
        const currentItems = this.app.currentFeatureSet.items;
        const missingData = currentItems.filter(feature => feature.hasAspects?.(aspects) === false);
        this._valuesPending = missingData.length > 0;

        if (this._valuesPending) {
            const promises = missingData.map(feature => feature.ensure(aspects));
            // Ignore the ones that are not resolved
            return Promise.allSettled(promises).then(() => (this._valuesPending = false));
        } else return Promise.resolve();
    }

    /**
     * Renders the UI to reflect the current state
     */
    render() {
        if (!this.itemsPromise) {
            //no features to render. hide panel holding grid
            this.removeGrid();
            this._currentItems = null;
        } else {
            //render can be called before _ensureValues, so wait until function is set and until it is resolved
            if (this._valuesPending) {
                this.showResultsLoading();
                this.itemsPromise.then(this.render.bind(this));
            } else {
                //results are ready
                if (this.loadingResultsDialog) this.loadingResultsDialog.dialog('close');

                const appCurrentItems = this.app.currentFeatureSet.items;
                const itemType = appCurrentItems[0].type;

                if (this._currentItems === appCurrentItems) {
                    //already displaying those features. no need to recreate the grid
                    //(and recreating it loses filtering)
                } else {
                    this._currentItems = appCurrentItems;
                    this.createGrid(itemType, this.app.currentFeatureSet.items);
                }
            }
        }
    }

    /**
     * Populate the grid container with the loading gif while the results are being loaded from the server
     * @private
     */
    showResultsLoading() {
        this.$(`#${this.resultsGridId}`).html(
            `<div class="loading_results"><div class="content-centered" id="results-loading-img"><img src="${ajaxLoaderImg}" alt="${this.msg(
                'loading_tip'
            )}" /></div><div class="content-centered">${this.msg('loading')}</div></div>`
        );
    }

    /**
     * Populate the grid container with the loading gif while the results are being loaded from the server
     * @private
     */
    showGridOpeningDialog() {
        //inform database that queries should include request for features' display values
        this.app.database.registerInterest('display_values');

        if (!this.loadingResultsDialog) {
            this.loadingResultsDialog = $(
                `<img src="${loadingImg}" alt="${this.msg('loading_tip')}" />`
            ).dialog({
                modal: true,
                width: 'auto',
                resizable: false,
                position: { my: 'center', at: 'center', of: window },
                closeText: this.msg('close_tooltip')
            });
            this.loadingResultsDialog.dialog('widget').addClass('noStyle');
        } else {
            this.loadingResultsDialog.dialog('open');
        }
    }

    /**
     * Passes on the list of features to DataTable to create a tables of feature properties.
     * Also populates the grid container with the details of the feature list.
     * @param  {string}             featureType  Type of features
     * @param  {Array<Feature>} currentItems Items in the current featureSet
     */
    createGrid(featureType, currentItems) {
        const currentItemsLength = currentItems.length,
            currentQueryDetails = this.app.getCurrentQueryDetails(),
            queryTotal = currentQueryDetails ? currentQueryDetails.totalCount : 0,
            resultGridWarning =
                currentItemsLength === config['core.queryResultLimit'] &&
                currentItemsLength < queryTotal
                    ? this.msg('showing_first', { count: currentItemsLength })
                    : '';

        this.dataTable = new DataTable(this, this.resultsGridId, currentItems, {
            onFilterChange: this._onFilterChange.bind(this)
        });

        this.$('#results-grid-table_filter').append(
            $("<span id='results-grid-result-report'></span>")
        );

        this.$('#results-grid-result-report').text(
            this.msg('result_report', { count: currentItemsLength })
        );

        this.$('#results-grid-warning').html(resultGridWarning);

        this.$el.children('.results-grid-actions, .results-grid-report-container').show();
    }

    _onFilterChange(urns) {
        this.app.setCurrentFeatureSetFilter(urns);
        // make sure the feature set on this object is synced with featureSet on application
        // each time the filter is applied do a resync
        this._currentItems = this.app.currentFeatureSet.items;
    }

    /**
     * Clears the grid and hides its DOM container
     */
    removeGrid(closeContainerIfEmpty) {
        //inform database that features' display values aren't necessary anymore
        this.app.database.unregisterInterest('display_values');

        closeContainerIfEmpty = closeContainerIfEmpty !== false;
        if (this.dataTable) {
            if (closeContainerIfEmpty) this.app.layout.close('south');
            this.dataTable.clear();
        }
        this.$el.children('.results-grid-actions, .results-grid-report-container').hide();
    }
}

class ShowResultsGridButton extends PluginButton {
    static {
        this.prototype.id = 'show-results-grid';
        this.prototype.imgSrc = gridImg;
        this.prototype.inactiveImgSrc = gridImg;
        this.prototype.titleMsg = 'show';
    }

    render() {
        const currentItems = this.app.currentFeatureSet.items,
            itemType = currentItems[0]?.type,
            isAddress = currentItems[0]?.formattedAddress,
            isListHomogeneous = itemType && currentItems.every(item => item.type == itemType),
            active = !isAddress && isListHomogeneous;

        this.setActive(active);
    }

    action() {
        const layout = this.app.layout,
            gridControlId = this.owner.options.gridControlId,
            gridControl = layout.controls[gridControlId];

        if (!gridControl.$el.is(':visible')) gridControl.showGridOpeningDialog();
        layout.close('west', undefined, true); //no animation
        layout.open('south');
        this.app.recordFunctionalityAccess('core.details_tab.show_results_grid');
    }
}

class ResultsListButton extends PluginButton {
    static {
        this.prototype.id = 'results-list-button';
        this.prototype.imgSrc = listImg;
        this.prototype.titleMsg = 'show_list';
    }

    action() {
        const layout = this.app.layout;
        this.app.setCurrentFeature(null, { keepFeatureSet: true });
        layout.close('south');
        layout.open('west');
        this.app.recordFunctionalityAccess('core.details_tab.show_results_list');
    }

    render() {
        this.setActive(true);
    }
}

/**
 * Plugin that exposes buttons related to the {@link ResultsGridControl}<br/>
 * Exposes the 'activate' button which will:<br/>
 * - make the south panel visible
 * - hide the west panel
 * - display an animation to make it clear for the user that the application is fetching the necessary data
 * @name ResultsGridPlugin
 * @constructor
 * @extends {Plugin}
 */
export class ResultsGridPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'ResultsGridControl';

        this.mergeOptions({
            gridControlId: 'resultsGridControl'
        });

        this.prototype.buttons = {
            activate: ShowResultsGridButton
        };
    }

    constructor(owner) {
        super(owner);

        this.app.on('currentFeatureSet-changed', () => {
            this.trigger('change');
        });
    }
}

class ZoomToAllButton extends PluginButton {
    static {
        this.prototype.className = 'zoom-all-details';
        this.prototype.imgSrc = zoomImg;
        this.prototype.titleMsg = 'zoom_all';
    }

    action() {
        this.app.map.fitBoundsToFeatures(this.app.currentFeatureSet.items);
    }
}

ResultsGridControl.prototype.buttons = {
    'zoom-all': ZoomToAllButton,
    'results-list': ResultsListButton
};

export default ResultsGridControl;
