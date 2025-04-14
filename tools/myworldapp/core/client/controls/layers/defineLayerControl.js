// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-base';
import 'jquery-ui';
import 'jquery-ui-touch-punch';
import { toLatLng } from 'myWorld/base/proj';
import { ReadOnlyMode } from 'myWorld/map/readOnlyMode';
import { Dialog } from 'myWorld/uiComponents';
import { latLngBounds, RequestTooLargeError } from 'myWorld-base';
import privateLayerImg from 'images/layers/private_layer.svg';

export class DefineLayerControl extends Dialog {
    static {
        this.prototype.events = {
            'keyup .text-layer-search': 'filterLayers'
        };

        this.mergeOptions({
            modal: true,
            autoOpen: true,
            width: 520,
            height: 'auto',
            resizable: true,
            position: { my: 'center', at: 'top+160', of: window, collision: 'fit' },
            title: '{:define_layer_title}',
            open(event, ui) {
                $(this).find('.text-layer-search').blur();
            }
        });
    }

    /**
     * @class Dialog for users to define a new layer
     * @constructs
     * @extends {Control}
     */
    constructor(layerManager, options) {
        const id = options.layerDef?.id ?? null;
        const isOwner = !options.layerDef || options.layerDef.owner == myw.currentUser.username;
        const isNotEditable = !isOwner || myw.isNativeApp;
        const dsType = options.layerDef?.datasource_spec.type ?? 'kml';
        const buttons = DefineLayerControl.getButtons({ id, layerManager, isNotEditable, dsType });
        //These extra options are required by the getButtons call later on
        const extraOptions = { id, layerManager, isNotEditable, dsType, buttons };
        super({ ...options, ...extraOptions });

        this.isNotEditable = isNotEditable;
        this.layerManager = layerManager;
        this.dsType = dsType;
        this.source = options.layerDef?.source ?? 'url';
        this.id = id;
    }

    static getButtons({ id, layerManager, isNotEditable, dsType }) {
        const buttons = {
            Cancel: {
                text: '{:cancel_btn}',
                class: 'right',
                click() {
                    this.close();
                }
            },
            Delete: {
                text: '{:delete_btn}',
                click() {
                    this.deleteLayerDefinition();
                }
            },
            GoTo: {
                text: '{:go_to_layer_btn}',
                click() {
                    this.gotoLayer();
                }
            },
            Preview: {
                text: '{:preview_layer_btn}',
                click() {
                    this.previewLayer();
                }
            },
            Save: {
                text: '{:save_layer_btn}',
                class: 'primary-btn',
                click() {
                    this.saveLayerDefinition();
                }
            }
        };
        if (!id) {
            delete buttons['Delete'];
            delete buttons['GoTo'];
        } else {
            delete buttons['Preview'];
            const layer = layerManager.getLayer(id);
            if (!layer?.maplibLayer) delete buttons['GoTo'];
        }
        if (isNotEditable) {
            delete buttons['Save'];
            delete buttons['Delete'];
            delete buttons['Preview'];
        }
        if (!['kml', 'dxf'].includes(dsType)) {
            delete buttons['GoTo'];
        }
        return buttons;
    }

    render() {
        //build UI
        const maxHeight = $(window).height() - 100;
        this.options.maxHeight = maxHeight;
        if (!this.dsType) return; //will be called later
        this.form = this.createForm();
        const layerDef = this.options.layerDef;
        if (layerDef) {
            this.form.setValuesFrom(layerDef);
            this.options.title = `${this.msg('edit_layer_title')} ${layerDef.name}`;
        }
        this.options.contents = this.form.el;

        if (this.isNotEditable) this.form.disable();

        super.render();
        this.translate(this.$el);
    }

    createForm() {
        const LayerEditor = myw.layerEditors[this.dsType];
        if (!LayerEditor) throw new Error(`No class for datasource type: ${this.dsType}`);

        return new LayerEditor({
            id: this.id,
            system: this.layerManager.system,
            typeChangeCallback: this._checkForTypeChange.bind(this),
            sourceChangeCallback: this._checkForSourceChange.bind(this),
            dsType: this.dsType,
            source: this.source,
            canUploadFiles: this.options.canUploadFiles
        });
    }

    getLayerDef() {
        const def = this.form.getLayerDef();
        Object.assign(def, {
            category: 'overlay',
            id: this.id,
            thumbnail: privateLayerImg
        });
        return def;
    }

    async saveLayerDefinition() {
        const def = this.getLayerDef();

        const validityObj = await this.validate(def);
        if (!validityObj.isValid) {
            this.form.displayMessage(this.msg(validityObj.msg), 'error');
            return;
        }

        this.form.displayMessage(this.msg('saving'), 'alert');
        try {
            const newDef = await this.layerManager.savePrivateLayerDef(def);
            //make it available for the add layer control
            this.form.displayMessage(this.msg('saved'));
            setTimeout(() => {
                this.close();
                this.options.onChangeCallback?.call(undefined, newDef);
            }, 1000);
        } catch (reason) {
            if (reason instanceof RequestTooLargeError) {
                this.form.displayMessage(this.msg('uploaded_file_too_large'), 'error');
            } else {
                this.form.displayMessage(this.msg('error_saving'), 'error');
            }
            console.log('Error saving new layer definition', reason);
        }
    }

    async previewLayer() {
        const layerDef = this.getLayerDef();

        const validityObj = await this.validate(layerDef);
        if (!validityObj.isValid) {
            this.form.displayMessage(this.msg(validityObj.msg), 'error');
            return;
        }

        //  Create a temporary datasource here and register it in the app
        const dsName = `${myw.currentUser.username}:${layerDef.name}`;
        const tempDatasource = {
            external_name: 'Preview',
            layerDefs: [layerDef],
            ...layerDef.datasource_spec,
            name: dsName,
            owner: myw.currentUser.username
        };

        const app = this.layerManager.app;
        app.database.saveUserDatasource(tempDatasource);

        //  Then register the layer using the datasource we just created
        layerDef.datasource = dsName;
        const layer = this.layerManager.createLayer(layerDef);
        await layer.initialized;
        const source = layer.maplibLayer.getSource();
        //  Ensure that if a file is uploaded, we set up a loader to load from that instead of from the URL
        if (layerDef.feature) {
            //  Don't make this a () => function, so that `this` will be the source that this function is sent to
            source.setLoader(function (extent, resolution, projection, success, failure) {
                try {
                    const contents = Buffer.from(
                        layerDef.feature.content_base64,
                        'base64'
                    ).toString();
                    const features = this.getFormat().readFeatures(contents);
                    this.addFeatures(features);
                    success(features);
                } catch (error) {
                    failure();
                    throw error;
                }
            });
        } else if (['kml', 'dxf'].includes(this.dsType)) {
            source.setUrl(layerDef.relativeUrl);
        }

        if (['kml', 'dxf'].includes(this.dsType)) {
            source.once('featuresloadend', event => this._enablePreview(event, layer));
            source.once('featuresloaderror', event => this._showPreviewError(event, layer));
            app.map.addLayer(layer);
        } else {
            app.map.addLayer(layer);
            this._enablePreview(null, layer);
        }
    }

    _enablePreview(event, layer) {
        const app = this.layerManager.app;
        const mapView = app.map.getView();
        const oldViewProps = mapView.getProperties();
        app.map.setInteractionMode(new ReadOnlyMode(app.map));

        //  We are assuming event is null for tile layers. So if that's the case, we can't zoom to the bounds
        if (event) {
            const features = event.features;
            this.setMapBoundsToFeatures(features);
        }
        this.close({
            forceDestroy: false
        });
        this.options.owner?.close({
            forceDestroy: false
        });

        //  Create preview dialog
        const self = this;
        new Dialog({
            title: this.msg('preview_title'),
            contents: this.msg('preview_message', {
                name: layer.layerDef.name
            }),
            destroyOnClose: true,
            modal: false,
            buttons: {
                Close: {
                    text: this.msg('close_btn'),
                    click() {
                        this.close();
                        self.options.owner?.open();
                        self.open();
                        app.map.endCurrentInteractionMode();

                        //  Restore old view
                        mapView.setProperties(oldViewProps);
                        self._unregisterLayer(layer);
                    }
                }
            }
        });
    }

    _showPreviewError(event, layer) {
        const self = this;
        new Dialog({
            title: this.msg('preview_error_title'),
            contents: this.msg('preview_error_message'),
            destroyOnClose: true,
            buttons: {
                OK: {
                    text: this.msg('ok_btn'),
                    click() {
                        this.close();
                        self._unregisterLayer(layer);
                    }
                }
            }
        });
    }

    _unregisterLayer(layer) {
        const app = this.layerManager.app;

        app.map.removeLayer(layer);
        app.database.removeUserDatasource(layer.datasource.name);
    }

    gotoLayer() {
        const layer = this.layerManager.getLayer(this.id);
        const source = layer.maplibLayer.getSource();
        this.setMapBoundsToFeatures(source.getFeatures());
    }

    setMapBoundsToFeatures(features) {
        const app = this.layerManager.app;
        const featureBounds = features
            .map(feature => {
                try {
                    const geometry = feature.getGeometry();
                    const bbox = myw.geometry(geometry).bbox();
                    return latLngBounds(toLatLng([bbox[0], bbox[1]]), toLatLng([bbox[2], bbox[3]]));
                } catch (error) {
                    return null;
                }
            })
            .filter(bound => bound);
        app.map.fitBoundsToBoundsList(featureBounds);
    }

    async validate(def) {
        this.$el.find('.validationHighlight').removeClass('validationHighlight');

        if (!this.id) {
            //Creating a new layer
            const layerName = def.name;
            if (!layerName.length) {
                this.$("input[name='name']").addClass('validationHighlight');
                return { isValid: false, msg: 'blank_name_error' };
            }

            const id = `${myw.currentUser.username}:${layerName}`;
            //ENH: Get a fresh set of layers from the database to accurately validate
            const layers = await this.layerManager.getAvailableLayers();
            const existingNames = layers.map(layer => layer.id);
            if (existingNames.includes(id)) {
                this.$("input[name='name']").addClass('validationHighlight');
                return { isValid: false, msg: 'duplicate_name_error' };
            }
        }
        const transparency = def.transparency;
        if (!transparency && transparency !== 0) {
            this.$("input[name='transparency']").addClass('validationHighlight');
            return { isValid: false, msg: 'blank_transparency_error' };
        }
        if (isNaN(transparency) || transparency < 0 || transparency > 100) {
            this.$("input[name='transparency']").addClass('validationHighlight');
            return { isValid: false, msg: 'invalid_percent_value' };
        }
        return this.form.validate(def);
    }

    deleteLayerDefinition() {
        const self = this;
        new Dialog({
            title: this.msg('confirm_delete_title'),
            contents: this.msg('confirm_delete_message'),
            destroyOnClose: true,
            buttons: {
                Cancel: {
                    text: this.msg('cancel_btn'),
                    class: 'right',
                    click() {
                        this.close();
                    }
                },
                OK: {
                    text: this.msg('delete_btn'),
                    class: 'dangerous-btn primary-btn',
                    click() {
                        this.close();
                        self._confirmedDelete();
                    }
                }
            }
        });
    }

    async _confirmedDelete() {
        const isDeleted = await this.layerManager.deletePrivateLayerDef(this.id).catch(err => {
            this.form.displayMessage(
                this.msg('not_deleted', { title: this.options.title }),
                'error'
            );
        });

        if (isDeleted) {
            this.form.displayMessage(this.msg('deleted', { title: this.options.title }));
            setTimeout(() => {
                this.close();
                this.options.onChangeCallback?.call(undefined, null);
            }, 1000);
        }
    }

    async _checkForTypeChange() {
        const currentDsType = this.form.getValue('dsType');
        const changed = this.dsType != currentDsType;
        if (changed) {
            this.dsType = currentDsType;
            if (!myw.layerEditors[currentDsType].prototype.supportsRenderFromFile) {
                this.source = 'url';
            }
            const buttons = DefineLayerControl.getButtons(this.options);
            this.setButtons(buttons);
            await this._rerenderForm();
        }
    }

    async _checkForSourceChange() {
        const currentSourceType = this.form.getValue('source');
        const changed = this.source != currentSourceType;
        if (changed) {
            this.source = currentSourceType;
            await this._rerenderForm();
        }
    }

    async _rerenderForm() {
        const values = this.form.getValues();
        await this.render();
        this.form.setValues(values);
    }
}

export default DefineLayerControl;
