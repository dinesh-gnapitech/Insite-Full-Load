// Copyright: IQGeo Limited 2010-2023

import Button from './button';

/**
 * Button with default styles attached
 * @class  PrimaryButton
 * @param  {string} options.text Button label text
 * @param  {function} options.onClick onClick handler
 * @param  {boolean} options.loading Display a loading indicator
 *
 * @example
 * new PrimaryButton({
 *   text: "Hello World",
 *   onClick: function() {},
 *   loading: true
 * })
 *
 * @extends {Button}
 */
export class PrimaryButton extends Button {
    static {
        this.prototype.tagName = 'button';
        this.prototype.className = 'primary-btn ui-button ui-corner-all ui-widget';
    }
}

export default PrimaryButton;
