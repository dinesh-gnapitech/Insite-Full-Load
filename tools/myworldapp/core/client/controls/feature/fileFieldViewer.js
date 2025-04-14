// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { FieldViewer } from './fieldViewer';
import { b64toBlob } from 'myWorld/base/util';

/**
 * Displays a download link for file fields
 * @name FileFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class FileFieldViewer extends FieldViewer {
    static {
        this.prototype.tagName = 'div';
        this.prototype.messageGroup = 'FileFieldEditor';
    }

    render() {
        const displayValue = this.feature.displayValues[this.fieldName];

        if (!displayValue) return;

        const template = $('<a/>', {
            style: 'cursor:pointer;',
            html: displayValue,
            click: e => {
                e.preventDefault();
                this.beginDownload();
            }
        }).addClass('relationship');
        this.$el.html(template);
    }

    /**
     * Request lobs and then being download process
     * ENH:This is will cause a heavy request of getting all lobs
     */
    async beginDownload() {
        await this.feature.ensure('lobs');
        const { name, mime_type, content_base64 } = this.feature.properties[this.fieldName];
        this.app.system.executeBlobDownload(
            b64toBlob(content_base64, mime_type, 512),
            name,
            mime_type
        );
    }
}

export default FileFieldViewer;
