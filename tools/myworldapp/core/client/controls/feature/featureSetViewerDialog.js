//Copyright: IQGeo Limited 2010-2020
import $ from 'jquery';
import { FeatureSet } from 'myWorld/features';
import { Dialog } from 'myWorld/uiComponents';

export class FeatureSetViewerDialog extends Dialog {
    static {
        this.mergeOptions({
            autoOpen: false,
            destroyOnClose: false,
            modal: false,
            minWidth: 320,
            width: 320,
            resizable: false,
            title: '{:dialog_title}',
            closeText: '{:close_tooltip}',
            buttons: {
                Close: {
                    text: '{:cancel_btn}',
                    class: 'right',
                    click() {
                        this.close();
                    }
                }
            }
        });

        this.prototype.events = {
            'click .result-remove-col': 'removeFeature'
        };

        this.prototype.selectedRowCssClass = 'tbl-result-selected';
    }

    /**
     * @class Dialog to select a referenced feature
     * @param  {object}     options
     * @param  {featureSet} options.features
     * @param  {featureDDs}   options.typeConstraints DD of feature types that should be selectable by the dialog
     * @param  {function}   options.onDone  a method that takes the feature selected by the user
     * @constructs
     */
    constructor(owner, options) {
        super(options);

        this.owner = owner;
        this.app = this.owner.app;
        this.typeConstraints = options.typeConstraints ?? [];

        this.selectedFeatureSet = new FeatureSet();
        this.selectedFeatureSet.addAll(options.features);

        this.render();
    }

    /**
     * Checks if the dialog is open.
     * @return {Boolean}
     */
    isOpen() {
        return this.$el.dialog('isOpen');
    }

    render() {
        this.options.contents = `<div id="featureset-selection"></div>`;
        super.render();
        this.displaySelectionList();
    }

    /**
     * Makes the dialog visible and sets map's current interaction mode to be
     * dialogs selectionMode if it isn't already
     */

    open() {
        super.open();
        this.displaySelectionList();
    }

    /**
     * Called by the owner when the available area for self changes
     * Adjusts the height of the results table container
     */
    invalidateSize() {
        if (this.tableContainer) this._setTableHeight();
    }

    displaySelectionList() {
        const constraints = Object.values(this.typeConstraints).map(
            featureDD => featureDD.external_name
        );
        const emptyFeatureMsg = constraints?.length
            ? this.msg('empty_constrained_feature_list', { types: constraints.join(', ') })
            : this.msg('empty_feature_list');

        this.resultsTable = $('<table />', { class: 'tbl-results' });
        if (this.selectedFeatureSet.isEmpty()) {
            this.resultsTable = $('<table />', { class: 'tbl-results' });
            this.$('#featureset-selection')
                .empty()
                .append(`<div>${emptyFeatureMsg}</div>`)
                .scrollTop(0);
            return;
        }

        let row;
        this.selectedFeatureSet.items.forEach(feature => {
            const title = feature.getResultsHoverText?.() || this.msg('result-info-link');
            const urn = feature.getUrn(true, true); //include delta to support same feature in different deltas (forward view)
            row = $('<tr />', { class: 'result', id: `tr-${urn}` });
            row.append(
                `<td class="result-info-col"><div class="result-title" title="${title}">` +
                    `${feature.getResultsHtmlDescription()}</td>${feature.getExtraButtonsHTML()}`
            );
            this.resultsTable.append(row);
        });

        this.tableContainer = this.$('#featureset-selection')
            .empty()
            .append(this.resultsTable)
            .scrollTop(0);

        this._formatResults();
        this._setTableHeight();
    }

    /**
     * Resets this dialog's selectedFeatureSet it's initial state.
     */
    setFeatures(features) {
        this.selectedFeatureSet.removeAll();
        this.selectedFeatureSet.addAll(features);
    }

    /**
     * Renders the record count and sets css on the table
     * @private
     */
    _formatResults() {
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
}

export default FeatureSetViewerDialog;
