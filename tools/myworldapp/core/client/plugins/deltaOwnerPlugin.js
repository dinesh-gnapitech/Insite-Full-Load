// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Plugin } from 'myWorld-base';
import { PluginButton } from 'myWorld/base/pluginButton';
import { Dialog } from 'myWorld/uiComponents/dialog';
import DeltaOwnerToolbar from 'myWorld/controls/deltaOwnerToolbar';
import openImg from 'images/actions/open.svg';
import boundaryImg from 'images/actions/boundary.svg';
import listImg from 'images/actions/list.svg';
import showConflictsImg from 'images/actions/show_conflicts.svg';
import mergeImg from 'images/actions/merge.svg';
import promoteImg from 'images/actions/promote.svg';
import closeImg from 'images/actions/delta-close.svg';

/*
 * Provides functions for managing the current design / job (.currentDeltaOwner).
 *
 * Provides toolbar for opening delta, listing its elements, finding conflicts, etc.
 * Also displays title of delta owner in a label in the map pane (the 'watermark').
 */
export class DeltaOwnerPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'DeltaOwnerPlugin';

        this.mergeOptions({
            deltaOwners: [] // Feature types that can own a delta
        });

        // ----------------------------------------------------
        //  Action Buttons
        // ----------------------------------------------------

        // Open delta owned by current design
        this.prototype.OpenButton = class OpenButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'open_design';
                this.prototype.imgSrc = openImg;
            }

            action() {
                this.owner.openDeltaFor(this.app.currentFeature);
            }

            render() {
                this.setActive(!this.owner.isCurrentDeltaOwner(this.app.currentFeature));
            }
        };

        // Show/hide boundary of current design on map
        this.prototype.ToggleBoundaryButton = class ToggleBoundaryButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'show_boundary';
                this.prototype.imgSrc = boundaryImg;
            }

            action() {
                this.boundaryVisible = !this.boundaryVisible;
                this.owner.showDeltaOwnerBoundary(this.boundaryVisible);
            }

            render() {
                this.setActive(this.owner.isCurrentDeltaOwner(this.app.currentFeature));
            }
        };

        // Set the current feature set to the elements of the current design
        this.prototype.SelectElementsButton = class SelectElementsButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'show_elements';
                this.prototype.imgSrc = listImg;
            }

            action() {
                this.owner.selectElements();
            }

            render() {
                this.setActive(this.owner.isCurrentDeltaOwner(this.app.currentFeature));
            }
        };

        // Sets the current feature set to conflicted elements of the current design
        this.prototype.ShowConflictsButton = class ShowConflictsButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'show_conflicts';
                this.prototype.imgSrc = showConflictsImg;
            }

            action() {
                this.owner.selectConflicts();
            }

            render() {
                this.setActive(this.owner.isCurrentDeltaOwner(this.app.currentFeature));
            }
        };

        // Run conflict auto-resolution
        this.prototype.MergeButton = class MergeButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'merge';
                this.prototype.imgSrc = mergeImg;
            }

            action() {
                this.owner.merge();
            }

            render() {
                this.setActive(this.owner.isCurrentDeltaOwner(this.app.currentFeature));
            }
        };

        // Integrate current design into master
        this.prototype.PromoteElementsButton = class PromoteElementsButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'promote_elements';
                this.prototype.imgSrc = promoteImg;
            }

            action() {
                this.owner.publishElements();
            }

            render() {
                this.setActive(this.owner.isCurrentDeltaOwner(this.app.currentFeature));
            }
        };

        // Close current design
        this.prototype.CloseDeltaOwnerButton = class CloseDeltaOwnerButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'close_design';
                this.prototype.imgSrc = closeImg;
            }

            action() {
                this.owner.closeDelta();
            }

            render() {
                this.setActive(this.owner.isCurrentDeltaOwner(this.app.currentFeature));
            }
        };
    }

    /**
     * Initialise self
     */
    constructor(owner, options) {
        super(owner, options);

        this.toolbar = new DeltaOwnerToolbar(this);

        // Set initial state when other plugins have been initialized
        this.app.ready.then(async () => {
            // Catch changes to the current delta owner
            this.app.on('featureCollection-modified', this.handleFeatureEdited, this);
            this.app.on('database-view-changed', this.handleDatabaseViewChanged, this);

            const delta = this.app.getDelta();
            if (delta) {
                const deltaOwner = await this.app.database.getFeatureByUrn(delta);
                //ensure delta hasn't change during async call (e.g. url handling)
                if (delta === this.app.getDelta())
                    this.handleDatabaseViewChanged({ owner: deltaOwner });
            }
        });
    }

    /**
     * Show toobar in details pane if current feature is the delta owner (detailsControl interface)
     * @param  {Feature}    feature   The current feature
     * @param  {jqueryElement}  parentDiv Div on which to append the control
     */
    updateFeatureDetailsDivFor(feature, parentDiv) {
        this.toolbar.visible = feature && this.isDeltaOwner(feature);
        this.toolbar.parentDiv = parentDiv;
        this.toolbar.render();
    }

    /**
     * Zoom to a design and open it
     */
    async openDeltaFor(feature) {
        await this.activateDeltaFor(feature);
        this.app.map.zoomTo(feature); //should be done after changing delta, to avoid map refresh using old delta
    }

    /**
     * Set the current delta
     */
    activateDeltaFor(feature) {
        return this.app.setDelta(feature ? feature.getUrn() : '');
    }

    /**
     * Close current delta
     */
    closeDelta() {
        // Close the delta
        this.currentDeltaOwner = null;
        this.app.setDelta('');

        // Hide map label and toolbar
        this.updateMapWatermark();
        this.toolbar.render();
    }

    //Don't want to save feature as will give circular reference but do want to save something
    getState() {
        return {};
    }

    //Update map watermark on reload
    setState(state) {
        this.updateMapWatermark();
    }

    /**
     * Handle change to attributes of delta owners
     */
    async handleFeatureEdited(e) {
        if (!e.feature) return; // ENH: Misses bulk changes. Change event to include .features

        // Handle change to current delta owner
        if (this.isCurrentDeltaOwner(e.feature)) {
            if (e.changeType == 'update') {
                this.currentDeltaOwner = e.feature;
                this.updateMapWatermark();
            }

            if (e.changeType == 'delete') {
                this.closeDelta();
            }
        }

        // Handle change to any delta owner
        if (this.isDeltaOwner(e.feature)) {
            if (e.changeType == 'delete') {
                // ENH: Add predelete even and get confirmation that this is OK
                const n_recs = await e.feature.datasource.deltaDelete(e.feature.getUrn());
                if (n_recs > 0) {
                    this.showMessage(this.msg('deleted_elements', { n: n_recs }));
                }
            }
        }
    }

    async handleDatabaseViewChanged(e) {
        const owner = e.owner;
        if (owner) {
            this.currentDeltaOwner = owner;
            this.datasource = owner.datasource;
        } else {
            this.datasource = null;
            this.currentDeltaOwner = null;
        }

        // Show map label and toolbar
        this.updateMapWatermark();
        this.toolbar.render();
    }

    /**
     * Update the state of the map label for change to current delta owner
     */
    updateMapWatermark() {
        const mapPane = this.app.map.getTargetElement();

        // Remove existing label
        $(mapPane).find('.delta-owner-map-watermark').remove();

        // Create new label .. and add click handler
        if (this.currentDeltaOwner) {
            const label = $('<div>', {
                class: 'delta-owner-map-watermark noselect',
                text: this.currentDeltaOwner.getTitle()
            });
            $(mapPane).append(label);
            label.css('left', `calc(50% - ${label.outerWidth() / 2}px)`);
            label.click(this.selectDeltaOwner.bind(this));
        }
    }

    /**
     * Make the current delta owner the current feature
     */
    selectDeltaOwner() {
        this.app.setCurrentFeature(this.currentDeltaOwner);
    }

    /**
     * Show/hide boundary of current delta owner on map
     */
    // TODO: Conflicts with selection. Create a boundary object only
    showDeltaOwnerBoundary(show) {
        if (show) {
            this.app.map.createFeatureRep(this.currentDeltaOwner);
        } else {
            this.app.map.removeFeatureReps([this.currentDeltaOwner]);
        }
    }

    /**
     * Set the current feature set to the elements of the current design
     */
    async selectElements() {
        const delta = this.currentDeltaOwner.getUrn();
        const features = await this.datasource.deltaFeatures(delta);

        if (features.length == 0) {
            this.showMessage(this.msg('no_elements'));
            return;
        }

        this.app.setCurrentFeatureSet(features);
    }

    /**
     * Set the current feature set to conflicted elements of the current design
     */
    // ENH: provide a GUI to show conflict type etc
    async selectConflicts() {
        const delta = this.currentDeltaOwner.getUrn();
        const conflicts = await this.datasource.deltaConflicts(delta);

        if (conflicts.length == 0) {
            this.showMessage(this.msg('no_conflicts'));
            return;
        }

        this.app.setCurrentFeatureSet(conflicts);
    }

    /**
     * Apply auto-conflict resolution
     */
    async merge() {
        const delta = this.currentDeltaOwner.getUrn();

        // Find conflicts to fix
        const conflicts = await this.datasource.deltaConflicts(delta);
        if (conflicts.length == 0) {
            this.showMessage(this.msg('no_conflicts'));
            return;
        }

        // Apply auto-resolution
        let changedFeatures = [];
        if (this.currentDeltaOwner.resolveConflicts) {
            const features = await this.currentDeltaOwner.resolveConflicts(conflicts);
            changedFeatures = changedFeatures.concat(features);
        }

        // Say what we did
        const remainingConflicts = await this.datasource.deltaConflicts(delta);
        const nFixed = conflicts.length - remainingConflicts.length;
        this.showMessage(this.msg('n_conflicts_resolved', { n: conflicts.length, nFixed: nFixed })); // ENH: Say how many

        // Show changed objects
        // ENH: Provide more info
        if (changedFeatures.length > 0) {
            this.app.setCurrentFeatureSet(changedFeatures);
        }
    }

    /**
     * Integrate current design into master
     */
    async publishElements() {
        const delta = this.currentDeltaOwner.getUrn();

        // Check for cannot publish
        const hasConflicts = await this.datasource.deltaHasConflicts(delta);
        if (hasConflicts) {
            this.showWarning('DeltaOwner has conflicts - cannot publish'); // TODO: Use message
            return;
        }

        // Publish
        const nChanges = await this.datasource.deltaPromote(delta);
        if (nChanges > 0) {
            this.showMessage(`${nChanges} changes applied`); // TODO: Use message
        } else {
            this.showWarning('DeltaOwner has no elements'); // TODO: Use message
        }
    }

    /**
     * True if 'feature' can own a delta
     */
    isDeltaOwner(feature) {
        return this.options.deltaOwners.includes(feature.getType());
    }

    /**
     * True if 'feature' is the owner of the current delta
     */
    isCurrentDeltaOwner(feature) {
        if (!this.currentDeltaOwner) return false;
        return this.currentDeltaOwner.getUrn() == feature?.getUrn();
    }

    // Show an info message
    showMessage(msg) {
        new Dialog({
            title: 'Information', // TODO: Use message
            contents: msg
        });
    }

    // Show a warning message
    showWarning(msg) {
        new Dialog({
            title: 'Warning', // TODO: Use message
            contents: msg
        });
    }
}

export default DeltaOwnerPlugin;
