//Copyright: IQGeo Limited 2010-2020
import $ from 'jquery';
import { ImageFieldEditor } from './imageFieldEditor';
import { MapDoodleDialog } from '../mapDoodleDialog';

export class MapDoodleFieldEditor extends ImageFieldEditor {
    static {
        this.prototype.events = {
            'click .field-edit-btn': 'doDoodling',
            'click .thumb-clear': 'clear'
        };

        this.mergeOptions({
            color: '#FF0000'
        });
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        ['handleChange', 'handleDialogClose'].forEach(
            method => (this[method] = this[method].bind(this))
        );
        this.color = this.options.color;
    }

    async doDoodling(e) {
        $(e.currentTarget).prop('disabled', true);
        //If this a handheld, then hide the edit page
        if (this.owner.app.isHandheld && $('#page-edit').is(':visible')) {
            $('#page-edit').hide();
            $('#page-map').show();
        }
        //Activate the map doodle plugin
        await this.showDialog(this.imageBlob);
    }

    async showDialog(existing_doodle) {
        this.dialog = new MapDoodleDialog(this, {
            color: this.color,
            onChange: this.handleChange,
            onClose: this.handleDialogClose,
            existing_doodle: existing_doodle
        });
        //Begin doodling
        this.dialog.beginDoodling(existing_doodle);
    }

    handleChange(doodle_evt) {
        //Get the map doodle data
        let mapdoodle_data_url = doodle_evt.doodleData;

        //Assign the image source to the dummy image element and the thumbnail
        this.thumbnailImage.attr('src', mapdoodle_data_url);
        this.imageBlob = mapdoodle_data_url.replace(/^data:image\/(png|jpg|jpeg);base64,/, '');

        //Set the file size
        this.fileSizeIndicator.text(
            this.msg('image_size', {
                size: parseInt((this.imageBlob.length * 3) / 4 / 1024, 10) //image size in KB
            })
        );

        //Toggle the thumbnail.
        this.photoButton.button(); //On some occaisions the photo button hasn't been initialized. This ensure that it is
        this.toggleThumbnail(true);
        this.handleDialogClose();
        this._changed();
    }

    handleDialogClose() {
        this.dialog = null;
        //If this a handheld, then show the edit page
        if (this.owner.app.isHandheld && $('#page-map').is(':visible')) {
            $('#page-edit').show();
            $('#page-map').hide();
        }
        //Enable the update button
        this.$('.field-edit-btn').prop('disabled', false);
    }

    getValue() {
        if (this.dialog) this.doneDoodling();
        return this.imageBlob || null;
    }

    doneDoodling() {
        let doodle_canvas = this.dialog.doodleCanvas[0];
        this.dialog.close();
        //Relay the map-doodle result
        this.handleChange({
            doodleData: doodle_canvas.toDataURL()
        });
    }

    /**
     * When the editor is closed, remove() will be called. Use this to ensure that the
     * map doodle plugin dialog is closed properly.
     */
    remove() {
        //Ensure the map doodle plugin dialog is deactivated
        if (
            this.dialog &&
            this.dialog.$el.hasClass('ui-dialog-content') &&
            this.dialog.$el.dialog('isOpen')
        ) {
            //The dialog is open so close it by cancelling

            //Click the cancel button
            this.dialog.$el.parent().find('#map-doodle-cancel-btn').click();
        }
    }
}

export default MapDoodleFieldEditor;
