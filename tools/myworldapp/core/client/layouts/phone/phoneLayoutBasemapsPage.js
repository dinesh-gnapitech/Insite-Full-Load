// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { PhoneLayoutPage } from 'myWorld/layouts/phone/phoneLayoutPage';

export class PhoneLayoutBasemapsPage extends PhoneLayoutPage {
    static {
        this.prototype.events = {
            'click li': 'select'
        };
    }

    /*
     * @class Page to show the user's basemaps list
     * @param  {PhoneLayout}      owner     The owner of self.
     * @param  {viewOptions} options
     * @extends {PhoneLayoutPage}
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);
        this.map = this.owner.app.map;
        this.basemapsList = $('<ul>').appendTo(this.$(`#${this.options.divId}`));
    }

    /*
     * Shows the basemap page
     * Refreshes the current basemaps list
     */
    toggle(show) {
        if (show) {
            this.basemapsList.empty();
            const currentBasemapName = this.map.getCurrentBaseMapName();
            let selectedClass = '';

            this.map.baseLayerDefs.forEach(baseLayerDef => {
                selectedClass = baseLayerDef.name === currentBasemapName ? 'selected' : '';

                this.basemapsList.append(
                    `<li class="${selectedClass}">${baseLayerDef.display_name}</li>`
                );
            });

            //Add a selected class to the current basemap
            this.basemapsList.find('input:checked').parent('label').addClass('selected');
        }

        super.toggle(show);
    }

    /*
     * Selects the basemap and makes it the current basemap
     */
    select(ev) {
        const basemapName = $(ev.currentTarget).text();
        this.map.setCurrentBaseMap(basemapName);

        // move the selected class to the newly selected basemap in the list
        this.basemapsList.find('.selected').removeClass('selected');
        $(ev.currentTarget).addClass('selected');
    }
}
export default PhoneLayoutBasemapsPage;
