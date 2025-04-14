// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { PhoneLayoutPage } from 'myWorld/layouts/phone/phoneLayoutPage';

/**
 * View for the create object page that lists all the editable objects
 */
export class PhoneLayoutCreateObjectPage extends PhoneLayoutPage {
    static {
        this.prototype.events = {
            'click .newFeature': '_addNewFeature'
        };
    }

    /*
     * Updates the contents of this page
     * @param  {string|jqueryElement} contents
     */
    update(contents) {
        this.$(`#${this.options.divId}`).html(contents);
    }

    /*
     * Asks the create plugin to add the selected feature
     * @private
     */
    _addNewFeature(ev) {
        this.toggle(false);
        const selectedFeatureName = $(ev.currentTarget).prop('id');
        this.owner.app.plugins['createFeature'].addNewFeature(selectedFeatureName);
    }
}

export default PhoneLayoutCreateObjectPage;
