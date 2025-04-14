// Copyright: IQGeo Limited 2010-2023
import { result } from 'underscore';
import { MywClass } from 'myWorld/base/class';
import activeContextMenuItem from 'images/activeContextMenuItem.png';
import inactiveContextMenuItem from 'images/inactiveContextMenuItem.png';

export class MapInteractionMode extends MywClass {
    /**
     * @class  Specifies what a MapInteractionMode class should implement.
     * Subclass and use with {MapControl#setInteractionMode} to change the handling of user interactions with the map, such as mouse clicks
     * @param  {MapControl} map
     * @constructs
     */
    constructor(map) {
        super();
        this.map = map;
        this.owner = map.owner;
        this.app = map.app;
        this._isEnabled = false;
    }

    /** to be called when the mode is enabled */
    enable() {
        this._isEnabled = true;
    }

    /** to be called when the mode is disabled (includes when being replaced by another mode ) */
    disable() {
        this._isEnabled = false;
    }

    /** to be called when the map is clicked
     * @param  {MouseEvent} event Mouse click event
     */
    handleMapClick(event) {
        return true; //do nothing but report as handled
    }

    /**
     * Called from map control. Stops click event propagating to Map
     */
    handleFeatureClick(feature, rep, evt) {
        evt.stopPropagation();
    }

    /**
     * Called from a map interaction
     * @returns {boolean} If false is returned, a drag box should not be initiated
     */
    handleCtrlDragBoxStart() {
        return false;
    }

    /**
     * @return {boolean} True if this mode is enabled
     */
    isEnabled() {
        return this._isEnabled;
    }

    /**
     * Returns context menu item configurations for an list of actions
     * @param   array {strings}  actions  list of actions to be processed
     * @param   {number}       base     (optional) initial menu index to be used
     * @return  array {objects}  menu item configurations for the actions
     */
    buildActionMenuItems(actions, base) {
        actions = actions || [];
        base = base || 0;

        const menuItems = actions
            .map(this._parseAction.bind(this))
            .filter(this._isActionAvailable.bind(this))
            .map((e, i) => this._getOptionsForAction(e, base + i));
        this.menuItems = menuItems;
    }

    /**
     * Returns component and actionId for an action string
     * @param  {string}  action
     * @return {object}  parts with component and actionId
     * @private
     */
    _parseAction(action, showOutput = true) {
        const parts = action.split('.');
        let component;
        let actionId;

        if (parts.length > 1) {
            //application or plugin action
            const pluginId = parts[0];

            actionId = parts[1];
            if (pluginId == 'application') component = this.app;
            else component = this.app.plugins[pluginId];
            if (!component && showOutput)
                console.log("No plugin '" + pluginId + "' available for '" + action + "'");
        } else {
            component = this.map;
            actionId = action;
        }

        return { component: component, actionId: actionId };
    }

    /**
     * Returns true if an action is available
     * @param  {object}  action with component and actionId
     * @return {boolean}
     * @private
     */
    _isActionAvailable(action) {
        const component = action.component;
        const actionId = action.actionId;

        if (actionId == '-') return true;
        if (!component) return false;

        const actionDef = component.actions?.[actionId];

        if (!actionDef) {
            console.log(`No action '${actionId}'`); //ENH: Show name of component in message
        }

        return typeof actionDef.available === 'undefined' || result(actionDef, 'available');
    }

    /**
     * Returns the context menu item configuration for a given action
     * @param  {object}  action with component and actionId
     * @param  {number}index  Index of the action in the menu
     * @return {object}        Check https://github.com/jonataswalker/ol-contextmenu for usage
     * @private
     */
    _getOptionsForAction(action, index) {
        const component = action.component;
        const actionId = action.actionId;
        if (actionId == '-') return actionId;

        const actionDef = component.actions?.[actionId];

        const checked =
            actionDef &&
            component[actionDef.checked] &&
            typeof component[actionDef.checked] === 'function'
                ? component[actionDef.checked](this.map)
                : !!component[actionDef.checked];

        const icon = checked ? activeContextMenuItem : inactiveContextMenuItem;

        return {
            text: component.msg('context_menu_' + actionId),
            icon,
            callback: this._executePluginContextMenuAction.bind(
                this,
                component,
                action,
                actionDef,
                index
            )
        };
    }

    /**
     * Executes a context menu plugin action.
     * The menu item is replaced so it can reflect a new state (if necessary)
     * @param  {object}     component
     * @param  {string}     action
     * @param  {object}     actionDef
     * @param  {number}   index
     * @param  {LatLng}     location.latlng
     * @param  {Point}      location.containerPoint
     * @param  {Point}      location.layerPoint
     * @private
     */
    _executePluginContextMenuAction(component, action, actionDef, index, location) {
        const methodName = actionDef?.action;
        let options;

        if (component[methodName]) {
            //execute the action
            component[methodName](this.map, location);

            options = this._getOptionsForAction(action, index);

            this.removeContextMenuItem(index);
            this.insertContextMenuItem(options, index);
            this.map.contextmenu.clear();
            this.map.contextmenu.extend(this.menuItems);
        } else {
            console.log("No method '" + methodName + "' for action '" + action + "'");
        }
    }

    removeContextMenuItem(index) {
        this.menuItems.splice(index, 1);
    }

    insertContextMenuItem(item, index) {
        this.menuItems.splice(index, 0, item);
    }

    setCursorTo(cursorName) {
        const el = this.map.getTargetElement();
        if (el) el.style.cursor = cursorName;
    }

    /*
     * Used by client test suite to work out which sort of event to fire
     * @returns false
     */
    shouldUseOpenLayersEvents() {
        return false;
    }

    /**
     * Only GeomDrawMode can be drawing
     * @returns {boolean} false
     */
    isDrawing() {
        return false;
    }

    /**
     * Only GeomDrawMode can be drawing first point
     * @returns {boolean} false
     */
    isDrawingFirstPoint() {
        return false;
    }
}

/**
 * Details of a map mouse event. {@link https://openlayers.org/en/latest/apidoc/module-ol_MapBrowserEvent-MapBrowserEvent.html}
 * Also includes a latlng property
 * @typedef MouseEvent
 */

export default MapInteractionMode;
