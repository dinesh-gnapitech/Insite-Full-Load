// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import pageHtml from 'text!html/phone/phone.html';
import View from 'myWorld/base/view';

const mapLinkPageHtml = $(pageHtml).filter('#maplink-template').html();

export class PhoneLayoutMapLinkPage extends View {
    static {
        this.prototype.innerTemplate = template(mapLinkPageHtml);

        this.prototype.events = {
            'click .close-btn, .maplink-cancel': 'close'
        };
    }

    /*
     * @class View for the map link page
     * @extends {View}
     * @constructs
     */
    constructor() {
        super({});
        this.$el.html(this.innerTemplate());
        this.initSwipeEventHandlers();
    }

    /*
     * Handles the swipe down action using jquery-touchswipe
     */
    initSwipeEventHandlers() {
        this.$('.overlay-header').swipe({
            swipeDown: () => {
                this.hide();
            },

            threshold: 30
        });
    }

    /*
     * Shows the map link UI (slides up from the bottom)
     * @return {jqueryElement} The overlay container containing the action buttons
     *                         It's used by the mapLink plugin to connect the email button to an event handler
     */
    show() {
        this.$('.overlay-container').show('slide', { direction: 'down' });
        this.$('.overlay').show('fade');
        return this.$('.overlay-container');
    }

    /*
     * Closes this page and dispays the map page
     * Slides back into bottom
     */
    close() {
        this.$('.overlay-container').hide('slide', { direction: 'down' });
        this.$('.overlay').hide('fade');
    }
}

export default PhoneLayoutMapLinkPage;
