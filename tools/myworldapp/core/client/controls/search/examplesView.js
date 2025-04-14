// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { escape } from 'underscore';
import myw from 'myWorld/base/core';
import { Control } from 'myWorld/base/control';
import 'jquery-ui';
import { SuggestionItemView } from 'myWorld/controls/search/suggestionItemView';

export class SearchExamplesView extends Control {
    static {
        this.prototype.className = 'search-examples rounded5';

        this.prototype.events = {
            mousedown: 'cancelBlur'
        };
    }

    /**
     * @class Responsible for rendering the search examples list and the Recent searches list <br/>
     * @param  {Application}  owner
     * @param  {Array<string>}    options.searchExamples   List of search examples configured via the config settings
     * @param  {jQueryElement}    options.underneath       The search input element used to position the examples view
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);

        this.searchExamples = options.searchExamples || [];

        this.examplesList = $("<ul class='noStyleList'></ul>");

        this.$el.html(this.examplesList).appendTo('body');

        myw.appReady.then(() => {
            const underneathEl = this.options.underneath,
                top = underneathEl.offset().top + underneathEl.outerHeight();
            this.$el.css({
                top: top,
                left: underneathEl.offset().left
            });

            this.owner._setContainerWidth(this.$el);
            this._setListHeight(top);

            $(window).resize(() => {
                this._setListHeight(top);
            });
        });

        this.recentSearches = this.owner.recentSearches;
        this.render();
    }

    _setListHeight(top) {
        this.$el.css('max-height', $(window).height() - top - 12);
        this.examplesList.css('max-height', 'inherit');
    }

    render() {
        this.examplesList.empty();
        this.examplesList.scrollTop(0);
        this._index = 0;

        if (this.recentSearches.length > 0) {
            // Add a header
            this.examplesList.append(
                `<li class='provider-title'>${this.owner.msg('recent_searches_header')}</li>`
            );

            const recentSearchesToDisplay = this.recentSearches.slice(
                0,
                this.owner.options.maxRecentSearchesShown
            );

            recentSearchesToDisplay.forEach(searchItem => {
                // Setup the example searches.
                const options = {
                    index: this._index,
                    suggestion: searchItem,
                    owner: this.owner,
                    type: 'recent'
                };

                const suggestionView = new SuggestionItemView(options);

                this.examplesList.append(suggestionView.$el);

                this._index++;
            });
        }

        if (this.app.plugins['adHocQueryPlugin']) {
            const buildQueryLink = this.app.plugins['adHocQueryPlugin'].buildQueryLink(this);
            this.examplesList.append(buildQueryLink.$el);
        }

        if (this.searchExamples.length > 0) {
            // Add a header
            this.examplesList.append(
                `<li class='provider-title'>${this.owner.msg('search_examples_header')}</li>`
            );

            this.searchExamples.forEach(example => {
                // Setup the example searches.
                this.examplesList.append(
                    `<li class="example"><span>${escape(example)}</span></li>`
                );
            });
        }
    }

    /**
     * Shows the examples view if show=true else hides it
     * @param  {boolean} show
     */
    toggle(show) {
        const anythingToShow = this.searchExamples.length > 0 || this.recentSearches.length > 0;
        if (anythingToShow && show) {
            this.render();
            this.$el.show();
        } else {
            this.$el.hide();
        }
        this.resetHighlight();
    }

    /**
     * Filters the recent searches based on the searchText provided and updates the this.recentSearches property
     * @param  {string} searchText  Test entered in the search input
     */
    filterRecentSearches(searchText) {
        let filteredRecentSearches = [];
        if (searchText.length > 0) {
            const lowerCaseSearchText = searchText.toLowerCase();
            this.owner.recentSearches.forEach(searchItem => {
                if (searchItem.label.toLowerCase().includes(lowerCaseSearchText)) {
                    filteredRecentSearches.push(searchItem);
                }
            });
        } else {
            filteredRecentSearches = this.owner.recentSearches;
        }
        this.recentSearches = filteredRecentSearches;
    }

    resetHighlight() {
        if (
            typeof this.owner.highlightedIndex === 'undefined' ||
            this.owner.allSuggestions().length === 0
        )
            this.owner.setHighlightedIndex(0);
    }

    cancelBlur(e) {
        this.owner.cancelBlur = true;
    }
}
export default SearchExamplesView;
