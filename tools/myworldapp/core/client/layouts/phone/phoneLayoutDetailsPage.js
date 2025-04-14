// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { PhoneLayoutDetails } from 'myWorld/layouts/phone/phoneLayoutDetails';
import { FeatureEditor, FeatureViewer, EditButton } from 'myWorld/controls';

export class PhoneLayoutDetailsPage extends PhoneLayoutDetails {
    static {
        this.prototype.attributes = {
            id: 'page-details'
        };

        this.mergeOptions({
            viewersState: {
                //state that will be shared across FeatureViewer instances
                attributeDisplayMode: 'full',
                collapsed: false
            },
            DefaultFeatureViewer: FeatureViewer,
            pluginIds: []
        });
    }

    /*
     * @class   Control to display feature details and display results.
     *
     * @param  {Application|Control}    owner       Owner of self
     * @param  {detailsPageOptions}             options
     * @constructs
     */
    constructor(owner, options) {
        options.prevPageName = 'page-map';
        super(owner.layout, options);

        this.actions = $('<ul>', { id: 'details-actions' }).prependTo(
            this.$('.phone-layout-details-container')
        );
        this.detailsTable = $('<div>', { id: 'tbl-details-attributes' }).appendTo(
            this.$('.phone-layout-details-container')
        );
        this.pluginExtras = {};
        this.pluginsExtrasContainer = $('<div>').appendTo(
            this.$('.phone-layout-details-container')
        );

        this.buttons = {
            edit: EditButton
        };

        /**Tracks the locked state editor should be in.
         * @type {boolean} */
        this.isEditorLocked = false;
    }

    render() {
        super.render();
        const feature = this.app.currentFeature;

        if (this.editor) {
            // we were editing a feature but are now displaying something different - disable edit mode
            this.editor.close();
            this.editor = null;
        }

        if (feature.isNew || this.mode == 'edit') {
            this.setCurrentFeatureEditable(feature);
        } else {
            const viewer = this._getViewerFor(feature);
            // Add the featureViewer's DOM element to the phone layout container and call display on it.
            this.detailsTable.html(viewer.el);
            viewer.displayFeatureDetails(feature);
            this._renderPluginExtras(feature);

            this.app.layout.showPage('page-details');

            //ENH: ensure necessary feature properties are available before continuing (instead of assuming it has been done by the application)
            //create buttons for when displaying a feature's details
            this.actions.empty();
            this.addButtons(this.actions, this.options.featureButtons);

            this.delegateEvents(this.events);
        }
        this.trigger('change'); //trigger event so buttons update themselves
    }

    /*
     * Returns a feature viewer appropriate for the given feature
     * Caches instances of the different viewer classes
     * @param  {Feature} feature
     * @return {FeatureViewer}
     */
    _getViewerFor(feature) {
        if (feature.viewerClass) {
            const type = feature.getType();
            if (!this._viewers) this._viewers = {};

            if (!this._viewers[type]) {
                this._viewers[type] = new feature.viewerClass(this, {
                    state: this.options.viewersState
                });
            }
            return this._viewers[type];
        } else {
            if (!this._defaultViewer) {
                const viewerOptions = { state: this.options.viewersState };
                this._defaultViewer = new this.options.DefaultFeatureViewer(this, viewerOptions);
            }
            return this._defaultViewer;
        }
    }

    /*
     * Starts edit mode for the current feature of the application
     */
    setCurrentFeatureEditable(feature) {
        this.$el.hide();
        let Editor;

        const editorOptions = {
            feature: feature,
            map: this.app.map,
            useTabs: true,
            useExpandedFieldEditors: true,
            useSoftKeyboardInput: true //Since the forms dont scrolls with the soft keyboard open in android
        };

        this.app.layout.showPage('page-edit');
        editorOptions.el = $('#feature-editor');

        Editor = feature.editorClass || FeatureEditor;
        this.editor = new Editor(this, editorOptions);
        this.editor.once('cancelled', this._editorClosed, this);
        this.editor.once('created_not_accessible', msg => {
            this.app.message(msg);
            this.app.setCurrentFeature();
        });
        this.editor.once('saved', featureProps => {
            this.handleSavedFeature(featureProps);
        });

        this.trigger('change');
    }

    async handleSavedFeature(featureProps) {
        const feature = featureProps.feature;
        await this.app.setCurrentFeature(feature);
        this.isEditorLocked = featureProps.isLocked;
        if (featureProps.isLocked) {
            //Create a new feature with the properties of the freshly created feature.
            const detachedFeature = await this.app.database.createDetachedFeature(
                feature.getType(),
                true
            );

            detachedFeature.properties = { ...feature.properties };
            //Remove the keyField property because we are creating a new feature
            delete detachedFeature.properties[feature.keyFieldName];

            this.app.setCurrentFeature(detachedFeature);
        }
    }

    /*
     * Sets the current mode of the control, and updates the UI
     * @param {string} mode 'view' or 'edit'
     */
    setMode(mode) {
        this.mode = mode;
        this.render();
    }

    /*
     * Handler for when the feature editor is closed.
     * @private
     */
    _editorClosed() {
        if (!this.app.currentFeature || this.app.currentFeature.isNew) {
            this.app.layout.showPage('page-map');
            this.app.setCurrentFeature(null);
            this.editor.close();
        } else {
            this.editor = null;
            //was editing an existing feature, display it in readonly mode
            this.setMode('view');
        }
    }

    _renderPluginExtras(feature) {
        //ENH: reduce duplication with code in detailsControl.js
        //check if the registered plugins want to add something
        this.pluginsExtrasContainer.show();
        for (const name of this.options.pluginIds) {
            const plugin = this.app.plugins[name];
            if (plugin?.updateFeatureDetailsDivFor) {
                const pluginContainer = this._getPluginExtraContainer(name);
                plugin.updateFeatureDetailsDivFor(feature, pluginContainer);
            }
        }
    }

    /*
     * Returns the container for the plugin extra. If it does not exist, creates one.
     * @param  {string} pluginName
     * @return {jQueryElement}
     */
    _getPluginExtraContainer(pluginName) {
        //ENH: reduce duplication with code in detailsControl.js
        if (!this.pluginExtras[pluginName]) {
            const pluginsDiv = this.pluginsExtrasContainer;
            const insertIndex = this.options.pluginIds.indexOf(pluginName);
            const pluginContainer = $('<div>');

            if (insertIndex > 0) {
                const prevContainer = pluginsDiv.children()[insertIndex - 1];
                this.$(prevContainer).after(pluginContainer);
            } else {
                pluginsDiv.append(pluginContainer);
            }
            this.pluginExtras[pluginName] = pluginContainer;
        }
        return this.pluginExtras[pluginName];
    }
}

PhoneLayoutDetailsPage.prototype.buttons = {
    edit: EditButton
};

/**
 * @typedef detailsPageOptions
 *
 * @property {Array<string>}    pluginIds        List of plugins that may provide addtional feature details by implementing method updateFeatureDetailsDivFor(feature, parentDiv)
 * @property {Array<buttonId>}  featureButtons   List of buttons to use when displaying details of a feature
 */

export default PhoneLayoutDetailsPage;
