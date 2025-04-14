// Copyright: IQGeo Limited 2010-2023
import { unescape } from 'underscore';
import $ from 'jquery';
import { FieldViewer } from './fieldViewer';

/**
 * Displays a html value extracted from a KML file
 * @name KmlHtmlFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class KmlHtmlFieldViewer extends FieldViewer {
    static {
        this.prototype.tagName = 'div';
    }

    render() {
        let fieldValue = this.fieldValue;
        if (!fieldValue) return undefined;

        fieldValue = unescape(fieldValue).replace('<![CDATA[', '').replace(']]>', '');

        let html = $('<div/>', { html: fieldValue });
        html.find('iframe').remove();
        html.find('style').remove();
        html.find('script').remove();
        this.$el.html(html);
    }
}

export default KmlHtmlFieldViewer;
