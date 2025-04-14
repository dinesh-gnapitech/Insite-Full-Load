// Copyright: IQGeo Limited 2010-2023
import { Feature } from 'myWorld/features/feature';

export class GeocodeFeature extends Feature {
    /**
     * @class  Feature that represents an address search result
     * @param  {featureData} featureData Feature details
     * @param  {string} formattedAddress [description]
     * @augments Feature
     * @constructs
     */
    constructor(featureData, formattedAddress) {
        // Call the super constructor
        super(featureData, true);

        this.formattedAddress = formattedAddress;
    }

    /* ** View related methods ** */

    /**
     * Returns a string with the HTML to display button for obtaining directions to self
     * @return {string}
     */
    getExtraButtonsHTML() {
        //ENH: replace with a Plugin button
        return `<td class="details-directions" title="${this.msg('directions_button')}"></td>`;
    }

    getUrn() {
        return this.id;
    }

    /**
     * Returns an HTML string with the description to be shown in a myWorld results listing
     * Assumes the result will be enclosed in HTML where an <a> tag has started
     * @return {string} The html string with the formatted address
     */
    getTitle() {
        return this.formattedAddress;
    }

    hasDetailsToPresent() {
        return false;
    }
}

export default GeocodeFeature;
