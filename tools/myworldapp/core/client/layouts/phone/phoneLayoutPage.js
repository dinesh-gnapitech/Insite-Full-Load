// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import pageHtml from 'text!html/phone/phoneLayoutPage.html';
import View from 'myWorld/base/view';

export class PhoneLayoutPage extends View {
    static {
        this.prototype.innerTemplate = template(pageHtml);

        this.prototype.genericEvents = {
            'click .close-btn': function () {
                this.toggle(false);
            }
        };
    }

    /**
     * @class A page to be used in the phone layout
     *        It has a page header with a left aligned title and a right aligned close button
     *        Can cover the full screen or the bottom 2/3rds of the screen with the map on the top 1/3rd of the screen
     *
     * @example
     *  new PhoneLayoutPage({owner: this, divId: 'layers-page', title: '{:layers_title}', withMap: true});
     * @param  {PhoneLayout}        owner    The owner of self
     * @param  {phoneLayoutPageOptions} options
     * @extends {View}
     * @constructs
     */
    constructor(owner, options) {
        super(options);
        const events = Object.assign(this.events || {}, this.genericEvents);
        this.owner = owner;
        this.render();
        this.delegateEvents(events);
    }

    render() {
        this.setElement(this.innerTemplate({ title: this.options.title }));
        const pageClass = this.options.withMap ? 'page-with-map' : 'full-page';
        this.$el.addClass(pageClass);
        this.$('.page-content').append($('<div>', { id: this.options.divId }));
        this.initSwipeEventHandlers();
    }

    /**
     * Handles the swipe down action using jquery-touchswipe
     */
    initSwipeEventHandlers() {
        this.$('.overlay-header').swipe({
            swipeDown: () => {
                this.toggle(false);
            },

            threshold: 30
        });
    }

    /**
     * Toggles the page
     * @param  {boolean} show   Whether to show the page or to hide it.
     */
    toggle(show) {
        this.$el[show ? 'show' : 'hide']('slide', { direction: 'down' });
        if (this.options.withMap) this.owner.toggleHeader(!show);
    }
}

/**
 * Options for {@link PhoneLayoutPage}
 * Options to configure the page to be used in the phone layout
 * @typedef phoneLayoutPageOptions
 * @property {string}             divId      The id of the element where the page content should be populated
 * @property {string}             title      Title for the page header
 * @property {boolean}            withMap    If set to true, the page only overlays the bottom 2/3rds of the map(used by layers and basemaps pages)
 */

export default PhoneLayoutPage;
