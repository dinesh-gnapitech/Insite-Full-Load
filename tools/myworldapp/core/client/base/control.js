// Copyright: IQGeo Limited 2010-2023
import View from 'myWorld/base/view';
import Toolbar from 'myWorld/uiComponents/toolbar';
import ButtonPullDown from 'myWorld/uiComponents/buttonPullDown';

export class Control extends View {
    /**
     * @class  Superclass for myWorld Controls. <br/>
     *         A control is part of an {@link Application} and manages a specific area of the user interface. <br/>
     *         It holds a specific HTML element, which is accessible via the $el or el properties <br/>
     *         In Backbone terms it corresponds to a View. <br/>
     *         As a View it includes the behaviour of Backbone See {@link http://backbonejs.org/#View}
     * @constructs
     * @extends View
     * @param  {Application|Plugin|Control}    owner   The owner of self. The application, a plugin or another control.
     * @param  {viewOptions}                 options
     */
    constructor(owner, options) {
        super(options);
        this.owner = owner;
        this.app = owner?.app;

        this.uiComponents = {};
    }

    /**
     * Adds a set of buttons to an element of the DOM
     * If availableWidth and buttonWidth are supplied it'll make sure the buttons fit in the availableWidth
     * @param {jQueryElement}     element           The element to which the buttons will be appended
     * @param {Array<buttonId>}   buttonIds         A list of identifiers for {@link PluginButton}
     * @param {addButtonsOptions} [options]         Supplies the mode of the element
     * @param {number}          [availableWidth]    Width available in the container to fit the toolbar
     * @param {number}          [buttonWidth]      Width a button will use in the toolbar (including padding and margins)
     */
    addButtons(element, buttonIds, options, availableWidth, buttonWidth) {
        const buttons = this.buildButtonRefs(buttonIds, options);

        new Toolbar({
            element: element,
            buttons: buttons,
            availableWidth: availableWidth,
            buttonWidth: buttonWidth
        });
    }

    /**
     * Uses the buttonIds to create a list of button references
     * @param  {Array<buttonId|buttonPullDownObj>}    buttonIds   List of buttons to display
     * @param  {addButtonsOptions}                    [options]   Supplies the mode of the element
     * @return {Array<buttonRef>}                                 List of button references
     */
    buildButtonRefs(buttonIds, options) {
        let buttonRefs = [];
        buttonIds.forEach(buttonId => {
            if (Object.prototype.hasOwnProperty.call(buttonId, 'pullDownButtonIds')) {
                const pullDownButtonRefs = buttonId.pullDownButtonIds.map(buttonId =>
                    this.getButtonRef(buttonId)
                );
                const Button = ButtonPullDown;
                const pullDownOptions = {
                    ...buttonId, //titleMsg, imgSrc, pullDownButtonIds
                    ...options, //mode
                    control: this,
                    pullDownButtonRefs,
                    ownerId: this.options.divId
                };
                buttonRefs.push({ owner: this, Button, options: pullDownOptions });
            } else {
                const { owner, Button } = this.getButtonRef(buttonId);
                options = { 'operation-id': buttonId, ...options };
                if (Button) {
                    buttonRefs.push({ owner, Button, options });
                } else console.warn('Missing button class for id: ', buttonId);
            }
        });
        return buttonRefs;
    }

    /**
     * Looks for the buttonId in plugins, controls and self
     * @param  {string} buttonId string representing a button
     * @return {object}          Object with the Button and its owner
     */
    getButtonRef(buttonId) {
        let Button;
        let owner;
        const buttonIdParts = buttonId.split('.');
        if (buttonIdParts.length > 1) {
            //plugin button
            const pluginId = buttonIdParts[0],
                plugin = this.app.plugins[pluginId] || this.app.layout.controls[pluginId];

            if (plugin?.buttons) {
                Button = plugin.buttons[buttonIdParts[1]];
                owner = plugin;
            } else if (pluginId === 'application') {
                Button = this.app.buttons[buttonIdParts[1]];
                owner = this.app;
            }
        } else {
            //self's own button
            Button = this.buttons && this.buttons[buttonId];
            owner = this;
        }
        return { owner, Button };
    }

    invalidateSize() {}
    visibilityChanged(isVisible) {}

    /**
     * Parses the provided uiComponentsSpec and creates a UI component for it
     * @param  {Array<uiComponentSpec>} uiComponentsSpec
     */
    initUI(uiComponentsSpec) {
        for (let compDef of uiComponentsSpec) {
            this.buildUIComponent(compDef);
        }
    }

    /**
     * Builds an html component using the classes associated with the params provided
     * @param  {string}                   type     Describes what kind of component to create. Should be part of the componentMapping map
     * @param  {object}                   options  Options that define the style of the component, its attributes and child elements
     * @param  {string|integer|boolean}   value    Value to assign to an input element in the component
     * @return {View}                          The view for the html component
     */
    buildUIComponent(componentDef, value) {
        //To make sure the el is within the current Control
        const el = this.$(componentDef.selector)[0];
        //Creates the options object by adding el and omitting selector and type
        // eslint-disable-next-line no-unused-vars
        const { selector, type, ...options } = Object.assign(componentDef, { el: el });
        //Look for the component class and type mapping in the componentMapping
        const component = new this.componentMapping[componentDef.type](options);

        if (component) {
            this.uiComponents[componentDef.name] = component;
            component.render();

            if (value) component.setValue(value);
        }
        return component;
    }
}

/**
 * Options to be sent to the addButtons method
 * @typedef addButtonsOptions
 * @property {string}    [mode]         "menu" - Creates buttons for a dropdown menu
 * @property {function}  [postAction]   Callback executed after the action method
 */

/**
 * An identifier for a button class. A button class should inherit from {@link PluginButton}. <br/>
 * Format: '&lt;pluginId>.&lt;buttonKey>' where pluginId is the key used when registering the plugin with the
 *   application and buttonKey is the key used when the button class is registered in the buttons property of the corresponding plugin. <br/>
 * &lt;pluginId> can be ommited (along with the dot separater), in which case it is assumed that the button is registered with the same component that is referencing the button. <br/>
 * &lt;pluginId> can also be 'application' in which case the button is expected to be registered directly with the application.
 * @typedef {string} buttonId
 */

/**
 * Spec to create the ui component in a control
 * Along with the properties mentioned, include anything else that your ui component needs
 * @typedef uiComponentSpec
 * @property {string} name          The name used to identify the component
 * @property {string} selector      The selector of the html element, the component should be created in
 * @property {string} type          The type of the component. For eg: 'input' | 'checkbox' | 'dropdown'
 * @property {string} label         (Optional) Whether to add a label in front of the control
 * @property {string} labelPosition (Optional) Position of the label. 'inline'|'opTop'
 */

/**
 * Object that denotes a button pull down showing a list of buttons.
 * This ui component on click displays the list of buttons denoted by the supplied buttonIds
 * @typedef buttonPullDownObj
 * @property {string}           imgSrc               Path to the image to be used for the buttons pull down
 * @property {string}           titleMsg             Title message for the pull down element
 * @property {Array<buttonId>}  pullDownButtonIds    List of buttons in the pull down
 */

export default Control;
