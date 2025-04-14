// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { msg } from 'myWorld/base';
import View from 'myWorld/base/view';

export class ButtonPullDown extends View {
    static {
        this.prototype.tagName = 'li';

        this.prototype.events = {
            click: 'toggle'
        };
    }

    /**
     * @class  A ui component that shows a pulldown with a list of buttons.
     * @param  {object}            options
     * @param  {string}            [options.className]         Class name to be used for the pull down launcher button
     * @param  {string}            options.ownerId             Id to be used to construct className for the pullDown
     * @param  {string}            options.imgSrc              Image to use for the button
     * @param  {string}            options.titleMsg            Title for the button
     * @param  {Array<buttonRef>}  options.pullDownButtonRefs  List of buttons to display in the pull down
     * @constructs
     * @extends {PluginButton}
     */
    constructor(options) {
        super(options);
        this.imgSrc = options.imgSrc;
        this.titleMsg = options.titleMsg;
        this.title = msg('buttonPullDown', options.titleMsg);

        this.mode = this.options.mode;

        if (this.mode === 'menu') {
            this.buttonIcon = $('<img>').appendTo(this.$el);
            this.buttonTitle = $('<span>', { class: 'button-title' }).appendTo(this.$el);
        }

        if (this.imgSrc) this.setImage(this.imgSrc);
        if (this.titleMsg) this.setTitle(this.titleMsg);

        if (this.options.className) this.$el.prop('class', this.options.className);
    }

    /**
     * Activates the pullDown list and shows self as active
     * And vice versa
     */
    toggle() {
        const centerPos = this.$el.offset().left + this.$el.outerWidth() / 2;
        if (!this.list) {
            //Display list
            this.list = new ButtonList({
                ownerId: this.options.ownerId,
                buttonRefs: this.options.pullDownButtonRefs,
                top: this.$el.offset().top + this.$el.outerHeight() + 10
            });

            this._setUpEventHandlers();
        }
        this.list.positionList(centerPos);
        this.$el.toggleClass('active');
        this.list.toggleDisplay();
    }

    _setUpEventHandlers() {
        // Event handler that closes the pulldown on click outside the pulldown
        $('body').mousedown(e => {
            const clicked = $(e.target); // get the element clicked
            if (!clicked.closest(this.$el).length && !clicked.closest(this.list.$el).length) {
                this.deactivate(); // click happened ouside the dialog and the launch button, close the pulldown list
            }
        });

        $(window).resize(() => {
            this.deactivate();
        });
    }

    deactivate() {
        this.$el.removeClass('active');
        this.list.hide();
    }

    /**
     * Sets the title of the pulldown:
     * HTML title for the pullDown element, and label for the list button
     * @param {string} titleMsg Message key to retrieve the button title
     */
    setTitle(titleMsg) {
        const title = this.title || this.owner.msg(titleMsg);

        if (this.mode === 'menu') {
            this.buttonTitle.html(title);
        } else {
            this.$el.attr('title', title);
        }
    }

    /**
     * Sets the icon image used for the button
     * @param {string} imgSrc Path to the icon image
     */
    setImage(imgSrc) {
        if (this.mode === 'menu') {
            this.buttonIcon.attr('src', imgSrc);
        } else {
            this.$el.css('background-image', 'url(' + imgSrc + ')');
        }
    }

    setActive(active) {
        if (active == this.active) return; //already at the desired state
        const hasInactiveImg = this.inactiveImgSrc !== undefined;

        //switching state
        if (active) {
            this.$el.removeClass('inactive');
            if (hasInactiveImg) this.setImage(this.imgSrc);
            this.delegateEvents();
        } else {
            this.$el.addClass('inactive');
            if (hasInactiveImg) this.setImage(this.inactiveImgSrc);
            this.undelegateEvents();
        }
        this.active = active;
    }
}

class ButtonList extends View {
    static {
        this.prototype.className = 'button-list-container';
    }

    /**
     * @class  A dropdown list of buttons positioned to open up under a launcher button
     * @param  {object}            options
     * @param  {string}            options.ownerId      Id to be used to construct className
     * @param  {Array<buttonRef>}  options.buttonRefs   List of buttons to display
     * @param  {number}          options.top          Top position of the dropdown container
     * @constructs
     * @extends {PluginButton}
     */
    constructor(options) {
        super(options);
        this.render();
    }

    render() {
        this.list = $('<ul>', { class: 'button-list noStyleList' })
            .css({ 'max-height': $(window).height() - this.options.top - 4 })
            .appendTo(this.$el);

        this.arrow = $('<div>', { class: 'arrow' }).appendTo(this.$el);

        this.$el
            .addClass(this.options.ownerId + '-button-list')
            .appendTo('body')
            .hide();

        this.addButtons(this.options.buttonRefs);
    }

    /**
     * Adds a set of buttons to an element of the DOM
     * @param {Array<buttonRef>}  buttons   A list of identifiers for {@link PluginButton}
     * @param {addButtonsOptions} [options]    Supplies the mode of the element
     */
    addButtons(buttons) {
        buttons.forEach(buttonRef => {
            const { owner, Button, options } = buttonRef;
            if (options?.pullDownButtonIds) {
                this.list.append(
                    new Button({ ...options, mode: 'menu', postAction: this.hide.bind(this) }).el
                );
            } else {
                this.list.append(
                    new Button(owner, { mode: 'menu', postAction: this.hide.bind(this) }).el
                );
            }
        });
    }

    /**
     * Positions the list container under the owner button
     * Positions the top arrow to point to the owner button
     * @param  {number}ownerPos Owner button's center point from the left of the screen
     */
    positionList(ownerPos) {
        let leftPos = ownerPos - this.$el.outerWidth() + 25;
        if (leftPos < 0) {
            this.arrow.css('right', 12 + -1 * leftPos);
            leftPos = 0;
        } else {
            this.arrow.css('right', 12);
        }
        this.$el.css({
            top: this.options.top,
            left: leftPos > 0 ? leftPos : 0
        });
    }

    hide() {
        this.$el.hide();
    }

    toggleDisplay() {
        this.$el.toggle();
    }
}

export default ButtonPullDown;
