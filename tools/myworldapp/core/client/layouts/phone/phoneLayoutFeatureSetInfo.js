// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import Backbone from 'backbone';
import config from 'myWorld/base/config';
import pageHtml from 'text!html/phone/phone.html';

const featureSetInfoHtml = $(pageHtml).filter('#feature-set-info-template').html(),
    noFeatureFoundAlertHtml = $(pageHtml).filter('#no-feature-alert-template').html();

export class PhoneLayoutFeatureSetInfo extends Backbone.View {
    static {
        this.prototype.innerTemplate = template(featureSetInfoHtml);
        this.prototype.nofeaturesTemplate = template(noFeatureFoundAlertHtml);
        this.prototype.className = 'feature-set-info noselect';

        this.prototype.events = {
            'click .num-results': 'showResultsList',
            'click .no-features-close-btn': 'closePane',
            'click .zoom-all-details': function () {
                this.owner.app.map.fitBoundsToFeatures(this.owner.app.currentFeatureSet.items);
            }
        };
    }

    /*
     * @class A view for the bar displayed on the map page with the number of results in the feature set and a next button
     *        The next button displays the FeatureSetItemView with the first feature in the feature set
     * @param  {PhoneLayout}  owner     The owner of self.
     * @extends {Backbone.View}
     * @constructs
     */
    constructor(options) {
        super(options);
        this.owner = options.owner;
        this.app = this.owner.app;
    }

    render() {
        this.$el.empty().swipe('destroy');
        if (this.owner.currentSelectionOrigin === 'clear_results') return;

        // If we received some offsets, then we have more results that can be fetched.
        const currentQueryDetails = this.app.getCurrentQueryDetails();

        const queryTotal = currentQueryDetails
            ? currentQueryDetails.totalCount
            : this.app.currentFeatureSet.totalCount;
        const featuresSize = this.app.currentFeatureSet.size();
        let noResults = false;
        let template;

        // Set the feature brief to display the number of results returned
        if (featuresSize === config['core.queryResultLimit'] && featuresSize < queryTotal) {
            template = this.innerTemplate({
                results_msg: this.owner.msg('first_num_results', { limit: featuresSize })
            });
        } else {
            if (featuresSize > 0) {
                template = this.innerTemplate({
                    results_msg: this.owner.msg('num_results', { count: featuresSize })
                });
            } else {
                noResults = true;
                template = this.nofeaturesTemplate();
            }
        }

        const clearButton = new this.owner.app.buttons['clearCurrentSet'](this.owner);
        this.$el
            .html(template)
            .prepend(this.owner.prevButton.el)
            .append(this.owner.nextButton.el)
            .append(clearButton.$el)
            .show();

        this.delegateEvents(this.events);
        this.owner.prevButton.delegateEvents();
        this.owner.nextButton.delegateEvents();

        this.initSwipeEventHandlers();

        if (noResults) clearButton.$el.attr('title', this.owner.msg('close'));
    }

    /*
     * Handles the swipe up and swipe left actions using jquery-touchswipe
     */
    initSwipeEventHandlers() {
        this.$el.swipe({
            swipeUp: () => {
                this.showResultsList();
            },
            threshold: 30
        });
    }

    /*
     * Shows the results list page
     */
    showResultsList() {
        this.owner.showResultsList();
    }

    /*
     * Hides the view with a slide down animation
     * The close button is only available when the view shows a 'no features found' message
     */
    closePane() {
        $('.bottom').toggle('slide', { direction: 'down' });
    }
}

export default PhoneLayoutFeatureSetInfo;
