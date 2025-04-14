// Copyright: IQGeo Limited 2010-2023
import { PhoneLayoutDetails } from 'myWorld/layouts/phone/phoneLayoutDetails';

export class PhoneLayoutStreetviewPage extends PhoneLayoutDetails {
    static {
        this.prototype.attributes = {
            id: 'page-street-view'
        };
    }

    /*
     * @class Page view for displaying the streetview of to the current feature
     * @param  {PhoneLayout}  owner   The owner of self.
     * @extends {PhoneLayoutDetails}
     * @constructs
     */
    constructor(owner) {
        const options = { prevPageName: 'page-details' };
        super(owner, options);
        this.$('.phone-layout-details-container').prop('id', 'street-view-large-container');
    }
}

export default PhoneLayoutStreetviewPage;
