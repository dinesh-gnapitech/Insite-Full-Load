// Copyright: IQGeo Limited 2010-2023
import View from 'myWorld/base/view';

export class SuggestionSubMenuItem extends View {
    static {
        this.prototype.tagName = 'li';
        this.prototype.className = 'search-result-option suggestion-item';
        this.prototype.messageGroup = 'SearchControl';

        this.prototype.events = {
            touchstart: 'highlight', //On touch devices a click event will not be fired if dom is changed on mouseenter hence need touchstart to trigger highlight
            mouseenter: 'highlight', //Then mouseenter will not do anything to DOM (on touch devices)
            click: 'choose' //So click will be triggered
        };
    }

    /*
     * @class Responsible for rendering the items in the sub-menu
     * @param  {autoCompleteResult}  options.suggestion
     * @param  {SearchControl}   options.owner
     * @param  {number}            options.index  Position of the item in the parent list
     * @constructs
     * @extends {Backbone.View}
     */
    constructor(options) {
        super(options);

        this.suggestion = this.options.suggestion;
        this.owner = options.owner;
        this.index = options.index;

        this.listenTo(this.owner, 'change:highlightedSubIndex', this._toggleSelected);
        this.render();
    }

    render() {
        const spacialRestriction = this.suggestion.data.spatial_restriction;
        const hasGeom = this.suggestion.data.has_geometry;
        let label = '';
        let itemClass = '';

        switch (spacialRestriction) {
            case null:
                label = this.msg('no_spatial_restriction');
                itemClass = 'selected'; //select it by default
                break;
            case 'window':
                label = this.msg('in_window_restriction');
                if (!hasGeom) itemClass = 'inactive';
                break;
            case 'selection':
                label = this.msg('in_selection_restriction');
                if (!hasGeom || !this.owner.polygonSelected) itemClass = 'inactive'; //When no geom feature or there isn't any polygon selected, show this item as inactive
                break;
            default:
                return;
        }
        this.$el.append(`<span class='suggestion-item-label'>${label}</span>`).addClass(itemClass);
    }

    choose(e) {
        this.owner.selectACSuggestion(this.suggestion);
    }

    _toggleSelected() {
        this.$el.toggleClass('selected', this.index === this.owner.highlightedSubIndex);
    }

    highlight(e) {
        this.owner.setHighlightedSubIndex(this.index);
        //Stop the event from bubbling up to the query item where it causes the suggestion sub menu to be reopened, swallowing the click event
        e.stopPropagation();
    }
}
export default SuggestionSubMenuItem;
