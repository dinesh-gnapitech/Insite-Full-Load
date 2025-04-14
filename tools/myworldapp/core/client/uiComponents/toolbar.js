// Copyright: IQGeo Limited 2010-2023

import View from 'myWorld/base/view';
import { ButtonPullDown } from './buttonPullDown';
import menuImg from 'images/toolbar/menu.svg';

export class Toolbar extends View {
    /**
     * @class  A uiComponent for a toolbar that holds a list of buttons. <br/>
     * It tries to fit the buttons provided in the width available. If it cannot, it creates an overflow menu.
     * @param  {Application|Control}    owner       Owner - application or another control
     * @param  {object}            options
     * @param  {string}            options.divId             Id of the div where self should be created
     * @param  {Array<buttonRef>}  options.buttons           List of buttons to display in the toolbar
     * @param  {number}          options.availableWidth    Width available in the container to fit the toolbar
     * @param  {number}          options.buttonWidth       Width a button will use in the menu (including padding and margins)
     * @constructs
     * @extends {View}
     */
    constructor(options) {
        super(options);
        this.setElement(options.element);
        this.populateButtons();
    }

    /**
     * Calculates how many buttons can fit in the toolbar and accordingly adds buttons to it
     * Creates an overflow menu if all the buttons can't fit
     */
    populateButtons() {
        const buttons = this.options.buttons;
        let buttonsInToolbar = this.options.buttons;
        if (this.options.availableWidth && this.options.buttonWidth) {
            let numButtonsInToolbar = parseInt(
                this.options.availableWidth / this.options.buttonWidth,
                10
            );

            if (numButtonsInToolbar < 0) numButtonsInToolbar = 0; //Makes sure the number is not negative

            buttonsInToolbar = buttons.slice(0, numButtonsInToolbar);
            let overflowButtons = buttons.slice(numButtonsInToolbar, buttons.length);

            //If there are some buttons that don't fit in the toolbar, then we'll need to create a menu button in the toolbar
            //Move one more button to the menu
            if (overflowButtons.length && buttonsInToolbar.length) {
                overflowButtons.unshift(buttonsInToolbar[buttonsInToolbar.length - 1]);
                buttonsInToolbar = buttonsInToolbar.slice(0, buttonsInToolbar.length - 1);
            }

            if (overflowButtons.length) {
                const Button = ButtonPullDown;
                const options = {
                    imgSrc: menuImg,
                    titleMsg: 'overflow_menu',
                    className: 'menu-button',
                    pullDownButtonRefs: overflowButtons
                };
                buttonsInToolbar.push({ owner: this, Button, options });
            }
        }
        //Refresh the toolbar
        this.$el.empty();
        this.addButtons(buttonsInToolbar);
    }

    /**
     * Adds a set of buttons to the toolbar
     * @param  {Array<buttonRef>}   buttons    List of button references for the toolbar buttons
     */
    addButtons(buttons) {
        buttons.forEach(buttonRef => {
            const { owner, Button, options } = buttonRef;
            if (options?.pullDownButtonRefs) {
                const _options = Object.assign(options, { ownerId: owner.$el.prop('id') });
                this.$el.append(new Button(_options).el);
            } else {
                this.$el.append(new Button(owner, options).el);
            }
        });
    }
}

/**
 * Information to create a button
 * @typedef buttonRef
 * @property {string}            owner        Owner of the button. Plugin, control or application
 * @property {string}            Button       Class to create the button
 * @property {addButtonsOptions} [options]    Supplies the mode of the element
 */

export default Toolbar;
