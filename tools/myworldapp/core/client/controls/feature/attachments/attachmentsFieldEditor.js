// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import AttachmentsDialog from './attachmentsDialog';
import { readImageFileData } from '../imageUtils.js';
import { LightweightBase64Reader } from '../lightweightBase64Reader';
import FieldEditor from '../fieldEditor';
import SubFeatureEditor from '../subFeatureEditor';
import { getAttachmentDD } from './attachmentsUtils';

export class AttachmentsFieldEditor extends FieldEditor {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'image-doc-input';

        this.prototype.events = {
            'click .field-edit-btn': 'showAttachmentsDialog'
        };
    }

    /**
     * @class Shows a button that opens a dialog to manage attachments (related features storing images or files) <br/>
     *        To be applied on calculated reference set fields.
     *        Expects the referenced features to have an image field, a file field or both.
     *        If a field named 'filename' or 'name' exists, when a file is uploaded, the file's name will be set as the value for this field
     *        Expects the referenced features to have a geometry field which will be set to the same value as that of owner (the feature being edited)
     * @constructs
     * @extends {FieldEditor}
     */
    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        $('<button/>', { class: 'field-edit-btn' })
            .text(this.msg('add_update'))
            .button()
            .appendTo(this.$el);

        this.attachments = []; //Used for the attachments in the dialog
        this._resetData(); //this.dataChanges is used to track attachment inserts/updates/deletes

        this._asyncInit();
    }

    async _asyncInit() {
        if (!this.feature.isNew) {
            this.attachments = await this.feature.followRelationship(this.fieldDD.internal_name, {
                includeLobs: true
            });
        }
    }

    getAttachmentDD() {
        if (!this._attachmentDDPromise)
            this._attachmentDDPromise = getAttachmentDD(this.fieldDD, this.app.database);
        return this._attachmentDDPromise;
    }

    _resetData() {
        this.dataChanges = {
            insert: {},
            update: {},
            delete: {}
        };
    }

    async showAttachmentsDialog() {
        const { imageFieldDD, docFieldDD } = await this.getAttachmentDD();
        const type = this.options.type ?? (docFieldDD ? 'list' : 'wall');
        this.dialog = new AttachmentsDialog(this, {
            title: this.fieldDD.external_name,
            fieldDD: this.fieldDD,
            cancelChanges: this.cancelChanges.bind(this),
            attachments: this.attachments,
            imageFieldDD,
            docFieldDD,
            type,
            isEditor: true
        });
    }

    // -------------------------------------------------------------------------
    //                                 Add Image
    // -------------------------------------------------------------------------

    /**
     * Creates an attachment feature record (detached) for a given image file
     * @param {File} file
     * @Return {attachmentInfo}
     */
    async addImageFile(file) {
        const { imageFieldDD } = await this.getAttachmentDD();

        const imageData = await readImageFileData(file, imageFieldDD);

        return this.addImage(imageData, file.name ?? '');
    }

    /**
     * Creates an attachment feature record (detached) for a given image
     * @param {ImageData} imageData
     * @param {string} fileName
     * @Return {attachmentInfo}
     */
    async addImage(imageData, fileName = '') {
        const { imageFieldDD, filenameFieldDD } = await this.getAttachmentDD();
        const detFeature = await this.createAttachmentFeature();

        const filenameField = filenameFieldDD?.internal_name;
        if (filenameField) detFeature.properties[filenameField] = fileName;
        detFeature.properties[imageFieldDD.internal_name] = imageData.base64;

        const newId = 'new' + (Object.entries(this.dataChanges.insert).length + 1);
        detFeature.uid = newId;

        const data = {
            isNew: true,
            category: 'photo',
            id: newId,
            name: fileName,
            type: detFeature.getType(),
            feature: detFeature
        };

        this.dataChanges.insert[newId] = detFeature;
        this.attachments.push(detFeature);
        return data; //Used when we take a photo
    }

    async createAttachmentFeature() {
        const { featureType, ownerFieldName } = await this.getAttachmentDD();
        const detFeature = await this.app.database.createDetachedFeature(featureType);
        if (!this.feature.isNew) {
            detFeature.properties[ownerFieldName] = this.feature.getUrn();
        }
        detFeature.geometry = this.feature.geometry;
        return detFeature;
    }

    // -------------------------------------------------------------------------
    //                                 ADD DOCUMENT
    // -------------------------------------------------------------------------

    /**
     * Allow user to upload document and creates new detached photo record
     */
    async addDocument(file) {
        const { docFieldDD, filenameFieldDD } = await this.getAttachmentDD();
        const detFeature = await this.createAttachmentFeature();

        const { name, size, lastModified, type } = file;
        this.fileLimit =
            parseInt(docFieldDD.type.replace('file(', '').replace(')', '')) || Infinity;
        try {
            const sizeInKb = parseInt(size / 1024);
            if (sizeInKb > this.fileLimit) {
                this.error = this.msg('file_size_error', {
                    size: sizeInKb,
                    max_size: this.fileLimit
                });
                return;
            }
            const lightweightReader = new LightweightBase64Reader();
            const fileContents = await lightweightReader.readFile(file);
            const docContents = {
                name,
                size: sizeInKb,
                mime_type: type,
                last_modified: lastModified,
                content_base64: fileContents
            };

            // This is used by the file field viewer
            detFeature.displayValues = {};
            detFeature.displayValues[docFieldDD.internal_name] = `${file.name} (${file.size}KB)`;

            // Get some metadata
            const fileName = file.name || '';

            detFeature.properties[docFieldDD.internal_name] = docContents;
            const filenameField = filenameFieldDD?.internal_name;
            if (filenameField) detFeature.properties[filenameField] = fileName;

            const newId = file.uid || 'new' + (Object.entries(this.dataChanges.insert).length + 1);
            detFeature.uid = newId;

            this.dataChanges.insert[newId] = detFeature;
            this.attachments.push(detFeature);
        } catch (e) {
            console.warn(`Error processing the file '${e.stack}`);
        }
    }

    // -------------------------------------------------------------------------
    //                                 DELETE ATTACHMENT
    // -------------------------------------------------------------------------
    handleAttachmentDelete(file) {
        if (file.uid in this.dataChanges.insert) {
            delete this.dataChanges.insert[file.uid];
        } else {
            this.dataChanges.delete[file.uid] = file.feature;
        }
        const deletedFeature = file.feature;
        //Update the attachments in the dialog
        this.attachments = this.attachments.filter(att => {
            if (deletedFeature?.id) {
                return att.id !== deletedFeature.id;
            } else if (deletedFeature?.uid) {
                //The newly added attachments have a uid
                return att.uid !== deletedFeature.uid;
            } else {
                return att.uid !== file.uid; //For new features
            }
        });
    }

    // -------------------------------------------------------------------------
    //                                 EDIT ATTACHMENT
    // -------------------------------------------------------------------------
    async editFileProps(file) {
        if (file.feature) {
            //Edit the existing feature
            this._createEditorFor(file.feature);
        } else {
            this._createEditorFor(this.dataChanges.insert[file.uid]);
        }
    }

    async _createEditorFor(feature) {
        const { ownerFieldName, imageFieldDD, docFieldDD } = await this.getAttachmentDD();
        this.editor = new SubFeatureEditor(this, {
            feature: feature,
            excludeFields: [imageFieldDD?.internal_name, docFieldDD?.internal_name, ownerFieldName],
            handleOk: this.handleAttachmentUpdate.bind(this)
        });
    }

    handleAttachmentUpdate(attachment) {
        //Update the attachments
        let isNew = true;
        this.attachments.forEach(att => {
            if (att.id === attachment.properties.id) {
                att.properties = attachment.properties;
                isNew = false;
                //Add it to dataChanges.update
                this.dataChanges.update[attachment.properties.id] = attachment;
            }
        });
        if (isNew) {
            //Update the dataChanges.insert
            Object.keys(this.dataChanges.insert).forEach(id => {
                if (id === attachment.uid) {
                    //Add it to dataChanges.update
                    this.dataChanges.insert[id] = attachment;
                }
            });
        }
        this.dialog?.renderAttachmentContent(this.attachments, attachment.properties);
    }

    // -------------------------------------------------------------------------
    //                                 DATA
    // -------------------------------------------------------------------------

    cancelChanges() {
        this._resetData();
    }

    getValue() {
        const inserts = [];
        const updates = [];
        const deletions = [];
        Object.values(this.dataChanges.insert).forEach(entry => {
            inserts.push(entry);
        });
        Object.values(this.dataChanges.update).forEach(entry => {
            updates.push(entry);
        });
        Object.values(this.dataChanges.delete).forEach(entry => {
            deletions.push(entry);
        });
        return { inserts, updates, deletions };
    }
}

export default AttachmentsFieldEditor;
