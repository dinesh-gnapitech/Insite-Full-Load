// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import Backbone from 'backbone';
import pageHtml from 'text!html/phone/phone.html';

const featureSetItemInfoHtml = $(pageHtml).filter('#feature-set-item-info-template').html();

export class PhoneLayoutFeatureSetItemInfo extends Backbone.View {
    static {
        this.prototype.innerTemplate = template(featureSetItemInfoHtml);
        this.prototype.className = 'feature-set-item-info';

        this.prototype.events = {
            'click .feature-brief': 'showFeatureDetails',
            'click .results-list-button': 'showResultsList'
        };
    }

    /*
     * @class A view for the bar displayed on the map with the details for the feature set item
     *        It displays the title & short descripton of the feature
     *        The sequence of the feature in the feature set is also displayed
     *        The bar contains prev, next, a button to navigate to the results list view and a  clear selection button
     * @param  {PhoneLayout}  owner     The owner of self.
     * @extends {Backbone.View}
     * @constructs
     */
    constructor(options) {
        super(options);
        this.owner = options.owner;
    }

    render() {
        const feature = this.owner.app.currentFeature,
            title = feature ? feature.getTitle() : this.owner.msg('no_feature_found'),
            desc = feature ? feature.getShortDescription() : '';
        const clearButton = new this.owner.app.buttons['clearCurrentSet'](this.owner);

        this.$el
            .empty()
            .hide()
            .html(
                this.innerTemplate({
                    title: title,
                    desc: desc
                })
            )
            .prepend(this.owner.prevButton.el)
            .append(this.owner.nextButton.el)
            .append(clearButton.$el)
            .show();

        this.delegateEvents(this.events);
        this.owner.prevButton.delegateEvents();
        this.owner.nextButton.delegateEvents();

        this.initSwipeEventHandlers();
    }

    /*
     * Handles the swipe up and swipe left and swipe right actions using jquery-touchswipe
     */
    initSwipeEventHandlers() {
        this.$el.swipe({
            swipeUp: () => {
                this.showFeatureDetails();
            },
            threshold: 30
        });
    }

    /*
     * Displays the feature details page
     */
    showFeatureDetails() {
        this.owner.showHandheldFeatureDetails();
    }

    /*
     * Displays the results list pages
     */
    showResultsList() {
        this.owner.showResultsList();
    }
}

export default PhoneLayoutFeatureSetItemInfo;
