// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import config from 'myWorld/base/config';
import { PhoneLayoutDetails } from 'myWorld/layouts/phone/phoneLayoutDetails';
import { ResultsListControl, TraceResultControl } from 'myWorld/controls';
export class PhoneLayoutResultsListPage extends PhoneLayoutDetails {
    static {
        this.prototype.attributes = {
            id: 'page-results-list'
        };

        this.mergeOptions({
            resultsTypeMapping: {
                features: ResultsListControl,
                trace: TraceResultControl
            }
        });
    }

    /*
     * @class View to display all the features in a feature set
     * @param  {PhoneLayout}  owner   The owner of self.
     * @extends {PhoneLayoutDetails}
     * @constructs
     */
    constructor(owner) {
        const options = { prevPageName: 'page-map' };

        super(owner, options);
        this.owner = owner;
        this.app = owner.app;
    }

    /*
     * Populates the title with the number of results being displayed
     */
    populateTitle() {
        let resultsMsg;

        const currentQueryDetails = this.app.getCurrentQueryDetails(),
            queryTotal = currentQueryDetails
                ? currentQueryDetails.totalCount
                : this.app.currentFeatureSet.totalCount,
            featuresSize = this.app.currentFeatureSet.size();

        // Set the feature brief to display the number of results returned
        if (featuresSize === config['core.queryResultLimit'] && featuresSize < queryTotal) {
            resultsMsg = this.owner.msg('first_num_results', { limit: featuresSize });
        } else if (this.app.currentFeatureSet.size()) {
            resultsMsg = this.owner.msg('num_results', {
                count: this.app.currentFeatureSet.size()
            });
        }
        this._update(resultsMsg);
    }

    /*
     * Gets the data to display on the page based on the resultsTypeMapping
     */
    _update(numResults) {
        this.$('.feature-title').html(numResults);

        if (!this.owner.resultListControl) this.owner.resultListControl = {};

        //Instantiate control for the feature set type if it hasnt been done already
        const type = this.app.currentFeatureSet?.type;
        if (!this.owner.resultListControl[type]) {
            const Control = this.options.resultsTypeMapping[type];
            //create element
            const id = `results-${type}`;
            const el = $(`<div id="${id}" class="results-list"></div>`);
            this.$('.phone-layout-details-container').append(el);
            //instantiate control
            this.owner.resultListControl[type] = new Control(this.owner, { el });
        }

        //Only show the container that has results of the current feature set type
        this.$('.results-list').hide();
        this.$(`#results-${type}`).show();

        const control = this.owner.resultListControl[type];
        if (!control) return;
        control.render();
    }
}

export default PhoneLayoutResultsListPage;
