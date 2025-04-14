// Copyright: IQGeo Limited 2010-2023
import MapInteractionMode from './mapInteractionMode';

export class ReadOnlyMode extends MapInteractionMode {
    static {
        this.prototype.isReadOnly = true;

        this.mergeOptions({
            clearSelection: true,
            disableContextMenu: false,
            fireAppEvents: true
        });
    }

    /**
     * Map interaction mode that doesn't process any interactions from the user.
     * This is used instead of MapInteractionMode as that still allows the selection of features using the ctrl dragbox
     * @param  {MapControl}  map map to handle user events on
     * @param  {Application|Control} owner Control
     * @constructs
     * @extends {MapInteractionMode}
     */
    constructor(map, options) {
        super(map);
        this.setOptions(options);
    }

    /**
     * Enables the mode
     */
    enable() {
        super.enable();
        //set context menu items
        if (this.options.disableContextMenu) {
            // close context menu prevent it is opened previously, otherwise a empty menu is showning on map
            this.map.contextmenu.closeMenu();
            this._disableContextMenu();
        } else {
            this._setContextMenuForSelectionMode(this.options.contextMenuItems); //no need to await on this. this method shouldn't be async
        }
        this._previousCursor = this.map.getTargetElement().style.cursor;
        this.setCursorTo('');
    }

    /**
     * Disables the mode
     */
    disable() {
        super.disable();
        this.map.contextmenu.clear();
        if (this.options.disableContextMenu) {
            this._enableContextMenu();
        }
        this.setCursorTo(this._previousCursor);
    }

    /**
     * An empty click handler
     */
    handleMapClick(event) {}

    /**
     * Called from map control
     */
    handleFeatureClick(feature, rep, evt) {}

    /**
     * Called from a map interaction
     * @returns {boolean} true returned, a drag box should be initiated
     */
    handleCtrlDragBoxStart() {
        return false;
    }

    /**
     * Handles a ctrl+mousedrag box on the map
     */
    async handleCtrlDragBox(event) {}

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

    /**
     * Disable both custom context menu and browser context menu
     */
    _disableContextMenu() {
        this.map.contextmenu.disable();
        this.map.getViewport().addEventListener('contextmenu', this._preventContextMenuOpen);
    }

    /**
     * Enable context menu on the map
     */
    _enableContextMenu() {
        this.map.contextmenu.enable();
        this.map.getViewport().removeEventListener('contextmenu', this._preventContextMenuOpen);
    }

    /**
     * Prevent contextmenu event proceed
     * @param {Event} event
     */
    _preventContextMenuOpen(event) {
        event.preventDefault();
    }
}

export default ReadOnlyMode;
