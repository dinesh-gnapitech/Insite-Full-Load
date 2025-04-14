//Copyright: IQGeo Limited 2010-2020
import $ from 'jquery';
import { FeatureSet } from 'myWorld/features';
import { Dialog } from 'myWorld/uiComponents';
import { SelectionMode } from 'myWorld/map';

export class FeatureSetSelectionDialog extends Dialog {
    static {
        this.prototype.className = 'featureset-selection-dialog';

        this.mergeOptions({
            autoOpen: false,
            destroyOnClose: false,
            noContainerPadding: true,
            modal: false,
            minWidth: 320,
            width: 320,
            resizable: false,
            title: '{:dialog_title}',
            closeText: '{:close_tooltip}',
            buttons: {
                Close: {
                    text: '{:cancel_btn}',
                    click() {
                        this.close();
                    }
                },
                Clear: {
                    text: '{:clear_btn}',
                    click() {
                        this.clearSelection();
                    }
                },
                Apply: {
                    text: '{:done_btn}',
                    class: 'primary-btn apply-feature-selection',
                    click() {
                        this.onOkClick();
                    }
                }
            }
        });

        this.prototype.events = {
            'click .result-remove-col': 'removeFeature',
            'click .mapObjectLabel:not(.not-clickable)': 'hideOwner'
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
        if (!options.onDone) throw new Error(`No onDone callback provided in options`);

        super(options);

        this.owner = owner;
        this.app = this.owner.app;
        this.typeConstraints = options.typeConstraints ?? [];
        this.selectedFeatureSet = new FeatureSet();
        this.selectedFeatureSet.addAll(options.features);

        this.initAppEventHandlers();
        this.render();
    }

    /**
     * Sets up handlers for application events
     */
    initAppEventHandlers() {
        this.app.on('reference-selection-opening', data => {
            if (data.origin !== this.owner && this.isOpen()) this.close();
        });
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
     * @fires map-interaction-dialog-opened
     */
    open() {
        this._enableSelectionMode();
        super.open();
        this.displaySelectionList();
        this.app.fire('map-interaction-dialog-opened');
    }

    /**
     * @fires map-interaction-dialog-opened
     */
    hideOwner() {
        this.app.fire('map-interaction-dialog-opened', { force: true });
    }

    /**
     * Hides the dialog and ends the map's current interaction mode if it
     * is currently using this dialogs selectionMode
     * @fires map-interaction-dialog-closed
     */
    close() {
        super.close();
        this._disableSelectionMode();
        this.app.fire('map-interaction-dialog-closed');
    }

    /**
     * Called by the owner when the available area for self changes
     * Adjusts the height of the results table container
     */
    invalidateSize() {
        if (this.tableContainer) this._setTableHeight();
    }

    _enableSelectionMode() {
        if (!this._selectModeByMap) this._selectModeByMap = new Map();
        this.app.getMaps().forEach(map => {
            let selectionMode = this._selectModeByMap.get(map);
            if (!selectionMode) {
                selectionMode = new SelectionMode(map, {
                    fireAppEvents: false,
                    featureTypes: Object.keys(this.typeConstraints),
                    selectionHandler: features => this.mapSelectionHandler(features)
                });
                this._selectModeByMap.set(map, selectionMode);
            }
            if (map.currentInteractionMode() !== selectionMode) {
                map.setInteractionMode(selectionMode);
            }
        });
        //In phone layout, show the map
        if (this.app.isHandheld) this.app.layout.showPage('page-map');
    }

    _disableSelectionMode() {
        this.app.getMaps().forEach(map => {
            let selectionMode = this._selectModeByMap.get(map);
            if (map.currentInteractionMode() === selectionMode) {
                map.endCurrentInteractionMode();
            }
        });
        //In phone layout, show the edit page
        if (this.app.isHandheld) this.app.layout.showPage('page-edit');
    }

    /**
     * Sets selectedFeatureSet taking into account previous selections
     * @param {Feature[]} features An array with recent list of selectable features
     */
    mapSelectionHandler(features) {
        const constraints = Object.keys(this.typeConstraints);
        features = features.filter(feature => {
            if (this.selectedFeatureSet.contains(feature)) return false;
            if (constraints?.length && !constraints?.includes(feature.getUniversalType()))
                return false;
            return true;
        });

        features.forEach(feature => {
            this.selectedFeatureSet.add(feature);
        });

        this.displaySelectionList();
    }

    displaySelectionList() {
        const constraints = Object.values(this.typeConstraints).map(
            featureDD => featureDD.external_name
        );
        const emptyFeatureMsg = constraints?.length
            ? this.msg('empty_constrained_feature_list', { types: constraints.join(', ') })
            : this.msg('empty_feature_list');
        const isMsgClickable = this.owner.isOwnerAPopup();
        let addFeatureMsgDiv = $(`<div>`, {
            class: `add-feature-msg mapObjectLabel ${isMsgClickable ? '' : 'not-clickable'}`
        });

        this.resultsTable = $('<table />', { class: 'tbl-results' });
        if (this.selectedFeatureSet.isEmpty()) {
            this.resultsTable = $('<table />', { class: 'tbl-results' });
            this.$('#featureset-selection')
                .empty()
                .append(addFeatureMsgDiv.text(emptyFeatureMsg))
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
            ).append(
                `<td class="result-remove-col" title="${this.msg('result-remove-link')}"></td>`
            );
            this.resultsTable.append(row);
        });
        const addFeatureMsg = constraints?.length
            ? this.msg('add_constrained_feature_to_list', { types: constraints.join(', ') })
            : this.msg('add_feature_to_list');
        this.tableContainer = this.$('#featureset-selection')
            .empty()
            .append(this.resultsTable)
            .append(addFeatureMsgDiv.text(addFeatureMsg))
            .scrollTop(0);

        this._formatResults();
        this._setTableHeight();
    }

    /**
     * Empty's the selectedFeatureSet and resultsTable, and clears the dialog UI
     */
    clearSelection() {
        this.selectedFeatureSet.removeAll();
        this.displaySelectionList();
    }

    removeFeature(ev) {
        const featureId = $(ev.currentTarget).parent('tr').attr('id');
        this.selectedFeatureSet.remove(featureId.substr(3, featureId.length));
        this.displaySelectionList();
    }

    /**
     * Resets this dialog's selectedFeatureSet it's initial state.
     */
    setFeatures(features) {
        this.selectedFeatureSet.removeAll();
        this.selectedFeatureSet.addAll(features);
    }

    /**
     * Finds the clicked on feature and sets it as the current feature
     * @param {event} ev results list row that is clicked on.
     *      Contains attribute featureId which is used to select the feature
     * @private
     */
    onOkClick() {
        const { onDone } = this.options;
        onDone(this.selectedFeatureSet.items);
        this.close();
    }

    /**
     * Renders the record count and sets css on the table
     * @private
     */
    _formatResults() {
        this.$('.tbl-results tr').removeClass('treven');
        this.$('.tbl-results tr:even').addClass('treven');
        this.$('.tbl-results tr:first td').addClass('trfirst');
        this.$('.tbl-results tr .result-title').removeAttr('title'); //Removes the unused tooltip
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
        if (this.app?.isHandheld) {
            //In phone layout, the dialog is at the bottom of the window
            //The dialogs top position needs updating when more features are added to the table
            //This makes sure that dialog action buttons in the bottom pane are always visible
            const dialogHeight = this.$el.dialog('widget').height();
            this.$el.dialog('widget').css('top', $(window).height() - dialogHeight);
        }
    }

    /*
     * For phone layout, adds a max-height of half the window height
     * (the super sets a very small height which makes viewing the list of features difficult)
     * Half the window height allows enough space for map interaction as well
     */
    rePosition() {
        super.rePosition();
        if (this.app?.isHandheld) {
            this.$el.css({
                'max-height': $(window).height() / 2
            });
        }
    }
}

export default FeatureSetSelectionDialog;
