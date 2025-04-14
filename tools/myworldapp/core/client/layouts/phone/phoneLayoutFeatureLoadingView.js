// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import Backbone from 'backbone';
import pageHtml from 'text!html/phone/phone.html';
import loadingGif from 'images/phone/loading.svg';

const featureLoadingHtml = $(pageHtml).filter('#feature-loading-template').html();

export class PhoneLayoutFeatureLoadingView extends Backbone.View {
    static {
        this.prototype.innerTemplate = template(featureLoadingHtml);
        this.prototype.className = 'center';
    }

    /*
     * @class  A view for the bar displayed on the map page with the title and short description of the current feature
     * @extends {Backbone.View}
     * @constructs
     */
    constructor() {
        super();
        this.render();
    }

    render() {
        this.$el.html(this.innerTemplate({ loadingGif }));
    }
}

export default PhoneLayoutFeatureLoadingView;
