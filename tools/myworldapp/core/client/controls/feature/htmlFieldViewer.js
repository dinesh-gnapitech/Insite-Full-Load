// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { FieldViewer } from './fieldViewer';

/**
 * Displays contents of a html field<br>
 * @name HtmlFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class HtmlFieldViewer extends FieldViewer {
    renderValue(fieldValue) {
        //  We need to determine if the value is wrapped in tags already
        if (!this._isWrappedInTags(fieldValue)) {
            fieldValue = `<div>${fieldValue}</div>`;
        }
        const parsed = $(fieldValue);
        parsed.find('iframe').remove();
        parsed.find('style').remove();
        parsed.find('script').remove();

        //we never want to replace the current page, so ensure a tags have a target of _blank
        if (parsed.is('a')) parsed.attr('target', '_blank');
        parsed.find('a').attr('target', '_blank');

        this.$el.html(parsed);
    }

    _isWrappedInTags(value) {
        //  Since jQuery is smart and will return tags if there's valid HTML, we should check manually
        //  eg. "<b>TEST</b>Test" will return as valid HTML, when it isn't
        const beginTagRegex = /^<(\w+?)\s?.*?>/;
        const endTagRegex = /<\/(\w+?)>$/;
        const beginMatches = value.match(beginTagRegex);
        const endMatches = value.match(endTagRegex);
        if (!beginMatches || !endMatches) return false;

        //  They need to be the same type, so check that here
        const beginTag = beginMatches[1];
        const endTag = endMatches[1];
        return beginTag == endTag;
    }
}

export default HtmlFieldViewer;
