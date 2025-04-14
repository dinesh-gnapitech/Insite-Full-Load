// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import adHocQueryHtml from 'text!html/adHocQuery.html';
import { trace } from 'myWorld/base';
import { DisplayMessage } from 'myWorld/controls';
import { Dialog, Dropdown } from 'myWorld/uiComponents';
import { SimpleClauseView, QueryRow, ArrayFieldEditor, BooleanSelect } from './simpleClauseView';
import { JoinClauseView } from './joinClauseView.js';
import { GeomClauseView } from './geomClauseView';
import { Predicate } from '../../base/predicate.js';

export class AdHocQueryDialog extends Dialog {
    static {
        this.prototype.messageGroup = 'AdHocQueryDialog';
        this.prototype.className = 'ad-hoc-query-content';
        this.prototype.template = template(
            $(adHocQueryHtml).filter('#ad-hoc-query-template').html()
        );

        this.mergeOptions({
            autoOpen: false,
            modal: false,
            minWidth: 480,
            minHeight: 520,
            resizable: true,
            position: { my: 'center', at: 'top+196', of: window },
            title: '{:ad_hoc_query_dialog_title}',
            closeText: '{:close_tooltip}',
            buttons: {
                Close: {
                    text: '{:close_btn}',
                    click() {
                        this.messageContainer.empty();
                        this.close();
                    }
                },
                Run: {
                    text: '{:run_btn}',
                    class: 'run-query-btn primary-btn',
                    click() {
                        this.runQuery();
                    }
                }
            }
        });
    }

    /**
     * @class Creates a dialog to display the ad-hoc query tool
     * @param  {AdHocQueryPlugin}    owner
     * @param  {object}              options
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(options);
        this.queriesContainerClass = 'query-rows-container';
        this.setDialogContent();
    }

    render() {
        super.render();

        this.messageContainer = $(
            '<div class="message-container ad-hoc-query-message"></div>'
        ).appendTo(this.$el.dialog('widget').find('.ui-dialog-buttonpane'));

        this.toggleRunBtn(false);

        this.translate(this.$el);
        this.delegateEvents();
    }

    /**
     * Resize and reposition the dialog to fit the window
     * Catering to the extra button panel height because of the in window & in selection checkboxes
     * @returns {boolean} False if dialog wasn't open
     */
    rePosition() {
        if (!this.$el.is(':ui-dialog')) return false;
        super.rePosition();

        const panelTopPos = this.$el.dialog('widget').offset().top;
        const titlebarHeight = this.$el.dialog('widget').find('.ui-dialog-titlebar').outerHeight();
        const buttonpaneHeight = this.$el
            .dialog('widget')
            .find('.ui-dialog-buttonpane')
            .outerHeight();
        const maxHeight =
            $(window).height() -
            panelTopPos -
            titlebarHeight -
            buttonpaneHeight -
            parseInt(this.$el.css('padding-bottom'), 10);

        this.$el.css({ 'max-height': maxHeight });
        //Over-ride the minHeight (initially set by options.minHeight) if there is not enough space
        const minHeight = this.$el.css('min-height');
        if (parseFloat(minHeight) > maxHeight) this.$el.css({ 'min-height': maxHeight });

        return true;
    }

    /*
     * Creates content for the dialog
     */
    setDialogContent() {
        this.container = this.template({
            queriesContainerClass: this.queriesContainerClass,
            select_feature_placeholder: this.msg('select_feature_placeholder')
        });
        this.setContent($(this.container).html()); // Sets the dialog content

        this.queriesContainer = this.$(`.${this.queriesContainerClass}`);

        const featureOptions = this._createFeatureTypesOptions(this.selectedFeature);
        const featureTypeSelectBox = new Dropdown({
            placeholder: this.msg('select_feature_placeholder'),
            options: featureOptions,
            sortField: 'label',
            onChange: this.handleFeatureSelection.bind(this),
            allowClear: true
        });
        this.$('.feature-type-select').append(featureTypeSelectBox.$el);

        this.geomClause = new GeomClauseView(this, {});
        this.$el.dialog('widget').find('.ui-dialog-buttonpane').prepend(this.geomClause.$el);
    }

    /*
     * Creates a UI for the predicate supplied
     * @param {Predicate} predicate
     */
    buildDisplayFor(predicate = null) {
        if (!predicate) predicate = Predicate.true;
        // Display predicate
        let parentRowClass =
            this._getTypeOf(predicate) === 'simple' ? SimpleClauseView : JoinClauseView;
        this.parentRow = new parentRowClass(this, {
            showJoinOperator: false,
            selectedFeature: this.selectedFeature,
            predicate,
            onRemove: this.handleParentRowDelete.bind(this)
        });
        this.queriesContainer.html(this.parentRow.$el);
        this.messageContainer.empty();
        this.rePosition();
    }

    _getTypeOf(predicate) {
        if (['comp_op', 'func_op', 'bool_const', undefined].includes(predicate.type))
            return 'simple';
        else return 'join';
    }

    /**
     * When a feature is selected, shows the elements
     * @param {*} ev
     */
    handleFeatureSelection(selectedFeature) {
        this.selectedFeature = selectedFeature;
        this.clauseRows = [];
        if (selectedFeature) this.buildDisplayFor(null);

        const show = !!selectedFeature;
        this.toggleRunBtn(show);
        this.$('.query-title').toggleClass('hidden', !show);
        this.$('.geom-clause').toggleClass('hidden', !show);
        this.queriesContainer[show ? 'show' : 'hide']();
    }

    /**
     * Creates html options for the area unit dropdown
     * @private
     * @return {string[]}
     */
    _createFeatureTypesOptions(selectedFeature) {
        let featureOptions = [];
        const featureTypes = this.app.getDatasource('myworld').featuresDD;
        this.selectedFeature = selectedFeature;
        Object.entries(featureTypes).forEach(([name, feature]) => {
            const featureName = feature.external_name;
            featureOptions.push({ id: name, label: featureName });
        });
        return featureOptions;
    }

    /**
     * Checks if the dialog is open.
     * @return {Boolean}
     */
    isOpen() {
        return this.$el.dialog('isOpen');
    }

    /**
     * Toggles the dialog
     * @param  {Boolean} show   Whether to open the dialog or to close it.
     */
    toggle(show) {
        const action = show ? 'open' : 'close';
        this.$el.dialog(action);
        if (show) this.rePosition();
    }

    async runQuery() {
        if (!this.parentRow.validateValue()) {
            this.message(this.msg('validation_error'), 'error');
            return;
        }
        let predicate = this.getPredicate();
        this.message(this.msg('running_query'), 'alert');
        const featureType = this.selectedFeature;
        try {
            const ds = await this.app.getDatasource('myworld');
            const primaryGeom = ds.getPrimaryGeomFieldNameFor(featureType);
            const geomClausePredicate = this.geomClause.getValue(primaryGeom);

            if (geomClausePredicate) {
                predicate = predicate.and(geomClausePredicate);
            }

            trace('adHocQuery', 3, 'predicate', predicate);

            const features = await ds.getFeatures(featureType, { predicate });
            this.message(this.msg('query_result', { count: features.length }), 'success');
            this.app.setCurrentFeatureSet(features);
            if (this.app.isHandheld) {
                if (features.length) {
                    this.messageContainer.on('click', this.showResultsList.bind(this));
                } else {
                    this.messageContainer.off();
                }
                this.messageContainer.toggleClass('results-link', !!features.length);
            }
        } catch (error) {
            this.message(this.msg('query_error'), 'error');
            this.messageContainer.off().toggleClass('results-link', false);
            throw error;
        }
        this.rePosition();
    }

    getPredicate() {
        return this.parentRow.getValue() || Predicate.true;
    }

    handleParentRowDelete() {
        this.buildDisplayFor(null);
    }

    toggleRunBtn(activate) {
        this.$el.dialog('widget').find('.run-query-btn').attr('disabled', !activate);
    }

    /*
     * Creates a message to display in the messageContainer (below the dialog buttons)
     */
    message(message, type) {
        if (this.app.isHandheld) {
            //For phone layout, we want to be able to click on the success message to go
            // to the results page
            this.messageContainer.empty().toggleClass('results-link', type === 'success');
            const contentDiv = $('<div>', { class: 'message-content' }).appendTo(
                this.messageContainer
            );
            contentDiv.html(message);
        } else new DisplayMessage({ el: this.messageContainer, type: type, message: message });
    }

    /*
     * In phone layout, shows the results page
     */
    showResultsList() {
        if (this.app.isHandheld) {
            this.app.layout.showResultsList();
            this.messageContainer.empty();
            this.close();
        }
    }
}

export default {
    AdHocQueryDialog,
    JoinClauseView,
    GeomClauseView,
    SimpleClauseView,
    QueryRow,
    ArrayFieldEditor,
    BooleanSelect
};
