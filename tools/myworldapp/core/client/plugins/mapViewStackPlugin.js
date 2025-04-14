// Copyright: IQGeo Limited 2010-2023
import { Plugin, PluginButton } from 'myWorld-base';
import { RedoStack } from 'myWorld/base/redoStack';
import { isEqual } from 'underscore';
import arrowLeftImg from 'images/toolbar/arrow_left.svg';
import arrowRightImg from 'images/toolbar/arrow_right.svg';

export class MapViewStackPlugin extends Plugin {
    /**
     * @class Provides previous map views functionality <br/>
     * Adds two buttons to the toolbar that give the user the ability to cycle through previous map views
     * @param  {Application} owner                       The application
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner) {
        super(owner);

        this.map = this.app.map;

        this._ourEvent = false; //true if self is causing the map to generate an event

        //stack to hold the map view information
        this.mapStack = new RedoStack();

        this.postPanOrZoom = this.postPanOrZoom.bind(this);
        //listen  for map movement/zoom
        this.map.on('moveend', this.postPanOrZoom);
    }

    /**
     * Stores the current map view parameters
     * Handler for map pan or zoom
     * @private
     */
    postPanOrZoom() {
        //if the previous or next view button is pressed we don't want to update the map stack array
        if (!this._ourEvent) {
            const view = this.map.getMapViewParameters();
            if (!isEqual(this.mapStack.current(), view)) {
                this.mapStack.push(view);
                this.trigger('change');
            }
        }
        this._ourEvent = false;
    }

    /**
     * Changes the map to  use the previous/next view parameters
     * @param {string} direction One of "previous" or "next". Whether to go back to the previous view or the following one (once you've gone back at least once)
     */
    updateView(direction) {
        this._ourEvent = true;
        const aView = direction === 'previous' ? this.mapStack.unDo() : this.mapStack.reDo();
        this.trigger('change');

        this.map.setCurrentMapViewParameters(aView);
    }
}

class PrevMapViewButton extends PluginButton {
    static {
        this.prototype.id = 'a-map-previous';
        this.prototype.titleMsg = 'prev_view';
        this.prototype.imgSrc = arrowLeftImg;
    }

    render() {
        this.setActive(this.owner.mapStack.hasUnDo());
    }

    action() {
        this.app.recordFunctionalityAccess('core.toolbar.previous');
        this.owner.updateView('previous');
    }
}

class NextMapViewButton extends PluginButton {
    static {
        this.prototype.id = 'a-map-next';
        this.prototype.titleMsg = 'next_view';
        this.prototype.imgSrc = arrowRightImg;
    }

    render() {
        this.setActive(this.owner.mapStack.hasReDo());
    }

    action() {
        this.app.recordFunctionalityAccess('core.toolbar.next');
        this.owner.updateView('next');
    }
}

MapViewStackPlugin.prototype.buttons = {
    prev: PrevMapViewButton,
    next: NextMapViewButton
};

export default MapViewStackPlugin;
