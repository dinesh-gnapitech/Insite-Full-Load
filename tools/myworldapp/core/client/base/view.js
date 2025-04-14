// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { pick, uniqueId } from 'underscore';
import Backbone from 'backbone';
import MywClass from 'myWorld/base/class';

// List of view options to be merged as properties.
const viewOptions = [
    'model',
    'collection',
    'el',
    'id',
    'attributes',
    'className',
    'tagName',
    'events'
];

/**
 * Options for a {@link View} object. Extends options described in {@link http://backbonejs.org/#View-constructor} with:
 * @typedef viewOptions
 * @property {string}      [divId]   Id of the div where the plugin should create its UI elements
 */

export class View extends MywClass {
    static {
        this.include(Backbone.View.prototype);
        this.prototype.componentMapping = {};
    }

    /**
     * @class  Superclass for UI elements <br/>
     *         It holds a specific HTML element, which is accessible via the $el or el properties <br/>
     *         In Backbone terms it corresponds to a View. <br/>
     *         Includes the behaviour of Backbone.View. See {@link http://backbonejs.org/#View}
     * @constructs
     * @extends {MywClass}
     * @param  {viewOptions}  options
     */
    constructor(options = {}) {
        super();
        this.cid = uniqueId('view');
        Object.assign(this, pick(options, viewOptions));

        if (options.divId) {
            this.setElement($('#' + options.divId), false);
        } else {
            this._ensureElement();
        }
        this.delegateEvents();

        this.setOptions(options);
    } //Used by the UI components to register themselves to a particular type

    /**
     * Given a string, return an id appropriate for use in an html element id so that it can be
     * selected using a JQuery selector. There are a number of meta-characters that need to be escaped or
     * removed from the string. https://api.jquery.com/category/selectors/
     */
    getSafeIdFrom(raw_name) {
        // Replace all meta-character with underscore.
        // This regex needs to allow non-Latin characters to be used as group names whilst exluding
        // meta-characters.
        return raw_name.replace(/[!"#$%&'()*+,./:;<=>?@\\\[\]^`{|}~ ]/g, '_');
    }
}

export default View;
