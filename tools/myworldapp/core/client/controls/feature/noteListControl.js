// Copyright: IQGeo Limited 2010-2023
import { escape } from 'underscore';
import { FeatureListControl, FeatureListItem } from './featureListControl';

class NoteListControl extends FeatureListControl {
    /**
     * @class Displays a list of note features<br>
     * @param  {Plugin}   owner   Owner of self
     * @constructs
     * @extends {FeatureListControl}
     */
    // ENH: Provide a way to pass options to list item class and remove this
    constructor(owner, options) {
        super(owner, options);
        this.itemClass = NoteFeatureListItem;
    }
}

export default NoteListControl;

class NoteFeatureListItem extends FeatureListItem {
    static {
        this.prototype.className = 'feature-list-item';
    }

    /**
     * Build list item
     */
    async render() {
        const title = escape(this.feature.properties.title || '');
        const details = escape(this.feature.properties.details || '');

        let text = `<span class=feature-list-item-title>${title}</span>`;
        if (details) text += `<span class=feature-list-item-desc> ${details} </span>`;
        text = `<div> ${text} </div>`;

        this.$el.html(text);
    }
}
