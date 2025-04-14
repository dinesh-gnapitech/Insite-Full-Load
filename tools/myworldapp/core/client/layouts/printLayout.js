// Copyright: IQGeo Limited 2010-2023

import $ from 'jquery';
import printHtml from 'text!html/print.html';
import { Layout } from './layout';
import { Util } from 'myWorld-base';
import { ViewManager } from './viewManager';
import { SelectionMode } from 'myWorld/map';
import { PrintOptionsControl } from 'myWorld/controls/printOptionsControl';

/**
 * Layout for a print ready map
 */
export class PrintLayout extends Layout {
    static {
        this.mergeOptions({
            mapDivId: 'print_map_canvas'
        });
    }

    constructor(owner, options) {
        super(owner, options);

        //restore session variables
        try {
            const sessionVars = JSON.parse(localStorage.getItem('sessionVars'));
            if (sessionVars) {
                Object.entries(sessionVars).forEach(([key, value]) =>
                    this.app.database.setSessionVar(key, value)
                );
            }
        } catch (e) {
            console.log('Reading session variables for print:', e);
        }

        this.template_dir = 'modules/custom/print_templates';
    }

    initUI() {
        //load Html and css
        this.$el.html(printHtml);

        this.setWrapperWidth();

        this.control = new PrintOptionsControl(this.app);

        const control = this.control;

        this.translate(this.$el);

        //only resolve when the template has loaded
        return this.switchTemplate().then(map => {
            control.getPrintElementsFromTemplate();
            return map;
        });
    }

    initControls() {
        //disable selection on the geoMapControl
        this.app.map.endCurrentInteractionMode();
    }

    createContainerForInternals() {
        this.$(`#${this.options.mapDivId}`).append(
            $('<div>', { id: 'view-container-start', class: 'clearit' })
        );
    }

    createContainerForMap() {
        this.$(`#${this.options.mapDivId}`).append(
            "<div id='map-container' class='map-section' style='position: relative'></div>"
        );
    }

    /**
     * Switches the current print template to the one selected by the control
     * @return {Promise}           A promise that will be resolved (with the map) once the template switch has completed
     */
    switchTemplate() {
        //make sure the template configuration is loaded before getting the template name
        return this.control.templateConfigLoaded
            .then(() => {
                // Save or Update the preserved field values
                this.control._preserveFieldValues();
                const templateName = this.control.getTemplateName();

                this.$('.right-content').empty();
                return Util.loadInto(`${this.template_dir}/${templateName}`, '.right-content');
            })
            .then(() => {
                this.setWrapperWidth();
                const map = this.createPrintMap();
                this.setCenteredElements();
                this.app.setMap(map);
                this.app.handleLayersFromParam();
                // Remove the attribution from the map
                map._setPrefix('');

                this.translate(this.$('.right-content'));

                return map;
            });
    }

    /**
     * Creates a map instance on the defined div
     * @return {GeoMapControl}           The map to be displayed and printed
     */
    createPrintMap() {
        // Check if internals view needs to be created
        if (this.app.getUrlParam('internals') !== '') {
            this.createContainerForInternals();
        }
        this.createContainerForMap();
        const map = new this.options.GeoMapControl(this.app, 'map-container');

        this.app.on('overlays-changed', ev => {
            if (this.app.getUrlParam('layers') === '') map.layerManager.removeAllLayers();
        });

        this.mapViewManager = new ViewManager(2);
        this.mapViewManager.register('map', map, true);
        this.mapViewManager.show('map');

        //set SelectionMode on the new map, as happened when during the initially
        //   during application.initialize, registerUserEventHandlers added set SelectionMode
        //   on theinitial map
        map.setInteractionMode(new SelectionMode(map));
        return map;
    }

    setWrapperWidth() {
        const leftWidth = $('.left-content').width(),
            rightWidth = $('.right-content').width(),
            mainWidth = leftWidth + rightWidth;

        $('.main-wrapper').width(mainWidth);
    }

    /**
     * center any elements with the center class
     */
    setCenteredElements() {
        if ($('.center').length === 0) return;

        const self = this;

        //make sure images are loaded so we can center them
        const imagesLoaded = new Promise(resolve => {
            const nImages = $('img').length;
            let nImagesLoaded = 0;
            const incImagesLoaded = () => {
                nImagesLoaded += 1;
                if (nImages === nImagesLoaded) resolve();
            };

            $('img')
                .on('load', incImagesLoaded)
                .each(function () {
                    if (this.complete) incImagesLoaded();
                });
        });

        imagesLoaded.then(() => {
            $('.center').each(function () {
                const parentWidth = $(this).parent().width();
                const elWidth = $(this).width();

                if (parentWidth === 0 || elWidth === 0) {
                    return true;
                } else {
                    const loc = self.getElLocation(parentWidth, elWidth);
                    $(this).css('left', loc);
                }
            });
        });
    }

    /**
     * get the location to set a centered element
     * @param  {number} parentWidth
     * @param  {number} elWidth
     * @return {number} number in pixels
     */
    getElLocation(parentWidth, elWidth) {
        parentWidth = parentWidth / 2;
        elWidth = elWidth / 2;

        return parentWidth - elWidth;
    }

    /**
     * Aplies the provided text to the appropriate span
     */
    setText(id, text) {
        $(`#${id}`).children('pre').text(text);
        // ENH: This method call isn't really needed, the element can be centered using CSS.
        this.setCenteredElements();
    }
}

export default PrintLayout;
