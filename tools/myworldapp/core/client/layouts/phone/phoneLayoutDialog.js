// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import View from 'myWorld/base/view';
import pageHtml from 'text!html/phone/phoneLayoutDialog.html';

export class PhoneLayoutDialog extends View {
    static {
        this.prototype.innerTemplate = template(pageHtml);

        this.prototype.genericEvents = {
            'click .close-btn': function () {
                this.toggle(false);
            }
        };
    }

    constructor(owner, options) {
        super(options);
        this.owner = owner;
        this.render();
    }

    _getButtonClass(number) {
        return 'btn' + number + '-btn';
    }

    _getTemplate() {
        let buttonsHTML = '';
        if (this.options.buttons) {
            for (let i = 0; i < this.options.buttons.length; ++i) {
                buttonsHTML +=
                    "<button class='" +
                    this._getButtonClass(i) +
                    "'>" +
                    this.options.buttons[i].text +
                    '</button>';
            }
        }
        return this.innerTemplate({
            title: this.options.title,
            message: this.options.message,
            buttons: buttonsHTML
        });
    }

    update(title, contents, buttons, onClose) {
        this.options.title = title;

        for (let index = 0; index < contents.length; index++) {
            contents[index] = contents[index].replace(/\n/g, '</p><p>');
        }
        this.options.message = `<p>${contents.join('</p><p>')}</p>`;
        this.options.buttons = buttons;
        this.options.onClose = onClose;

        this.$el.html(this._getTemplate());

        const events = Object.assign({}, this.events || {}, this.genericEvents);
        if (this.options.buttons) {
            for (let i = 0; i < this.options.buttons.length; ++i) {
                events['click .' + this._getButtonClass(i)] = this.options.buttons[i].click;
            }
        }
        this.delegateEvents(events);
    }

    render() {
        const newElement = $("<div class='dialog-container'></div>");
        newElement.append(this._getTemplate());
        this.setElement(newElement);
        this.$('.page-content').append($('<div>', { id: this.options.divId }));
        this.initSwipeEventHandlers();
    }

    initSwipeEventHandlers() {
        this.$('.overlay-header').swipe({
            swipeDown: () => {
                this.toggle(false);
            },

            threshold: 30
        });
    }

    toggle(show) {
        const funcName = show ? 'show' : 'hide';
        this.$el.children('.overlay')[funcName]();
        this.$el.children('.overlay-container')[funcName]('slide', { direction: 'down' });

        if (!show && this.options.onClose) {
            this.options.onClose();
        }
    }
}

export default PhoneLayoutDialog;
