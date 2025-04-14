// Copyright: IQGeo Limited 2010-2023
import { intersection } from 'underscore';
import MapInteractionMode from './mapInteractionMode';
import TolerantDragPanInteraction from './tolerantDragPanInteraction';
import { modifierKeyPressed } from 'myWorld/base/keyboardEvent';

export class SelectionMode extends MapInteractionMode {
    static {
        this.mergeOptions({
            clearSelection: true,
            fireAppEvents: true
        });
    }

    /**
     * Map interaction mode that handles a map click by setting the results as the currentFeature(s)
     * @param  {MapControl}  map map to handle user events on
     * @param  {Application|Control} owner Control
     * @constructs
     * @extends {MapInteractionMode}
     */
    constructor(map, options) {
        super(map);
        this.multiSelectMode = false;
        this.setOptions(options);

        //  Find the tolerant drag pan interaction here so we can enable / disable it
        const interactions = map.getInteractions();
        interactions.forEach((interaction, i) => {
            if (interaction instanceof TolerantDragPanInteraction) {
                this.tolerantDragPanInteraction = interaction;
            }
        });

        ['_onKeyDown', '_onKeyUp'].forEach(method => (this[method] = this[method].bind(this)));
    }

    /**
     * Enables the mode - makes the map appear clickable
     */
    enable() {
        super.enable();
        //Map canvas looses focus and needs it for keyboard events
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);

        //set context menu items
        this._setContextMenuForSelectionMode(this.options.contextMenuItems); //no need to await on this. this method shouldn't be async

        this._previousCursor = this.map.getTargetElement().style.cursor;
        this.setCursorTo('pointer');
        this.tolerantDragPanInteraction?.setToleranceMode(true);
    }

    /**
     * Disables the mode - makes "clickable" state of the map back to what it was
     */
    disable() {
        super.disable();
        this.map.contextmenu.clear();

        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        this.tolerantDragPanInteraction?.setToleranceMode(false);

        this.setCursorTo(this._previousCursor);
    }

    /**
     * Handle a click on the map by sending a selection request and setting the application's currentFeature(s) from the results
     */
    handleMapClick(event) {
        //first check if the click is on the current feature or on a feature already on the current feature set
        const rep = event.featureReps?.[0];
        const feature = rep?.feature;

        const isCurrentFeature =
            feature && feature.getUrn(true, true) === this.app.currentFeature?.getUrn(true, true);
        const currentSetRep =
            feature && this.map.featureRepresentations[feature.getUrn(true, true)];

        if (isCurrentFeature) {
            //Clicked on current feature - pass and send request to server
        } else if (currentSetRep) {
            //ENH: Simplify this by moving setCurrentFeature call into this.processSelectedFeatures
            if (this.options.selectionHandler) {
                return this.options.selectionHandler([feature]);
            }
            //clicked on feature of current feature set, make it the current feature, keeping the set - will make it highlight
            return this.app.setCurrentFeature(feature, { keepFeatureSet: true });
        }

        //notify that a selection has started (ex: so featureDetails can show an appropriate message)
        if (this.options.fireAppEvents) this.app.fire('selection-started', { origin: 'map' });

        const selectionHandler =
            this.options.selectionHandler || this.processSelectedFeatures.bind(this);

        const { featureTypes } = this.options;
        this.map.selectFeatures(event.latlng, { featureTypes }).then(selectionHandler);
    }

    /**
     * Called from map control. Deselects clicked feature
     */
    handleFeatureClick(feature, rep, evt) {
        const app = this.app;
        if (this.multiSelectMode) {
            const nonMatchingFeatures = app.currentFeatureSet.items.filter(
                currentFeature => currentFeature.id != feature.id
            );
            evt.stopPropagation();
            return app.setCurrentFeatureSet(nonMatchingFeatures);
        }
        //single selection mode
        if (feature != app.currentFeature) {
            app.setCurrentFeature(feature, { keepFeatureSet: true });
            evt.stopPropagation();
        }
    }

    /**
     * Called from a map interaction
     * @returns {boolean} true returned, a drag box should be initiated
     */
    handleCtrlDragBoxStart() {
        return true;
    }

    /**
     * Handles a ctrl+mousedrag box on the map
     */
    handleCtrlDragBox(event) {
        //notify that a selection has started (ex: so featureDetails can show an appropriate message)
        if (this.options.fireAppEvents) this.app.fire('selection-started', { origin: 'map' });

        //Select features
        const { featureTypes } = this.options;
        this.map.selectBox(event.latLngBounds, { featureTypes }).then(features => {
            if (this.options.selectionHandler) this.options.selectionHandler(features);
            else {
                //Set features to current
                this.app.setCurrentFeatureSet(features);
            }
        });
        return true; //means it's been handled
    }

    /**
     * Turns multi select on when ctrl is pressed
     * @private
     */
    _onKeyDown(e) {
        //Only set multiple select when it is not selected from context menu
        //metaKey is mac command key
        if (modifierKeyPressed(e) && !this.multiSelectMode && !this.map.multipleSelect) {
            this.setMultipleSelect(true);
        }
    }

    /**
     * Turns off multi select on ctrl key up, if multiple select has not been selected from context menu
     * @private
     */
    _onKeyUp(e) {
        //ctrl key = 17, Left command = 91 in chrome and 224 in firefox
        if (!modifierKeyPressed(e) && !this.map.multipleSelect) {
            this.setMultipleSelect(false);
        }
    }

    /**
     * Stores multiple select mode on class
     * @param {boolean} check
     */
    setMultipleSelect(check) {
        this.multiSelectMode = check;
        if (check) this._changeCursorToDefault(false);
        else this._changeCursorToDefault(true);
    }

    /**
     * Sets cursor on map to default or non default (if input false)
     * NB If on chrome with debug window open the cursor will only refresh on mouse move
     * Close debug window and the behavior should be as expected.
     * @param {bool} defaultCursorStyle if true sets cursor to default style
     * @private
     */
    _changeCursorToDefault(defaultCursorStyle) {
        const container = this.map.getContainer();
        if (!container) return; //map is not on DOM anymore (e.g. internal map)
        if (!defaultCursorStyle) container.style.cursor = 'copy';
        else container.style.cursor = '';
    }

    /**
     * Sets currentFeature and currentFeatureSet taking into account previous selections
     * @param {Feature[]} features An array with recent list of selectable features
     */
    processSelectedFeatures(features) {
        //clear the currentFeatureSet as it is always replaced by the results of a selection
        const app = this.app;

        let selectedFeature = null;

        if (!features.length && !this.multiSelectMode) {
            //no features were found by selection and not in multiSelect mode or boxSelecting

            //on some maps we want to clear the current feature, on others we don't (like internals)
            if (this.options.clearSelection) {
                app.setCurrentFeatureSet([]);
            } else {
                //keep the currentFeature
                app.setCurrentFeature(app.currentFeature, { keepFeatureSet: true });
            }
        } else {
            // Add all of the features as highlighted features.
            const modifiable = app.currentFeatureSet.modifiable !== false;
            if (this.multiSelectMode) {
                if (modifiable) {
                    let currentFeatures = app.currentFeatureSet.items;
                    features = this._unionFeaturesExcludingDuplicates(currentFeatures, features);
                } else return; //FeatureSet isn't modifiable so don't change it
            } else if (features.length == 1) {
                selectedFeature = features[0];
            }
            app.setCurrentFeatureSet(features, { currentFeature: selectedFeature });
        }
    }

    /**
     * Concats the current feature set with the selected set, whilst removing any duplicates
     * @param {feature[]} currentFeatures
     * @param {feature[]} features
     * @private
     */
    _unionFeaturesExcludingDuplicates(features1, features2) {
        const urns1 = features1.map(feature => feature.getUrn());
        const urns2 = features2.map(feature => feature.getUrn());
        const intersect = intersection(urns1, urns2);
        features2 = features2.filter(feature => !intersect.includes(feature.getUrn()));
        features1 = features1.filter(feature => !intersect.includes(feature.getUrn()));
        return features1.concat(features2);
    }

    /**
     * Configures the map's context menu
     * The context menu is brought up by a right click or long touch
     * @params {Array<object>} [items] Check https://github.com/jonataswalker/ol-contextmenu for instruction on usage
     * @private
     */
    async _setContextMenuForSelectionMode(items) {
        await this.app.ready; //to ensure actions from plugins have been set?
        // before set the menu, ensure self is current interaction mode after waited the promise
        if (!this.isEnabled()) return;

        if (!items) {
            const actions = this.app.options.mapContextMenuActions || [];
            this.buildActionMenuItems(actions); //Sets this.menuItems
        } else {
            this.menuItems = items;
        }

        const menu = this.map.contextmenu;
        menu.clear();
        this.menuItems.forEach(item => menu.push(item));
    }
}

export default SelectionMode;
