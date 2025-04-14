// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import Backbone from 'backbone';

export class DisplayMessage extends Backbone.View {
    static {
        this.prototype.options = {
            type: 'success'
        };

        this.prototype.genericEvents = {
            //ENH: check why we can't just define 'events'
            'click .close': 'closeMessage'
        };
    }

    /**
     * Initializes the view by storing options and rendering it
     * @class UI to display a message to the user <br/>
     *        Success messages are displayed for a few moments and then goes away, whereas <br/>
     *        other message types stay on until clicked away
     * @example new DisplayMessage({el: this.$(".message-container"), type: 'success' , message: 'Done!'});
     * @param  {object} options                     In addition to options from Backbone.View:
     * @param  {string} [options.type='sucess']     Type of message that needs to be shown ('success'/'error'/'alert')
     * @constructs
     * @extends {Backbone.View}
     */
    constructor(options) {
        super(options);
        //ENH: check this initialization is really necessary. Just calling render() could be enough
        const events = Object.assign(this.events || {}, this.genericEvents);
        this.options = options;
        this.render();

        this.delegateEvents(events);
    }

    /**
     * Creates a messagebox according to the type in the options
     * Adds it to the container element
     * @private
     */
    render() {
        const messageBox = (this.messageBox = $('<div>', { class: 'alert-message' }));
        let msgClass;

        const alertText = $('<span>', { class: 'alert-text' }).text(this.options.message);

        if (this.options.type === 'error') {
            msgClass = 'alert-danger';
            messageBox.append(
                '<span type="button" class="close cancelAlert"><span>&times;</span></span>'
            );
        } else if (this.options.type === 'alert') {
            msgClass = 'alert-warning';
        } else if (this.options.type === 'info') {
            msgClass = 'alert-info';
        } else {
            msgClass = 'alert-success';
            //Automatically close the message after 2 seconds
            setTimeout(() => {
                this.closeMessage();
            }, 2000);
        }
        messageBox.addClass(msgClass).append(alertText);

        this.$el.html(messageBox);
    }

    closeMessage() {
        this.messageBox.fadeOut(500).remove();
    }
}

export default DisplayMessage;
