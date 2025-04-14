// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import pageHtml from 'text!html/phone/phone.html';
import View from 'myWorld/base/view';

const featureInfoHtml = $(pageHtml).filter('#feature-info-template').html();

export class PhoneLayoutFeatureInfo extends View {
    static {
        this.prototype.innerTemplate = template(featureInfoHtml);
        this.prototype.className = 'feature-info';

        this.prototype.events = {
            'click .center': 'showFeatureDetails'
        };
    }

    /*
     * @class A view for the bar displayed at the bottom of the map page with the title and short description of the current feature
     * @param  {PhoneLayout}   owner     The owner of self.
     * @param  {viewOptions}       options
     * @extends {View}
     * @constructs
     */
    constructor(options) {
        super(options);
        this.owner = options.owner;
    }

    render() {
        const clearButton = new this.owner.app.buttons['clearCurrentSet'](this.owner);

        this.$el
            .html(this.owner.prevButton.el)
            .append(this.innerTemplate())
            .append(this.owner.nextButton.el)
            .append(clearButton.$el)
            .show();

        this.update();

        this.delegateEvents(this.events);
        this.owner.prevButton.delegateEvents();
        this.owner.nextButton.delegateEvents();

        this.initSwipeEventHandlers();
        this.owner.translate(this.$el);
    }

    /**
     * Updates the current feature info in the bottom pane
     */
    update() {
        const feature = this.owner.app.currentFeature;
        const title = feature ? feature.getTitle() : this.owner.msg('no_feature_found'),
            desc = feature ? feature.getShortDescription() : '';

        this.$('.feature-title').html(title);
        this.$('.feature-desc').html(desc);
    }

    /*
     * Handles the swipe up action using jquery-touchswipe
     */
    initSwipeEventHandlers() {
        this.$el.swipe({
            swipeUp: () => {
                this.showFeatureDetails();
            },
            //The number of pixels that the user must move their finger by before it is considered a swipe.
            //Default is 75
            threshold: 30
        });
    }

    /*
     * Shows the feature details page
     */
    showFeatureDetails() {
        this.owner.showHandheldFeatureDetails();
    }
}

export default PhoneLayoutFeatureInfo;
