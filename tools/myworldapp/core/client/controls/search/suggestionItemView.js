// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { escape, unescape } from 'underscore';
import View from 'myWorld/base/view';
import moreResultsImg from 'images/more_results.png';
import blankImg from 'images/search/blank.svg';
import bookmarkImg from 'images/search/bookmark.svg';
import coordinateImg from 'images/search/coordinate.svg';
import locationImg from 'images/search/location.svg';
import queryImg from 'images/search/query.svg';

export class SuggestionItemView extends View {
    static {
        this.prototype.tagName = 'li';
        this.prototype.className = 'search-result suggestion-item';
        this.prototype.messageGroup = 'SearchControl';

        this.prototype.events = {
            mouseenter: 'highlight',
            touchstart: 'highlight',
            click: 'choose'
        };
    }

    /*
     * @class Responsible for rendering one suggestion <br/>
     * @param  {number}            options.index       Position of the item in the parent list
     * @param  {autoCompleteResult}  options.suggestion
     * @param  {SearchControl}   options.owner
     * @param  {string}              options.type        Type of suggestion. Provider title or 'recent'
     * @constructs
     * @extends {Backbone.View}
     */
    constructor(options) {
        super(options);
        this.suggestion = options.suggestion;
        this.dataType = this.suggestion.type;
        this.index = options.index;
        this.owner = options.owner;

        this.listenTo(this.owner, 'change:highlightedIndex', this._toggleSelected);

        this.render();
    }

    render() {
        const searchText = this.owner.getSearchText();
        let label = escape(this.suggestion.label);
        let typeIconName;

        // Determinea the icon to be used for the list item
        switch (this.dataType) {
            case 'bookmark':
                typeIconName = bookmarkImg;
                break;
            case 'query':
            case 'external_query': {
                typeIconName = queryImg;
                const restriction = this.suggestion.data?.spatial_restriction;
                if (restriction) {
                    // add the spacial restriction message
                    label = this.msg(`${restriction}_restriction_label`, { label: label });
                }
                break;
            }
            case 'feature_search':
                if (!label.length) {
                    // Adds "..." at the end of the list of objects
                    label = `<img src="${moreResultsImg}" class="search-result-ellipsis">`;
                    typeIconName = blankImg;
                    this.$el.addClass('search-result-ellipsis-rows');
                } else {
                    typeIconName = queryImg;
                    label = this.owner.msg('feature_search', { text: label });
                }
                break;
            case 'placesAc':
                typeIconName = locationImg;
                break;
            case 'coordinate':
                typeIconName = coordinateImg;
                break;
            default:
                typeIconName = blankImg;
        }

        if (searchText.length === 0) {
            // Used for recent searches, keep original label
        } else {
            const searchTerms = this._escapeRegExp(this.owner.getSearchText()).split(' ');
            const re = new RegExp(searchTerms.join('|'), 'gi');
            //highlight the parts of the label that match the search text
            label = label.replace(re, match => `<span class='text-highlight'>${match}</span>`);
        }

        const suggestionLabel = $('<span>')
            .attr('title', unescape(this.suggestion.label))
            .addClass('search-result-label suggestion-item-label')
            .append($('<img>').attr('src', typeIconName))
            .append(label);

        this.$el.empty().append(suggestionLabel);

        this._toggleSelected();
    }

    _toggleSelected() {
        this.$el.toggleClass('selected', this.index === this.owner.highlightedIndex);
    }

    highlight() {
        this.owner.setHighlightedIndex(this.index);
    }

    choose(e) {
        this.owner.app.recordFunctionalityAccess(`core.search.${this.dataType}`);
        this.owner.selectACSuggestion(this.suggestion);
    }

    _escapeRegExp(str) {
        return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
    }
}
export default SuggestionItemView;
