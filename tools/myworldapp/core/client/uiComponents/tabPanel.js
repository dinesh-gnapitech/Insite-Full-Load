// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';

import View from 'myWorld/base/view';

export class TabPanel extends View {
    static {
        this.prototype.className = 'tab-panel';

        this.prototype.events = {
            'click .tab-title': '_tabSelection'
        };
    }

    constructor(options) {
        super(options);
        this.render();
    }

    render() {
        const tabs = this.options.tabs;

        this.$el.empty();

        tabs.forEach((tab, i) => {
            const active = i == this.options.selected ? 'selected' : '';
            this.$el.append(`<span class="tab-title ${active}" data-id="${i}">${tab.title}</span>`);
        });

        tabs.forEach((tab, i) => {
            const active = i == this.options.selected ? 'selected' : '';
            const pane = $('<div/>', { class: `tab-pane ${active}`, 'data-id': i }).append(
                tab.pane.$el || ''
            );
            this.$el.append(pane);
        });
    }

    _tabSelection(ev) {
        this.setSelectedTab($(ev.target).data('id'));
        this.options.app.fire(`${this.options.name || 'tabPanel'}-activeTab`, {
            id: $(ev.target).data('id')
        });
    }

    setSelectedTab(index) {
        this.options.selected = index;
        this.$el.find('.tab-title.selected').removeClass('selected');
        this.$el.find('.tab-pane.selected').removeClass('selected');
        this.$el.find(`.tab-title[data-id="${index}"]`).addClass('selected');
        this.$el.find(`.tab-pane[data-id="${index}"]`).addClass('selected');
    }

    getSelectedTabId() {
        return this.options.selected;
    }
}
export default TabPanel;
