// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { result } from 'underscore';
import myw, { Util } from 'myWorld/base';
import { Control } from 'myWorld/base/control';
import 'jquery-ui';
import { SuggestionItemView } from 'myWorld/controls/search/suggestionItemView';
import { SuggestionQueryView } from 'myWorld/controls/search/suggestionQueryView';

export class SuggestionListView extends Control {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'search-results';

        this.prototype.events = {
            mousedown: 'cancelBlur'
        };
    }

    /*
     * @class Responsible for rendering the list with autocomplete suggestions <br/>
     * @param  {Application}  owner
     * @param  {jQueryElement}    options.underneath  The search input element used to position the examples view
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);

        this.list = $('<ul>').addClass('noStyleList');

        this.$el.append(this.list).appendTo('body');

        myw.appReady.then(() => {
            const underneathEl = this.options.underneath,
                top = underneathEl.offset().top + underneathEl.outerHeight();
            this.$el.css({
                top: top,
                left: underneathEl.offset().left
            });
            this._setListHeight(top);
            this.owner._setContainerWidth(this.$el);

            $(window).resize(() => {
                this._setListHeight(top);
            });
        });

        this.render();

        this.list.scroll(() => {
            //We want to close any open sub-menu
            //Since it is left hanging in its initial position while scrolling on touch devices
            this.owner.hideSubMenu();
        });
    }

    _setListHeight(top) {
        const buffer = this.owner.isFullscreen ? 12 : 10;
        this.$el.css('max-height', $(window).height() - top - buffer);
        this.list.css('max-height', 'inherit');
    }

    render() {
        //clear previous dom elements, removing event listeners
        this.views?.forEach(view => view.remove());
        this._views = [];

        this.list.empty();
        this.list.scrollTop(0);

        this._index = 0;
        Object.values(this.owner.providers).forEach(provider => this.renderProvider(provider));
        //Delete any cached highlightedSubIndex since the sub menus will be hidden initially
        delete this.owner.highlightedSubIndex;
    }

    renderProvider(provider) {
        let header;
        const suggestions = provider.suggestions ?? [];

        if (provider.title && suggestions.length > 0) {
            header = $('<li/>').addClass('provider-title').append($('<div/>').text(provider.title));

            if (provider.attribution)
                header.append(
                    $('<img/>', { src: Util.convertUrl(result(provider, 'attribution')) })
                );

            this.list.append(header);
        }

        suggestions.forEach(suggestion => {
            const options = {
                    index: this._index,
                    suggestion: suggestion,
                    owner: this.owner,
                    type: provider.type,
                    isFullscreen: this.owner.isFullscreen
                },
                isSingleQuery = Array.isArray(suggestion) && suggestion.length === 1;

            if (isSingleQuery) options.suggestion = suggestion[0];

            const suggestionView =
                Array.isArray(suggestion) && !isSingleQuery
                    ? new SuggestionQueryView(options)
                    : new SuggestionItemView(options);
            this._views.push(suggestionView);
            this.list.append(suggestionView.$el);

            this._index++;
        });
    }

    cancelBlur(e) {
        this.owner.cancelBlur = true;
    }

    /*
     * Refreshes the width of the list and hides any open sub menus
     * @param  {number}width Width of the search text input
     */
    refresh() {
        this.owner._setContainerWidth(this.$el);
    }
}
export default SuggestionListView;
