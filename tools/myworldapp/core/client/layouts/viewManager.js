// Copyright: IQGeo Limited 2010-2023
import { difference } from 'underscore';
import $ from 'jquery';
import { MywClass } from 'myWorld/base/class';

export class ViewManager extends MywClass {
    /**
     * @class Manages the visibility of the registered controls by dividing the available space among them.
     * Controls have to register and then request to become visible.
     *
     * @param  {number}maxItemsVisible Maximum number of controls to share the area managed by self
     * @constructs
     */
    constructor(maxItemsVisible) {
        super();
        this.maxVisible = maxItemsVisible;

        this.items = {};

        // All controls that we want to be visible.
        this._reqVisibleIds = [];

        // Controls that are visible. The end of the array is the left most visible control
        this._visibleIds = [];
    }

    /**
     * Registers a control to have its visibility controlled by self
     * @param  {string}             id              Id of the control
     * @param  {Control|jQuery} divOrControl    The control or div to be managed
     * @param  {boolean}            hideable        Whether this control can become hidden if several other controls request to become visible
     * @param  {function}           callback        Function to call when size changed so that, for example, buttons can be reconfigured
     */
    register(id, divOrControl, hideable, callback) {
        const item = {};
        item.control = divOrControl;
        item.hideable = !!hideable;
        item.callback = callback;

        this.items[id] = item;
    }

    unregister(id) {
        if (id in this.items) {
            this.hide(id);
            delete this.items[id];
            this._visibleIds = this._visibleIds.filter(i => i !== id);
            this._reqVisibleIds = this._reqVisibleIds.filter(i => i !== id);
        }
    }

    /**
     * Make a control visible.
     * If there are no available "slots" it returns false and no visibility is changed.
     * @param  {string} itemId  Id of the control to show
     * @return {boolean}        Whether it was possible to show the control or not
     */
    show(itemId) {
        const items = this.items;

        if (!this._reqVisibleIds.includes(itemId)) {
            //check if we need to (and can) hide an item in order to show the requested one
            this._reqVisibleIds.push(itemId);
            if (this._reqVisibleIds.length > this.maxVisible) {
                //is there an item we can hide if necessary
                const hideableId = this._visibleIds.find(id => items[id].hideable);
                if (hideableId) {
                    items[hideableId].control.hide();
                    this._visibleIds = this._visibleIds.filter(id => id !== hideableId);
                } else {
                    return false;
                }
            }
            this._visibleIds.push(itemId);
        }

        // If showing streetview then detach container and more to front
        // ENH: Make generic
        if (itemId == 'streetview') {
            const sv = $('#street-view-large-container');
            sv.detach();
            $('#view-container-start').after(sv);
        }

        this._showItems();

        return true;
    }

    /**
     * Make a control visible using all of the available space.
     * If there are other visible controls that shouldn't be hidden it returns false and
     * no visibility is changed.
     * @param  {string} itemId  Id of the control to show
     * @return {boolean}        Whether it was possible to show the control or not
     */
    showInFull(itemId) {
        const item = this.items[itemId];
        const showable = this._visibleIds.every(id => id == itemId || this.items[id].hideable);

        if (!showable) return false;

        if (!this._visibleIds.includes(itemId)) {
            //wasn't visible, include in visibles list
            this._reqVisibleIds.push(itemId);
            this._visibleIds.push(itemId);
            item.control.show('full');
        }

        item.control.css({ width: '100%', float: 'left' });

        for (const id of this._visibleIds) {
            if (id != itemId) this.items[id].control.hide();
        }
        return true;
    }

    /**
     * Hides a control and resets sizes of remaining visible controls
     * @param  {string} itemId Id of the control to hide
     */
    hide(itemId) {
        this.removeItem(itemId);
        this._showItems();
    }

    /**
     * Removes the item from the viewManager
     * @param  {string} itemId Id of the control to remove
     */
    removeItem(itemId) {
        //remove itemId from list of visible ids
        this._visibleIds = this._visibleIds.filter(id => id !== itemId);
        this._reqVisibleIds = this._reqVisibleIds.filter(id => id !== itemId);
        const item = this.items[itemId];
        item?.control.hide();
        // See we can add a view that should be visible but isn't
        if (
            this._visibleIds.length < this._reqVisibleIds.length &&
            this._visibleIds.length < this.maxVisible
        ) {
            const candidates = difference(this._reqVisibleIds, this._visibleIds);
            this._visibleIds.unshift(candidates[candidates.length - 1]);
        }
    }

    /**
     * Shows the controls in _visibleIds with the appropriate width
     * @private
     */
    _showItems() {
        const items = this.items;
        //set the correct width on the visible elements
        const width = 100 / this._visibleIds.length + '%'; //width for visible elements
        this._visibleIds.forEach(id => {
            const item = items[id];
            item.control.css({ width: width, float: 'left' });
            item.control.show();
            item.callback?.(width);
        });
    }

    /**
     * Returns whether an item is currently visible or not
     * @param  {string} itemId  Id of the control to check
     * @return {Boolean} true if the item is visible, otherwise false
     */
    isVisible(itemId) {
        return this._visibleIds.includes(itemId);
    }

    /**
     * Resize the visible map view controls
     */
    invalidateSize() {
        for (const id of this._visibleIds) {
            this.items[id].control.invalidateSize?.();
        }
    }

    /**
     * Return visible items identifiers
     * @return {Array<string>} visible items identifiers
     */
    visibleItems() {
        return this._visibleIds;
    }
}
