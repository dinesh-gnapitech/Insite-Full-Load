// Copyright: IQGeo Limited 2010-2023
import { Plugin, Util } from 'myWorld-base';
import $ from 'jquery';
import RelatedFeaturesControl from '../controls/feature/relatedFeaturesControl';
import NoteListControl from '../controls/feature/noteListControl';

export class RelatedFeaturesPlugin extends Plugin {
    /**
     * @class Displays features associated with the current selected object<br/>
     * Shows a collapsable panel for each reference_set field that has a feature list field viewer set.
     * Also show a collapsable panel listing any associated notes
     * @param  {Application} owner                       The application
     * @constructs
     * @extends {Plugin}
     */
    // ENH: Retain control expansion state over selects ... and maybe over application restarts
    constructor(owner) {
        super(owner);

        this.ds = this.app.getDatasource('myworld');
        this.panels = {}; // Related feature panels, keyed by field ID
    }

    /****** FeatureDetailsControl API *****/
    updateFeatureDetailsDivFor(feature, parentDiv) {
        this.feature = feature;

        // Create containing div (if necessary)
        if (!this.div) {
            this.div = $('<div class="related-features-plugin"></div>');
            parentDiv.append(this.div);
        }

        // Remove all panels
        for (const panel of Object.values(this.panels)) {
            panel.$el.hide();
        }

        // Display features
        this.addFieldPanels();
        this.addNotesPanel();
    }

    /**
     * Add a collapsible panel for each reference_set field
     */
    async addFieldPanels() {
        const sessionVars = this.app.database.getSessionVars();
        for (const [field, fieldDD] of Object.entries(this.feature.featureDD?.fields || {})) {
            // Check for not a field type we can handle
            if (fieldDD.baseType != 'reference_set') continue;

            // Check for no list field viewer configured
            const viewerClass = Util.evalAccessors(fieldDD.viewer_class);
            if (!viewerClass || !viewerClass.featureListClass) continue;

            const isVisible = fieldDD.visible.matches(this.feature, sessionVars);
            if (!isVisible) continue;

            // Create control (if necessary)
            const key = `${this.feature.getType()}-${field}`;
            const panel = this.addPanel(key, fieldDD.external_name, viewerClass.featureListClass);

            // Display contents of field
            const featuresPromise = this.feature.followRelationship(field);
            panel.render(featuresPromise);
        }
    }

    /**
     * Add a collapsible panel showing associated notes
     */
    async addNotesPanel() {
        if (!this.ds.featuresDD['note']) return;

        const key = `${this.feature.getType()}-related-notes`;

        const panel = this.addPanel(key, this.msg('notes'), NoteListControl);

        const notesPromise = this.ds.getFeaturesByValue(
            'note',
            'referenced_feature',
            '=',
            this.feature.getUrn()
        );

        panel.render(notesPromise);
    }

    /**
     * Create a RelatedFeaturesControl and cache it using 'key'
     *
     * featureListClass is type of list control to embed in the panel (interface FeatureListControl)
     */
    addPanel(key, title, featureListClass = undefined) {
        let panel = this.panels[key];

        if (!panel) {
            const divId = `${key}-feature-list`;
            this.div.append(`<div id="${divId}"/>`); // Next call appends elements to this (backbone magic)

            panel = new RelatedFeaturesControl(this, {
                divId: divId,
                title: title,
                featureListClass: featureListClass
            });

            this.panels[key] = panel;
        }

        return panel;
    }
}

export default RelatedFeaturesPlugin;
