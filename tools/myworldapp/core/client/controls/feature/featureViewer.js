// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import featureViewerHtml from 'text!html/featureViewer.html';
import { translate } from 'myWorld/base';
import { Util } from 'myWorld/base';
import { Separator } from 'myWorld/uiComponents';
import { Control } from 'myWorld/base/control';
import { FieldViewer } from './fieldViewer';
import { ReferenceFieldViewer } from './referenceFieldViewer';
import { ReferenceSetFieldViewer } from './referenceSetFieldViewer';
import { DateFieldViewer } from './dateFieldViewer';
import { TimeFieldViewer } from './timeFieldViewer';
import { LinkFieldViewer } from './linkFieldViewer';
import { ImageFieldViewer } from './imageFieldViewer';
import { FileFieldViewer } from './fileFieldViewer';
import { NumberFieldViewer } from './numberFieldViewer';
import { KmlHtmlFieldViewer } from './kmlHtmlFieldViewer';
import { BooleanFieldViewer } from './booleanFieldViewer';
import ResizableGridMixin from './resizableGridMixin';
import collapsedImg from 'images/collapsed.svg';
import expandedImg from 'images/expanded.svg';

//get the templates from the html file
const elems = $(featureViewerHtml),
    attrListHtml = elems.filter('#attributes-list-template').html();

export class FeatureViewer extends Control {
    static {
        this.include(ResizableGridMixin);
        this.prototype.template = template(featureViewerHtml);
        this.prototype.attributeListTemplate = template(attrListHtml);

        this.mergeOptions({
            state: {
                //state is shared across instances (this object is instantiated only when the class is defined)
                attributeDisplayMode: 'medium',
                collapsed: false
            }
        });

        this.prototype.events = {
            'click .panel-header': 'toggleDetails',
            'click .toggle-defaults.collapse': 'hideDefaultAttributes',
            'click .toggle-defaults:not(".collapse")': 'showDefaultAttributes'
        };

        this.prototype.fieldViewerMapping = {
            reference: ReferenceFieldViewer,
            reference_set: ReferenceSetFieldViewer,
            foreign_key: ReferenceFieldViewer,
            date: DateFieldViewer,
            timestamp: TimeFieldViewer,
            integer: NumberFieldViewer,
            double: NumberFieldViewer,
            numeric: NumberFieldViewer,
            link: LinkFieldViewer,
            image: ImageFieldViewer,
            file: FileFieldViewer,
            kml_html: KmlHtmlFieldViewer,
            boolean: BooleanFieldViewer,
            default: FieldViewer
        };
    }

    /**
     * @class A UI control to visualize a feature's details <br/>
     *        Used by DetailsControl. <br/>
     *        Displaying of feature details is customizable by registering plugins with the pluginIds parameter. See {@link DetailsControl} <br/>
     *        Another way to customize behaviour is by creating a subclass and using it as the
     *        'featureViewer' in the corresponding feature model class. <br/>
     *        Field values are displayed using instances of {@link FieldViewer}
     * @param  {Application|Plugin} owner The component which is the owner of self.
     *                        Can be a FeatureDetailsControl (standard app) or HandheldApp
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);
        ResizableGridMixin.initialize.call(this);

        this.app = owner.app;

        this.plugins = owner.plugins || {};

        //this object is shared across differente instances so that we get consistent behaviour
        //when using custom viewers
        this.state = this.options.state; //shared, do not create a copy

        this.app.on('featureCollection-modified', ev => {
            const urn = this.feature?.getUrn();
            if (ev.feature && ev.feature.getUrn() === urn) {
                this.displayFeatureDetails(ev.feature); //refresh
            }
        });
    }

    remove() {
        super.remove();
        ResizableGridMixin.remove.call(this);
    }

    hideDefaultAttributes(e) {
        e.stopPropagation();
        this.state.attributeDisplayMode = 'medium';
        this.render();
        this.toggleDefaultsBtn.removeClass('collapse').attr('title', this.msg('show-all'));
    }

    showDefaultAttributes(e) {
        e.stopPropagation();
        this.state.attributeDisplayMode = 'full';
        this.render();
        this.toggleDefaultsBtn.addClass('collapse').attr('title', this.msg('hide-defaults'));
    }

    /**
     * Display feature details:
     * title, link for access to other selection features, feature properties and other associated controls
     * @param  {Feature}    feature     Feature to display
     * @param  {featureEvent}   e           Original event details - to pass on to plugins
     */
    displayFeatureDetails(feature, e) {
        this.feature = feature;
        this.featureEvent = e;

        return this.render();
    }

    /**
     * Renders the feature's title and attributes
     */
    render() {
        const feature = this.feature;
        const myw_delta_description = feature.isDeltaSchema() && feature.getDeltaDescription();
        const templateValues = Object.assign({}, feature.properties, {
            myw_title: feature.getTitle(),
            myw_short_description: feature.getShortDescription(),
            myw_delta_description,
            masterView: feature.datasource?.options.masterMode || false
        });
        this.$el.html(this.template(templateValues));

        // display the feature's field->value table
        this.toggleDefaultsBtn = this.$('.toggle-defaults');
        this.renderAttributes();

        this.delegateEvents(); //not sure I this is necessary but click handler for less/more buttons would only work first time without it

        return translate('details', this.$el);
    }

    /**
     * Display the feature details.
     * Generates the html with a line for each field.
     * If containers information is available it will group the fields with that information
     */
    renderAttributes() {
        this.hasNullOrDefaultValues = false; //USed to determine if this feature has null or default values in any of its attributes
        const feature = this.feature;
        const fieldGroups = feature.getFieldGroups();
        const container = this.$('#attributes-detail');

        if (fieldGroups) {
            this.renderFieldGroups(container, fieldGroups);
        } else {
            //no containers definitions for this feature,
            //render as an attribute list
            this.renderAttributeListWithPanel(container);
        }
        if (this.state.collapsed) this.closeDetails();
    }

    /**
     * Displays the feature's attributes as a single table
     * @param  {jQueryElement} container Element where the attributes should be displayed
     */
    renderAttributeListWithPanel(container) {
        //load the HTML for displaying an attribute list
        container.html(this.attributeListTemplate(this.feature.properties));

        const tableBody = container.children('div'),
            renderAll = this.state.attributeDisplayMode == 'full';
        const numAttributesDisplayed = this.renderAttributeList(this.feature, tableBody, renderAll);

        //Update less/more buttons
        this._updateToggleDefaultsBtn(numAttributesDisplayed);
    }

    _updateToggleDefaultsBtn(numAttributesDisplayed) {
        const attMode = this.state.attributeDisplayMode;
        const numDisplayableAttributes = this.feature.getFieldsOrder().length;
        //Update less/more buttons
        if (numAttributesDisplayed == numDisplayableAttributes && !this.hasNullOrDefaultValues) {
            //If all the attributes are being displayed and none of them have null/default values
            //There is no scope for changing the mode to display lesser attributes, so hide the buttons
            this.toggleDefaultsBtn.hide();
        } else if (numAttributesDisplayed) {
            this.toggleDefaultsBtn.show();

            const showShowDefaultsBtn =
                    attMode != 'full' && numAttributesDisplayed <= numDisplayableAttributes,
                showHideDefaultsBtn = attMode == 'full';

            if (showHideDefaultsBtn) {
                //show the '-' button
                this._updateToggleBtnStateTo(true);
            } else if (showShowDefaultsBtn) {
                //show the '+' button
                this._updateToggleBtnStateTo(false);
            }
        }
    }

    _updateToggleBtnStateTo(renderAll) {
        if (renderAll) {
            //show the '-' button
            this.toggleDefaultsBtn.addClass('collapse').attr('title', this.msg('hide-defaults'));
        } else {
            //show the '+' button
            this.toggleDefaultsBtn.removeClass('collapse').attr('title', this.msg('show-all'));
        }
    }

    /**
     * Renders a readonly list displaying the properties of a feature
     * Takes into account each field's new_row value
     * @param  {Feature}    feature             Since this method is accessed from other classes as well
     * @param  {jQueryElement}  tableBodyEl         Element where row elements will be added
     * @param  {boolean}        [renderAll=false]   Whether null and default values should be rendered
     */
    renderAttributeList(feature, tableBodyEl, renderAll) {
        const fieldsOrder = feature.getFieldsOrder();
        let numAttributesDisplayed = 0;

        const renderedDDs = [];
        const renderedViewers = [];
        fieldsOrder.forEach(fieldName => {
            const fieldDD = feature.getFieldDD(fieldName);
            if (!fieldDD || !feature.matchesPredicate(fieldDD.visible)) return;
            const fieldDisplay = this.createFieldDisplay(feature, fieldDD, { renderAll });

            if (!this.hasNullOrDefaultValues)
                this.hasNullOrDefaultValues = this._hasNullOrDefaultValue(feature, fieldDD);

            if (fieldDisplay) {
                const { elements, fieldViewer } = fieldDisplay;
                tableBodyEl.append(elements);
                renderedDDs.push(fieldDD);
                renderedViewers.push(fieldViewer);
                numAttributesDisplayed += 1;
            }
        });

        this._constructTableElements(tableBodyEl, renderedDDs);
        this.resetRegisteredGrids(); //Clear any existing layout grids
        this.registerResizeableGrid(tableBodyEl[0], renderedViewers);
        return numAttributesDisplayed;
    }

    _constructTableElements(tableBodyEl, renderedDDs, separators = []) {
        //  Retroactively apply column properties here
        const rows = [];
        let rowCount = 0;
        renderedDDs.forEach(fieldDD => {
            if (fieldDD['new_row'] !== false && rowCount) {
                rows.push(rowCount);
                rowCount = 0;
            }
            ++rowCount;
        });
        if (rowCount) rows.push(rowCount);

        //  Translate the tableBodyEl children to rows, adding spaces where required
        //  Use the structure [title][editor]
        const children = tableBodyEl.children();
        const separatorPositions = separators.map(s => s.position);
        rows.forEach((rowCount, index) => {
            if (separatorPositions.includes(index + 1)) {
                const separatorInCurrentPos = separators.filter(
                    sep => sep.position === index + 1
                )[0];
                const separator = new Separator({
                    label: separatorInCurrentPos.label
                });
                rows[index] = separator.$el;
                return;
            }
            //regular field
            const newRow = $('<div>');
            newRow.css('grid-column', '');
            newRow.css('display', 'contents');

            for (let i = 0; i < rowCount; ++i) {
                newRow.append(...Array.prototype.splice.call(children, 0, 2));
            }
            rows[index] = newRow;
            //  Inject first and last row classes here
            if (index == 0) {
                newRow.addClass('first-row');
            }
            if (index == rows.length - 1) {
                newRow.addClass('last-row');
            }
        });
        tableBodyEl.empty();
        rows.forEach(rowChunks => {
            tableBodyEl.append(rowChunks);
        });
    }

    /**
     * Generates the html to display a features' details using containers information
     * @param  {Object} containers The containers information (field groups) of the feature to display
     */
    renderFieldGroups(container, fieldGroups) {
        if (!this.state.groupDisplayMode) this.state.groupDisplayMode = {};
        const { groupDisplayMode, attributeDisplayMode } = this.state;
        const self = this;
        const feature = this.feature;
        const panels = $('<div />');
        let header;
        const renderAll = attributeDisplayMode == 'full';
        const visibleGroups = fieldGroups.filter(fieldGroup =>
            feature.matchesFilter(fieldGroup.visible)
        );

        this.resetRegisteredGrids(); //Clear any existing layout grids

        const numGroups = visibleGroups.length;
        // Render each container.
        visibleGroups.forEach(fieldGroup => {
            const containerExtName = fieldGroup.display_name;
            const containerIntName = self.getSafeIdFrom(containerExtName);
            const table = $('<div>', {
                class: 'tbl-details left-panel-centered details-container',
                id: `contents-${containerIntName}`
            });

            if (numGroups > 1) {
                // Setup the top of the panel
                header = $('<div>', {
                    id: containerIntName,
                    class: 'container-title detailHeader noselect'
                })
                    .append(
                        $('<img>', {
                            class: 'toggleImage',
                            id: `toggle-${containerIntName}`,
                            src: collapsedImg,
                            align: 'left'
                        })
                    )
                    .append(containerExtName)
                    .click(function () {
                        self._accordion($(this).attr('id'));
                        return false;
                    });

                table.css('display', 'none');
            }

            // Populate the panel with its fields.
            const renderedDDs = [];
            let separators = [];
            const renderedViewers = [];
            fieldGroup.fields.forEach(fieldGroupItem => {
                const fieldInternalName = fieldGroupItem.field_name;

                if (Util.isJson(fieldInternalName)) {
                    //separator
                    const separator = feature.parseSeparator(fieldInternalName);
                    separators.push({ ...separator, position: renderedViewers.length + 1 });
                    renderedViewers.push({ type: 'separator' });
                    renderedDDs.push(separator);
                    return;
                }
                const fieldDD = feature.getFieldDD(fieldInternalName);
                if (!feature.matchesPredicate(fieldDD.visible)) return;
                const fieldDisplay = self.createFieldDisplay(feature, fieldDD, { renderAll });
                renderedDDs.push(fieldDD);
                if (fieldDisplay) {
                    const { elements, fieldViewer } = fieldDisplay;
                    table.append(elements);
                    renderedViewers.push(fieldViewer);
                }

                this.hasNullOrDefaultValues =
                    this.hasNullOrDefaultValues || this._hasNullOrDefaultValue(feature, fieldDD);
            });

            this._constructTableElements(table, renderedDDs, separators);
            this.registerResizeableGrid(table[0], renderedViewers);

            //Create a table with the available header + table and add it to the group
            $('<div>', { class: 'feature-group-container bottom-separator' })
                .append(header)
                .append(table)
                .appendTo(panels);
        });

        container.html(panels);

        // Expand some of the containers.
        if (numGroups > 1) {
            fieldGroups.forEach(aFieldGroup => {
                const safeId = this.getSafeIdFrom(aFieldGroup.display_name);
                // If the container is to be expanded, then accordion it.
                if (
                    groupDisplayMode[safeId] === 'expanded' ||
                    (aFieldGroup.is_expanded && groupDisplayMode[safeId] !== 'collapsed')
                ) {
                    this._accordion(safeId);
                }
            });
        }

        if (!this.hasNullOrDefaultValues) {
            this.toggleDefaultsBtn.hide();
        } else {
            this._updateToggleBtnStateTo(renderAll);
        }
    }

    _hasNullOrDefaultValue(feature, fieldDD) {
        const fieldValue = feature.properties[fieldDD.internal_name],
            isDefault = fieldDD['default'] && fieldValue == fieldDD['default'];

        return fieldValue === null || fieldValue === '' || isDefault;
    }

    /**
     * Creates a row element with the label and value of a field
     * @param  {Feature}        feature
     * @param  {fieldDD}            fieldDD
     * @param  {fieldViewerOptions} options     Options to use by the field viewer that will render the attribute
     * @return {undefined|object}   With .fieldViewer and .elements
     */
    createFieldDisplay(feature, fieldDD, options) {
        const elements = [];
        const fieldNameCell = $(`<div class="field-name-display">${fieldDD.external_name}</div>`);
        const fieldViewer = this.getFieldViewer(feature, fieldDD, options);
        const valueElement = fieldViewer.$el;

        if (!valueElement.html()) return undefined;

        const isHtml = /<[a-z][\s\S]*>/i;
        const contents = $('<div class="feature-edit-input">').append(valueElement);

        if (
            feature.datasource?.type === 'kml' &&
            fieldDD.internal_name === 'description' &&
            isHtml.test(valueElement.html())
        ) {
            contents.attr('colspan', 2);
        } else {
            elements.push(fieldNameCell);
        }
        elements.push(contents);
        return { fieldViewer, elements };
    }

    /**
     * Creates a Dom element to render a field's value. <br/>
     * The type of element created will depend on the field's dd information
     * @param  {Feature}        feature
     * @param  {fieldDD}            fieldDD
     * @param  {fieldViewerOptions} options     Options to use by the field viewer that will render the attribute
     * @return {jQueryElement}         The newly created element (jQuery wrapped)
     */
    createFieldValueElement(feature, fieldDD, options) {
        const fieldViewer = this.getFieldViewer(feature, fieldDD, options);

        return fieldViewer.$el;
    }

    /**
     * Creates an instance of an field viewer class that is appropriate to render a field's value
     * @param  {Feature}        feature
     * @param  {fieldDD}            fieldDD
     * @param  {fieldViewerOptions} options     Options to use by the field viewer
     * @return {FieldViewer}
     */
    getFieldViewer(feature, fieldDD, options) {
        /* jshint newcap: false */
        let viewerClass;

        let fieldType = fieldDD.baseType;
        let customFieldViewer;

        //check if there is a specific field viewer defined for this feature&field
        customFieldViewer = feature.getCustomFieldViewerFor(fieldDD);
        if (customFieldViewer) {
            viewerClass = customFieldViewer;
        } else {
            const classOrFunction = this.fieldViewerMapping[fieldType];
            if (
                typeof classOrFunction == 'function' &&
                typeof classOrFunction.extend === 'function'
            ) {
                //class
                viewerClass = classOrFunction;
            } else if (typeof classOrFunction == 'function') {
                try {
                    viewerClass = classOrFunction(fieldDD);
                } catch (error) {
                    //it's a class but not a MywClass (?)
                    viewerClass = classOrFunction;
                }
            }

            if (!viewerClass) {
                viewerClass = this.fieldViewerMapping['default'];
            }
        }
        return new viewerClass(this, feature, fieldDD, options);
    }

    /**
     * Toggle the subject element in the left area.
     * @private
     */
    _accordion(subject) {
        this.$(`#contents-${subject}`).toggle();
        this.$(`#footer-${subject}`).toggle();
        const toggleAnchor = document.getElementById(`toggle-${subject}`);
        if (!toggleAnchor) return;
        if (toggleAnchor.src.includes('expanded.svg')) {
            toggleAnchor.src = collapsedImg;
            this.state.groupDisplayMode[subject] = 'collapsed';
        } else {
            toggleAnchor.src = expandedImg;
            this.state.groupDisplayMode[subject] = 'expanded';
        }
    }

    //Handles the expand and collapse actions initiated by clicking on the panel-header
    toggleDetails() {
        this.state.collapsed = !this.state.collapsed;
        this.$('#attributes-detail').toggle();
        this.$('.feature-plugins-header, .panel-header').toggleClass('collapsed');
    }

    closeDetails() {
        this.$('#attributes-detail').hide();
        this.$('.feature-plugins-header, .panel-header').toggleClass('collapsed', true);
    }
}

export default FeatureViewer;
