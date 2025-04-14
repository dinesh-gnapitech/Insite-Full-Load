// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { escape } from 'underscore';
import { getAttachmentFieldDDs } from './attachmentsUtils';
import { FeatureListControl, FeatureListItem } from '../featureListControl';
import { getImageFormatFor, b64toBlob } from 'myWorld/base/util';
import documentImg from 'images/document.svg';

export class AttachmentListControl extends FeatureListControl {
    static {
        this.prototype.className = 'attachment-list';
    }

    /**
     * @class Displays a list of attachment features<br>
     * Features must be homogeneous and have some specific fields (see getAttachmentDD)
     * @param  {Plugin}   owner   Owner of self
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options = {}) {
        options = { ...options, itemClass: options.itemClass || AttachmentListItem };
        super(owner, options);
    }
}

/**
 * An attachment item in a FeatureList
 *
 * Shows thumbnail and title
 */
export class AttachmentListItem extends FeatureListItem {
    static {
        this.prototype.className = 'attachment-list-item';
    }

    events() {
        return {
            ...FeatureListItem.prototype.events,
            'click .attachment-image': 'handleShowImage',
            'click .attachment-document': 'handleDownloadDocument'
        };
    }

    constructor(options) {
        super(options);

        // Get names of special fields (here because async)
        const props = getAttachmentFieldDDs(this.feature.featureDD);
        this.imageField = props.imageFieldDD ? props.imageFieldDD.internal_name : null;
        this.docField = props.docFieldDD ? props.docFieldDD.internal_name : null;

        this.app = this.control.app;
    }

    /**
     * Build list item
     */
    async render() {
        // Create icon
        this.icon = $('<img/>', { class: 'attachment-icon' });

        // Create text area
        const title = escape(this.feature.getTitle());
        const textArea = $('<div>', { class: 'attachment-text-area' });
        this.title = $(`<a>`, { class: 'feature-list-item-title' }).html(title).appendTo(textArea);

        // Add to display
        // Note: Added using table to get long titles to wrap nicely
        const tab = $('<table/>').appendTo(this.$el);
        const tr = $('<tr/>').appendTo(tab);
        for (const item of [this.icon, textArea]) {
            const td = $('<td/>').appendTo(tr);
            item.appendTo(td);
        }

        // Launch load of data
        this.setIcon();
    }

    /**
     * Set icon indicating item type
     */
    async setIcon() {
        await this.ensureData();

        let src;
        if (this.imageFormat) {
            src = `data:image/${this.imageFormat};base64,${this.data}`;
            this.icon.addClass('attachment-image');
        } else {
            src = documentImg;
            this.icon.addClass('attachment-document');
        }
        this.icon.attr('src', src);
    }

    /**
     * Get feature's image or document into this.data (if necessary)
     */
    async ensureData() {
        if (!this.data) {
            await this.feature.ensure('lobs');

            this.data =
                this.feature.properties[this.imageField] || this.feature.properties[this.docField];

            if (this.data && !this.data.mime_type) {
                this.imageFormat = getImageFormatFor(this.data);
            }
        }
    }

    /**
     * Callback from thumbnail click
     */
    async handleShowImage(event) {
        event.stopPropagation();
        await this.ensureData();
        await this.showImage(this.data);
    }

    /**
     * Callback from document click
     */
    async handleDownloadDocument(event) {
        event.stopPropagation();
        await this.ensureData();
        await this.beginDownload(this.data);
    }

    /**
     * Display 'imageData' in a popup
     */
    // ENH: Move to application?
    async showImage(imageData) {
        const title = this.feature.getTitle();

        const imageFormat = getImageFormatFor(imageData);
        let src = `data:image/${imageFormat};base64,${imageData}`;

        const img = $('<img/>', { src: src });
        this.imageContainer = this.app.layout.displayImage(title, img); // ENH: If already visible just bring to front
    }

    /**
     * Download file object 'fileObj'
     */
    // ENH: Move to application?
    async beginDownload(fileObj) {
        const { name, mime_type, content_base64 } = fileObj;
        this.app.system.executeBlobDownload(
            b64toBlob(content_base64, mime_type, 512),
            name,
            mime_type
        );
    }
}

export class AttachmentWallControl extends AttachmentListControl {
    static {
        this.prototype.className = 'attachment-wall';
    }

    /**
     * @class Displays a list of attachment features using large icons<br>
     * Features must be homogeneous and have some specific fields (see getAttachmentDD)
     * @param  {Plugin}   owner   Owner of self
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options = {}) {
        options = { ...options, itemClass: options.itemClass || AttachmentWallItem };
        super(owner, options);
    }
}

/**
 * An attachment item in a FeatureWall
 *
 * Shows large thumbnail with title below
 */
export class AttachmentWallItem extends AttachmentListItem {
    static {
        this.prototype.className = 'attachment-wall-item';
    }

    /**
     * Build item
     */
    async render() {
        // Add icon
        this.icon = $('<img/>', { class: 'attachment-icon' }).appendTo(this.$el);
        this.icon.attr('layout', this.options.layout || 'wall');

        // Add title
        const title = escape(this.feature.getTitle());
        const textArea = $('<div>', { class: 'attachment-text-area' }).appendTo(this.$el);
        this.title = $(`<a>`, { class: 'feature-list-item-title' }).appendTo(textArea);
        this.title.html(title);

        // Launch load of data
        this.setIcon();
    }
}
