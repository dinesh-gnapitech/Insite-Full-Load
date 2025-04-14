// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { escape } from 'underscore';
import View from 'myWorld/base/view';
import { SuggestionSubMenu } from 'myWorld/controls/search/suggestionSubMenu';
import breadcrumbSeparatorImg from 'images/breadcrumb-separator.png';
import queryImg from 'images/search/query.svg';

export class SuggestionQueryView extends View {
    static {
        this.prototype.tagName = 'li';
        this.prototype.className = 'search-result suggestion-item';
        this.prototype.messageGroup = 'SearchControl';

        this.prototype.events = {
            mouseenter: 'highlightAndOpenSubMenu',
            touchstart: 'openSubMenuOnTouch',
            'click .search-result-label': 'choose'
        };

        this.prototype.fullscreenEvents = {
            click: 'toggleSubMenu'
        };
    }

    /*
     * @class Responsible for rendering a query suggestion <br/>
     * @param  {number}            options.index        Position of the item in the parent list
     * @param  {autoCompleteResult}  options.suggestion
     * @param  {SearchControl}   options.owner
     * @param  {string}              options.type         Type of suggestion. Provider title or 'recent'
     * @param  {boolean}             options.isFullscreen If search suggestions list is configured to span the full screen width
     * @constructs
     * @extends {Backbone.View}
     */
    constructor(options) {
        super(options);
        this.suggestions = options.suggestion; //array of autoCompleteResult
        this.index = options.index;
        this.owner = options.owner;

        this.listenTo(this.owner, 'change:highlightedIndex', this._toggleSelected);
        this.listenTo(this.owner, 'showSubMenu', this.showSubMenu);
        this.listenTo(this.owner, 'hideSubMenu', this._closeSubMenu);

        if (this.options.isFullscreen) this.events = this.fullscreenEvents;
        this.delegateEvents(this.events);
        this.render();
    }

    render() {
        const searchTerms = escape(this.owner.getSearchText()).split(' '),
            re = new RegExp(searchTerms.join('|'), 'gi'),
            //highlight the parts of the label that match the search text
            label = escape(this._getSuggestionLabel()).replace(
                re,
                match => `<span class='text-highlight'>${match}</span>`
            );

        this.subMenuIndicator = $(
            `<img class="sub-menu-indicator" src="${breadcrumbSeparatorImg}">`
        );

        const suggestionLabel = $('<span>')
            .addClass('search-result-label suggestion-item-label')
            .append($('<img>').attr('src', queryImg))
            .append(label);

        this.$el.empty().append(suggestionLabel).append(this.subMenuIndicator);

        this._toggleSelected();

        this.subMenu = new SuggestionSubMenu({
            owner: this.owner,
            suggestions: this.suggestions,
            isFullscreen: this.options.isFullscreen
        });
        this.subMenu.$el.appendTo(this.$el);
    }

    /*
     * Returns the label to use for the query suggestion item
     * @return {string} label
     * @private
     */
    _getSuggestionLabel() {
        const defaultSuggestion = this.suggestions[0]; //pick the first suggestion as default
        const label = defaultSuggestion.label;
        return label;
    }

    _toggleSelected() {
        this.hideSubMenu();
        this.$el.toggleClass('selected', this.index === this.owner.highlightedIndex);
    }

    highlightAndOpenSubMenu() {
        this.owner.setHighlightedIndex(this.index);
        this.showSubMenu();
    }

    /*
     * Highlight the item and open the sub-menu if its hidden
     * For touch devices we want to stop the click event from firing if the sub-menu is hidden
     */
    openSubMenuOnTouch(e) {
        if (!this.subMenu.isVisible) e.preventDefault();
        this.highlightAndOpenSubMenu();
    }

    toggleSubMenu(e) {
        if (this.subMenu.isVisible) {
            this.hideSubMenu();
        } else {
            this.highlightAndOpenSubMenu();
            e.preventDefault();
        }
    }

    choose(e) {
        // the user clicked the query "group"
        this.owner.selectACSuggestion(this.suggestions);
    }

    showSubMenu() {
        //Show the sub menu at its height if its a query
        if (this.index === this.owner.highlightedIndex) {
            this.toggleSubMenuIndicator(true);

            const topPos = this.$el.offset().top - this.$el.parent().parent().offset().top - 2,
                leftPos = this.$el.parent().outerWidth();
            this.subMenu.show(topPos, leftPos);

            this.owner.highlightedSubIndex = 0; //reset the sub-menu index
            this.owner.currentSubSuggestions = this.suggestions;
        }
    }

    hideSubMenu() {
        if (this.subMenu) {
            this.subMenu.hide();
            this.toggleSubMenuIndicator(false);

            this.owner.highlightedSubIndex = undefined; //reset the sub-menu index
            this.owner.currentSubSuggestions = undefined;
        }
    }

    /*
     * Used to close the sub menu in left arrow key press
     * @private
     */
    _closeSubMenu() {
        if (this.index === this.owner.highlightedIndex) {
            this.hideSubMenu();
        }
    }

    toggleSubMenuIndicator(show) {
        const activeClass = this.options.isFullscreen ? 'rotate' : 'active';
        this.subMenuIndicator.toggleClass(activeClass, show);
    }
}
export default SuggestionQueryView;
