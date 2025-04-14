// Copyright: IQGeo Limited 2010-2023
import { template } from 'underscore';
import pageHtml from 'text!html/phone/phoneLayoutDetails.html';
import Control from 'myWorld/base/control';

export class PhoneLayoutDetails extends Control {
    static {
        this.prototype.innerTemplate = template(pageHtml);

        this.prototype.events = {
            'click .button-back': 'hide'
        };
    }

    /**
     * @class A page to be used in the phone layout to display the object's detail, or a list of objects
     *        It has a page header with a title in the center and a left aligned back button
     * @param  {PhoneLayout}  owner     The owner of self.
     * @param  {viewOptions}      options
     * @extends {Control}
     * @constructs
     */
    //ENH: Find a better name for this class
    constructor(owner, options) {
        super(owner, options);
        this.setElement(this.innerTemplate());
        if (this.attributes) this.$el.attr(this.attributes);
    }

    render() {
        this.$el.show();
        this.populateTitle();
        this.translate(this.$el);
        this.$('.phone-layout-details-container').css('top', this.$('.top').outerHeight());
    }

    /**
     * Populate the header with the info about the current selection
     */
    populateTitle(argument) {
        const feature = this.app.currentFeature;
        this.$('.feature-title').html(feature.getTitle());
        this.$('.feature-desc').html(feature.getShortDescription());
    }

    /**
     * Hides the current view and shows the previous page
     */
    hide() {
        this.$el.hide();
        this.owner.showPage(this.options.prevPageName);
    }
}
export default PhoneLayoutDetails;
