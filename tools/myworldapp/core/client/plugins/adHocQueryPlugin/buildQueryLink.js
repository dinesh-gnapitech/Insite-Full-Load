// Copyright: IQGeo Limited 2010-2023
import View from 'myWorld/base/view';

export class BuildQueryLink extends View {
    static {
        this.prototype.messageGroup = 'AdHocQueryPlugin';
        this.prototype.tagName = 'li';
        this.prototype.className = 'provider-title build-query-link';

        this.prototype.events = {
            click: 'createDialog'
        };
    }

    /**
     * @class A link to launch the ad-hoc query dialog
     * @param  {AdHocQueryPlugin}   owner    The ad-hoc query plugin
     * @constructs
     * @extends {View}
     */
    constructor(owner, options) {
        super();
        this.owner = owner;
        this.options = options;
        this.render();
    }

    render() {
        this.$el.html(this.msg('build_query_link'));
    }

    /**
     * Adds the html for the adHocQuery dialog in the map container
     * Hides the container
     */
    createDialog() {
        this.owner.toggleMode();
        this.options.containerClass?.toggle(false);
    }
}
