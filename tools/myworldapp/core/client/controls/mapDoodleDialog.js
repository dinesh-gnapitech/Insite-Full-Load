//Copyright: IQGeo Limited 2010-2020
import $ from 'jquery';
import { template } from 'underscore';
import { Dialog } from 'myWorld/uiComponents/dialog';
import { getImageFormatFor } from 'myWorld/base/util';
import { CanvasDoodleManager } from './canvasDoodleManager';
import loadingImg from 'images/loading.svg';

export class MapDoodleDialog extends Dialog {
    static {
        /*
         * This HTML will be used to build the structure of the control
         */
        this.prototype.template = template(
            `<div class="map-doodle-container">
                <span>{:color}</span>
                <input class="map-doodle-color-picker" type="color" />
            </div>`
        );

        this.mergeOptions({
            modal: false,
            width: 250,
            autoOpen: false,
            resizable: false,
            title: '{:map_doodle_dialog_title}',
            closeText: '{:close_tooltip}',
            destroyOnClose: true,
            classes: { 'ui-dialog': 'doodle-color-picker-dialog' },
            open: function () {
                //Hide close button force the use of the cancel button
                $(this).parent().children().children('.ui-dialog-titlebar-close').hide();
            }
        });

        /**
         * Adds buttons to results list and to the {@link DetailsControl}
         * @param  {Application} owner  The application
         * @constructs
         * @extends {Plugin}
         */
        this.prototype.events = {};
    }

    /**
     * @param  {MeasureToolPlugin}     owner          Measure tool plugin
     * @param  {object}  options
     * @param  {string}                    options.divId    Id to be assigned to the dialog
     * @param  {string}                    options.onChange Finished drawing handler
     * @param  {string}                    options.onClose  Doodle close handler
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(options);

        this.owner = owner;
        this.color = options.color;
        this.setColor = options.setColor;

        this.map = this._getMapToDoodleOn();
        this.mapId = this.map.options.target;

        if (options.existing_doodle)
            this.options.position = {
                my: 'right top',
                at: 'right top',
                of: `.doodle-update-dialog`
            };
        else this.options.position = { my: 'right top', at: 'right top', of: `#${this.mapId}` };

        //Set the action buttons
        this.options.buttons = {
            Cancel: {
                id: 'map-doodle-cancel-btn',
                text: this.msg('cancel'),
                click: () => {
                    this.options.onClose(); //Relay the map-doodle cancel
                    this.close(); //Close the control
                }
            },
            Done: {
                id: 'map-doodle-done-btn',
                text: this.msg('done'),
                class: 'primary-btn',
                click: () => {
                    this.doneDoodling(); //Close the control
                }
            }
        };
        this.render();
    }

    /**
     * If the internals plugin is displaying an expanded map in the map view, return that as the map to doodle on
     * Otherwise returns the geo map
     * @returns {MapControl}
     */
    _getMapToDoodleOn() {
        if (this.app.plugins.internals) {
            const internalMap = this.app.plugins.internals?.getMaps()[0];

            if (internalMap && $(`#${internalMap.options.target}`).is(':visible')) {
                return internalMap;
            }
        }
        if ($(`#${this.app.map.options.target}`).is(':visible')) return this.app.map;
    }

    render() {
        //Compile the HTML template
        this.options.contents = this.template();

        //Render this dialog
        super.render();

        //Add the last saved color to the picker (color persistence only works for the plugin)
        //The field editor always sets it to the default color
        this.$('.map-doodle-color-picker').val(this.color);

        this.translate(this.$el);
    }

    open() {
        //Display the doodle canvas
        this.doodleCanvas?.show();
        if (this.options.existing_doodle) this.displayUpdateDoodleDialog(this.doodleCanvas);
        else this.doodleCanvas?.offset($(`#${this.mapId}`).offset()); //Place the canvas directly over the map

        super.open();
    }

    /*
     * Displays an existing doodle in a pop-up dialog
     */
    displayUpdateDoodleDialog() {
        this.doodleCanvas.dialog({
            width: 'auto',
            classes: { 'ui-dialog': 'doodle-update-dialog' },
            modal: true,
            open: function () {
                //Hide close button force the use of the cancel button
                $(this).parent().children('.ui-dialog-titlebar').hide();
            }
        });
    }

    close() {
        this.options.onClose(); //Relay the map-doodle cancel
        //Remove the drawing canvas
        if (this.options.existing_doodle) this.doodleCanvas?.dialog('destroy');
        else this.doodleCanvas?.remove();

        super.close();
    }

    doneDoodling() {
        let doodle_canvas = this.doodleCanvas[0];

        //Relay the map-doodle result
        this.options.onChange({
            doodleData: doodle_canvas.toDataURL()
        });

        this.close(); //Close the control
    }

    /*
     * Build a doodle canvas and append the canvas to the body
     */
    _setupDoodleCanvas(width, height) {
        this.doodleCanvas = $(
            `<canvas class="map-doodle-canvas" width="${width}" height="${height}" style="display:none">`
        );
        if (!this.options.existing_doodle) this.doodleCanvas.appendTo('body');
    }

    async beginDoodling(existing_doodle) {
        if (existing_doodle) {
            await this._beginDoodlingUpdate(existing_doodle);
        } else {
            const canvasCreated = await this._beginDoodlingCreate(existing_doodle);
            if (!canvasCreated) return;
        }
        this.open();
    }

    _beginDoodlingUpdate(existing_doodle) {
        let doodle_img = new Image();
        const img_format = getImageFormatFor(existing_doodle);

        return new Promise(function (resolve, reject) {
            doodle_img.onload = resolve;

            //Set the img src to the be the doodle
            doodle_img.src = `data:image/${img_format};base64,${existing_doodle}`;
        }).then(() => {
            //Setup the doodling canvas
            this._setupDoodleCanvas(doodle_img.width, doodle_img.height);

            //Build a context to render upon
            let doodle_canvas = this.doodleCanvas[0];
            let doodle_canvas_context = doodle_canvas.getContext('2d');

            //Draw the existing doodle on the canvas
            doodle_canvas_context.drawImage(doodle_img, 0, 0, doodle_img.width, doodle_img.height);

            this._processDoodling(doodle_canvas, doodle_canvas_context);
        });
    }

    async _beginDoodlingCreate() {
        let map = $(`#${this.mapId}`);

        //Setup the doodling canvas
        this._setupDoodleCanvas(map.width(), map.height());

        this._showLoadingSpinner();

        const mapCanvasScreenshot = await this.createMapScreenshot();

        if (!this.loading) return false; // The loading has been cancelled so do not proceed

        //Build a context to render upon
        let doodle_canvas = this.doodleCanvas[0];
        let doodle_canvas_context = doodle_canvas.getContext('2d');

        //Make sure that the context is scaled properly
        doodle_canvas_context.scale(
            doodle_canvas.width / doodle_canvas.clientWidth,
            doodle_canvas.height / doodle_canvas.clientHeight
        );

        //results are ready
        this.closeLoadingSpinner();

        //Draw the map onto the doodle canvas
        doodle_canvas_context.drawImage(
            mapCanvasScreenshot,
            0,
            0,
            doodle_canvas.width,
            doodle_canvas.height
        );

        this._processDoodling(doodle_canvas, doodle_canvas_context);
        return true;
    }

    _processDoodling(doodle_canvas, doodle_canvas_context) {
        //Setup the drawing manager
        this.drawingManager = new CanvasDoodleManager(this, doodle_canvas, doodle_canvas_context, {
            color: this.color
        });

        //Process color change events
        this.$('.map-doodle-color-picker')
            .off('change')
            .on('change', e => {
                this.color = e.target.value;
                this.drawingManager.setColor(this.color);
                this.setColor?.(this.color); //Inform the plugin of the color change
            });

        //Let the user begin
        this.drawingManager.enable();
    }

    /**
     * Show a dialog with a loading icon to provide the ability to cancel the doodle canvas creation
     * @private
     */
    _showLoadingSpinner() {
        this.loading = true;
        if (!this.loadingSpinner) {
            this.loadingSpinner = $(
                `<div style="height: 40px !important"><img src="${loadingImg}" alt="${this.msg(
                    'loading_tip'
                )}" style="width: 100%; height: 40px !important"/></div>`
            ).dialog({
                modal: true,
                width: 250,
                position: this.options.position,
                resizable: false,
                title: this.msg('map_doodle_loading'),
                closeText: this.msg('close_tooltip'),
                destroyOnClose: true,
                buttons: {
                    Cancel: {
                        id: 'map-doodle-cancel-btn',
                        text: this.msg('cancel'),
                        click: () => {
                            this.options.onClose(); //Relay the map-doodle cancel
                            this.closeLoadingSpinner();
                        }
                    }
                }
            });
        } else {
            this.loadingSpinner.dialog('open');
        }
    }

    closeLoadingSpinner() {
        this.loading = false;
        this.loadingSpinner?.dialog('close');
    }

    /**
     * Takes a screenshot of the map and returns it in canvas format
     */
    async createMapScreenshot() {
        return this.map.takeScreenshot({ format: 'canvas' });
    }
}

export default MapDoodleDialog;
