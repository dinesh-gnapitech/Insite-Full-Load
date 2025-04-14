// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control } from 'myWorld/base/control';
import { convertUrl } from 'myWorld/base/util';

export class PluginButton extends Control {
    static {
        this.prototype.tagName = 'li';

        this.prototype.events = {
            click: 'handleClick'
        };
    }

    /**
     * @class  Abstract class for implementing buttons that offer functionality provided by a plugin/control <br/>
     *         In subclasses, implement the render method to control the UI of the button (disabling, hiding, etc..) <br/>
     *         .render() is invoked when the owner triggers a 'change' event. <br/>
     *         Implement the action method to define what should happen when the user clicks the button.<br/>
     *         The method initUI() is called as part of initialization. Implement it to initialize any <br/>
     *         UI components that are constant across changes in state (i.e. you don't want to create in each render())
     * @param  {Plugin|Control}  owner     Component that manages and is actioned by self
     * @param  {addButtonsOptions}  options   (Optional) Supplies the mode of the container the button is being added to
     * @extends Control
     * @constructs
     */
    constructor(...args) {
        super(...args);
        this.listenTo(this.owner, 'change', this.render);
        this.mode = this.options.mode;

        if (this.mode === 'menu') {
            this.buttonIcon = $('<img>').appendTo(this.$el);
            this.buttonTitle = $('<span>', { class: 'button-title' }).appendTo(this.$el);
        }

        if (this.imgSrc) this.setImage(this.imgSrc);
        if (this.titleMsg) this.setTitle(this.titleMsg);

        this.render = this.render.bind(this);

        this.initUI();

        this.render();
    }

    /**
     * Sets the title of the button:
     * HTML title for the toolbar button, and label for the menu button
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
        const imgUrl = convertUrl(imgSrc);
        if (this.mode === 'menu') {
            this.buttonIcon.attr('src', imgUrl);
        } else {
            this.$el.css('background-image', 'url(' + imgUrl + ')');
        }
    }

    initUI() {}

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

    handleClick() {
        this.action();
        this.options.postAction?.();
    }
}
