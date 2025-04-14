// Copyright: IQGeo Limited 2010-2023
import Backbone from 'backbone';
import { SuggestionSubMenuItem } from 'myWorld/controls/search/suggestionSubMenuItem';

export class SuggestionSubMenu extends Backbone.View {
    static {
        this.prototype.tagName = 'ul';
        this.prototype.className = 'search-result-options hidden';
    }

    /*
     * @class Responsible for rendering the sub-menu for a query suggestion.</br>
     *        The sub-menu contains the, 'in Window', 'in Selection' and 'All' query options
     * @param  {autoCompleteResult}  options.suggestion
     * @param  {SearchControl}   options.owner
     * @param  {string}              options.isFullscreen If search suggestions list is configured to span the full screen width
     * @constructs
     * @extends {Backbone.View}
     */
    constructor(options) {
        super(options);
        this.options = options;
        this.render();
    }

    render() {
        if (this.options.isFullscreen) this.$el.addClass('sub-menu-dropdown');

        Object.entries(this.options.suggestions).forEach(([index, suggestion]) => {
            const subItem = new SuggestionSubMenuItem({
                suggestion: suggestion,
                owner: this.options.owner,
                index: index
            });
            this.$el.append(subItem.el);
        });
    }

    show(topPosition, leftPosition) {
        if (this.options.isFullscreen) {
            this.$el.show('blind');
        } else {
            this.$el.css({ top: topPosition, left: leftPosition }).show();
        }
        this.$el.children('.selected').removeClass('selected');
        this.$el.children(':first-child').addClass('selected');
        this.isVisible = true;
    }

    hide() {
        this.$el.hide();
        this.isVisible = false;
    }
}
export default SuggestionSubMenu;
