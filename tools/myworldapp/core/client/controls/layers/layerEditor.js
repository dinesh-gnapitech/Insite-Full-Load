// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { pick } from 'underscore';
import myw, { msg } from 'myWorld-base';
import {
    Form,
    FormComponent,
    Label,
    Dropdown,
    Input,
    Checkbox,
    RadioGroup
} from 'myWorld/uiComponents';
import TabControl from '../tabControl';
import DisplayMessage from '../displayMessage';
import { UserGroupSelector } from 'myWorld/uiComponents/form/userGroupSelector';
import { LightweightBase64Reader } from '../feature/lightweightBase64Reader';
import React, { useState } from 'react';
import { renderReactNode, Upload } from 'myWorld/uiComponents/react';

const layerScaleOptions = [...Array(31).keys()];

class UploadWrapper extends FormComponent {
    static {
        this.prototype.messageGroup = 'DefineLayerControl';
    }

    constructor(options, reactProps) {
        super(options);

        this.reactProps = { ...reactProps };
        this.msg = options.msg;

        //  Determine the max filesize (Default is 30MB)
        const defaultMaxSize = 30 * 1024 * 1024;
        const maxFileSize = options.maxFileSize;
        const matches = maxFileSize?.toString().match(/(\d*)([A-Za-z])?[Bb]?/);
        if (matches) {
            const num = parseInt(matches[1]);
            switch (matches[2]?.toLowerCase()) {
                case 'k':
                    this.maxFileSize = num * 1024;
                    break;

                case 'm':
                default:
                    this.maxFileSize = num * 1024 * 1024;
                    break;

                case 'g':
                    this.maxFileSize = num * 1024 * 1024 * 1024;
                    break;
            }
        } else {
            this.maxFileSize = defaultMaxSize;
        }
    }

    render(options) {
        const customRequest = async args => {
            const fileObj = args.file;
            const size = fileObj.size;
            if (size > this.maxFileSize) {
                args.onError(new Error(this.msg('uploaded_file_too_large')));
                return;
            }
            const lightweightReader = new LightweightBase64Reader({
                onProgress: percent => {
                    args.onProgress({ percent });
                }
            });
            const fileContents = await lightweightReader.readFile(fileObj);
            args.onSuccess(fileContents);
        };

        const Uploader = props => {
            const [disabled, setDisabled] = useState(false);
            //  Make the disable function available to outside the React element
            this.disable = () => setDisabled(true);
            return disabled ? null : (
                <Upload type="dragger" maxCount={1} customRequest={customRequest} {...props}>
                    <p>{msg(this.messageGroup, 'drag_and_drop_here')}</p>
                </Upload>
            );
        };
        const rawNode = options.parent[0];
        renderReactNode(rawNode, Uploader, this.reactProps);
    }
}

export class LayerEditor extends Form {
    static {
        this.prototype.messageGroup = 'DefineLayerControl';
        this.prototype.className = 'ui-form layer-editor-form';
        this.prototype.supportsRenderFromFile = false;

        this.mergeOptions({
            canUploadFiles: false
        });

        this.prototype.tabs = [
            {
                id: 'properties-layers-tab',
                title: '{:properties}'
            },
            {
                id: 'general-layers-tab',
                title: '{:general}'
            }
        ];
    }

    render() {
        this.generalRows = [
            {
                label: '{:visibility}:',
                components: [
                    new Label({
                        label: '{:visibility_spacer}',
                        wrap: new Dropdown({
                            name: 'min_scale',
                            type: 'number',
                            options: layerScaleOptions,
                            selected: 1,
                            cssClass: 'min-scale-select'
                        })
                    }),
                    new Dropdown({
                        name: 'max_scale',
                        type: 'number',
                        options: layerScaleOptions,
                        selected: 20
                    })
                ]
            },
            {
                name: 'transparency',
                label: '{:transparency}:',
                components: [
                    new Label({
                        label: '{:%}',
                        wrap: new Input({
                            name: 'transparency',
                            type: 'number',
                            value: 0,
                            min: 0,
                            max: 100,
                            step: 5
                        })
                    }),
                    new Label({
                        label: '{:control_item_transparency}',
                        cssClass: 'checkboxField',
                        wrap: new Checkbox({
                            name: 'control_item_transparency'
                        })
                    })
                ]
            },
            {
                name: 'sharing',
                label: '{:sharing}:',
                components: [
                    new UserGroupSelector({ system: this.options.system, name: 'sharing' })
                ]
            }
        ];

        this.$el.empty();

        this.propertiesTable = $('<table>', { class: 'layer-editor-properties' });
        this.advancedTable = $('<table>', { class: 'layer-editor-advanced' });
        this.generalTable = $('<table>', { class: 'layer-editor-general' });

        this.propertiesTabContent = $('<div>').append(this.propertiesTable);

        this.$el
            .append(this.propertiesTabContent)
            .append(this.generalTable)
            .append(this.advancedTable);

        this.$el.append('<div class="message-container"></div>'); // To show success messages and errors

        this.renderTabs();
        this.renderHeading(this.propertiesTable);
        this.renderGeneral(this.generalTable);
        this.renderAdvanced(this.advancedTable.hide());
        this.generalTable.hide();

        myw.translate(this.messageGroup, this.$el);
    }

    /**
     * Renders tabs to structure content
     */
    renderTabs() {
        const tabsDivId = 'layer-editor-tabs';
        this.$el.prepend($('<div>', { id: tabsDivId }));

        this.tabControl = new TabControl(this, {
            el: this.$(`#${tabsDivId}`),
            tabs: this.tabs,
            initialTab: this.tabs[0].id
        });

        // Add a top border to the tab buttons
        this.tabControl._tabButtons.addClass('top-bordered');
        this.tabControl.on('change', tabId => {
            this.showTabContent();
        });

        this.tabControl.tabs['properties-layers-tab'].div.css('display', 'block');
    }

    showTabContent() {
        const currentTabId = this.tabControl.currentTabId;

        switch (currentTabId) {
            case 'properties-layers-tab':
                this.generalTable.hide();
                this.advancedTable.hide();
                this.propertiesTabContent.show();
                break;
            case 'general-layers-tab':
                this.propertiesTabContent.hide();
                this.advancedTable.hide();
                this.generalTable.show();
                break;
            case 'advanced-layers-tab':
                this.generalTable.hide();
                this.propertiesTabContent.hide();
                this.advancedTable.show();
                break;
        }
    }

    renderHeading(table) {
        let rows = [];

        const dsTypeInput = new Dropdown({
            name: 'dsType',
            options: [
                { id: 'kml', label: this.msg('kml') },
                { id: 'generic_tiles', label: this.msg('generic_tiles') },
                { id: 'esri', label: this.msg('esri') },
                { id: 'ogc', label: this.msg('ogc') },
                { id: 'dxf', label: this.msg('dxf') }
            ],
            selected: this.options.dsType,
            onChange: () => this.options.typeChangeCallback()
        });

        const sourceInput = new RadioGroup({
            name: 'source',
            options: [
                { id: 'url', label: this.msg('url') },
                { id: 'feature', label: this.msg('file') }
            ],
            selected: this.options.source,
            onChange: () => this.options.sourceChangeCallback()
        });

        const nameOptions = { name: 'name', size: '40' };
        if (this.options.id)
            Object.assign(nameOptions, { cssClass: 'disabled-input', disabled: 'disabled' });

        rows = [
            {
                label: '{:owner}:',
                components: [
                    new Input({
                        name: 'owner',
                        cssClass: 'disabled-input',
                        disabled: 'disabled'
                    })
                ]
            },
            {
                label: '{:name}:',
                components: [new Input({ ...nameOptions })]
            },
            {
                label: '{:dsType}:',
                components: [dsTypeInput]
            }
        ];

        if (this.options.canUploadFiles && this.supportsRenderFromFile) {
            rows.push({
                label: '{:source}:',
                components: [sourceInput]
            });
        }

        if (this.options.source == 'feature') {
            const maxFileSize =
                this.options.system.settings['core.privateLayerSettings']?.[
                    'attachmentMaxFileSize'
                ];
            rows.push({
                label: '{:file}:',
                components: [
                    new UploadWrapper(
                        { maxFileSize, msg: this.msg, name: 'feature', cssClass: 'block' },
                        {
                            onChange: evt => this.onFileChange(evt)
                        }
                    )
                ]
            });
        } else {
            rows.push({
                label: '{:url}:',
                components: [
                    new Input({
                        name: 'url',
                        cssClass: 'block',
                        onChange: () => this.onUrlChange()
                    })
                ]
            });
        }
        this._renderRows(table, rows);
        if (!this.options.id) this.setValue('owner', myw.currentUser.username);
    }

    renderGeneral(table) {
        this._renderRows(table, this.generalRows);
    }

    renderAdvanced(table) {}

    setValuesFrom(layerDef) {
        const values = this.layerDefToFormValues(layerDef);
        this.setValues(values);
    }

    getLayerDef() {
        return this.formValuesToLayerDef(this.getValues());
    }

    disable() {
        Object.values(this.formInputs).forEach(formInput => {
            //  Calls handler for React-based inputs
            if (formInput.disable) {
                formInput.disable();
            } else {
                formInput.addAttribute('disabled', true);
                formInput.$el
                    .find('.ui-input, .ui-select, input')
                    .attr('disabled', true)
                    .addClass('disabled-input');
            }
        });
    }

    formValuesToLayerDef(formValues) {
        const names = [
            'name',
            'url',
            'source',
            'min_scale',
            'max_scale',
            'control_item_transparency'
        ].concat(this.generalRows.map(row => row.name));
        const def = {
            ...pick(formValues, names),
            datasource_spec: {
                type: formValues.dsType
            }
        };
        this._applyWidgetControlsToDef(def, formValues);
        return def;
    }

    layerDefToFormValues(layerDef) {
        let ds = layerDef.datasource_spec;
        let def = {
            dsType: ds.type,
            source: ds.source ?? 'url',
            ...layerDef,
            ...ds
        };
        this._applyWidgetControlsToFormValues(def, layerDef);
        return def;
    }

    //to be subclassed
    onUrlChange() {}

    async onFileChange(evt) {
        if (evt.file.status == 'done') {
            const fileObj = evt.file.originFileObj;
            const { name, size, lastModified, type } = fileObj;
            this.setValue('feature', {
                name,
                size: parseInt(size / 1024),
                mime_type: type,
                last_modified: lastModified,
                content_base64: evt.file.response
            });
        } else if (evt.file.status == 'removed') {
            this.setValue('feature', null);
        }
    }

    _applyWidgetControlsToFormValues(def, layerDef) {
        const legendWidgets = ['EsriLegendLayerControlWidget', 'OgcLegendLayerControlWidget'];
        const genericWidgets = ['TransparencyLayerControlWidget'];
        const classes = (layerDef.control_item_class || '')
            .replace('[', '')
            .replace(']', '')
            .split(',');
        let control_item_legend = false;
        let control_item_transparency = false;

        classes.forEach(namespace => {
            if (!control_item_legend && legendWidgets.includes(namespace))
                control_item_legend = true;
            if (!control_item_transparency && genericWidgets.includes(namespace))
                control_item_transparency = true;
        });
        def.control_item_legend = control_item_legend;
        def.control_item_transparency = control_item_transparency;
    }

    _applyWidgetControlsToDef(def, formValues) {
        const { control_item_legend, control_item_transparency, dsType } = formValues;
        if (undefined === control_item_legend && undefined === control_item_transparency) return;

        let path = [];
        switch (dsType) {
            case 'esri':
                if (control_item_legend) path.push('EsriLegendLayerControlWidget');
                break;
            case 'ogc':
                if (control_item_legend) path.push('OgcLegendLayerControlWidget');
                break;
        }
        if (control_item_transparency) path.push('TransparencyLayerControlWidget');
        //replace the boolean fields with the control_item_class array
        def.control_item_class = `[${path.toString()}]`;
        delete def.control_item_legend;
        delete def.control_item_transparency;
    }

    displayMessage(message, type) {
        new DisplayMessage({ el: this.$('.message-container'), type: type, message: message });
    }

    validate(def) {
        return { isValid: true };
    }
}

myw.layerEditors = {};

export default LayerEditor;
