// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { StringFieldEditor } from './stringFieldEditor';
import { LightweightBase64Reader } from './lightweightBase64Reader';

/**
 * Editor for file type fields
 * @name FileFieldEditor
 * @constructor
 * @extends {StringFieldEditor}
 */
export class FileFieldEditor extends StringFieldEditor {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'file-input';

        this.prototype.events = {
            'click .thumb-clear': 'clear'
        };
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        this.fileLimit = parseInt(fieldDD.type.replace('file(', '').replace(')', '')) || Infinity;

        this.render();
    }

    render() {
        const self = this;
        this.$el.html('');
        this.fieldBlob = this.fieldValue ? this.fieldValue : {};

        const fileInput = $('<input/>', {
            type: 'file',
            style: 'display:none',
            change: async function () {
                const input = $(this)[0];
                self.error = '';
                if (input.files) {
                    const { name, size, lastModified, type } = input.files[0];

                    try {
                        const sizeInKb = parseInt(size / 1024);
                        if (sizeInKb > self.fileLimit) {
                            self.error = self.msg('file_size_error', {
                                size: sizeInKb,
                                max_size: self.fileLimit
                            });
                            self.render();
                            return;
                        }
                        const lightweightReader = new LightweightBase64Reader();
                        const fileContents = await lightweightReader.readFile(input.files[0]);
                        self.fieldValue = {
                            name,
                            size: sizeInKb,
                            mime_type: type,
                            last_modified: lastModified,
                            content_base64: fileContents
                        };
                        self.render();
                        self._changed();
                    } catch (e) {
                        console.log(e);
                    }
                }
            }
        }).appendTo(this.$el);

        $('<button/>', {
            class: 'field-edit-btn',
            style: 'display:inline-block',
            click: () => fileInput.click()
        })
            .text(this.msg(this.fieldBlob.name ? 'update_file' : 'add_file'))
            .button()
            .appendTo(this.$el);
        if (this.error) {
            $('<span/>', {
                style: 'display: inline-block, margin-top: 4px; color: rgb(220, 20, 60)',
                html: this.error
            }).appendTo(this.$el);
        }
        if (this.fieldBlob.name) {
            const { name } = this.fieldBlob;
            $('<div/>', {
                class: 'thumb-container',
                style: 'display: inline-block',
                html: `<span class="thumb-file-size">${name}</span>
                      <span class="thumb-clear"></span>`
            }).appendTo(this.$el);
        }
    }

    getValue() {
        return this.fieldValue;
    }

    /**
     * Clear field contents and render
     */
    clear() {
        if (this._isReadonly) return;

        this.fieldValue = null;
        this.render();
    }

    /**
     * Enables or disables the associated inputs to match the given readonly value
     * @param {boolean} readonly
     */
    setReadonly(readonly = false) {
        if (this._isReadonly === readonly) return;
        this._isReadonly = readonly;

        this.$el?.find('button').prop('disabled', readonly);
        this.$el?.find('.thumb-container').css('opacity', readonly ? 0.5 : 1);
    }
}

export default FileFieldEditor;
