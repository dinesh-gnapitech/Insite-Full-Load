// Copyright: IQGeo Limited 2010-2023
import { escape } from 'underscore';
import { FieldViewer } from './fieldViewer';

/**
 * Displays a link field value
 * @name LinkFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class LinkFieldViewer extends FieldViewer {
    static {
        this.prototype.tagName = 'a';
    }

    render() {
        let fieldValue = this.fieldValue;
        const nully = fieldValue === null || fieldValue === '';
        if (nully) {
            //first check if we should render the value or not
            if (this.options.renderAll) this.$el.html(`<i>${this.msg('no_reference')}`);
            return;
        }

        if (!fieldValue.includes('|')) fieldValue = `|${fieldValue}`; //allow description to be optional

        const // <description>|<url>
            regexp = /(.*)\|(\w+\:\/\/(.*))/i,
            res = regexp.exec(fieldValue),
            linkDescription = res && (res[1] || res[2]),
            url = res?.[2];

        if (res) {
            this.$el.attr('target', '_blank').attr('href', url).html(escape(linkDescription));
        } else {
            this.$el.html(this.msg('link_error', { link: escape(fieldValue) }));
        }
    }
}

export default LinkFieldViewer;
