// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control } from 'ol/control';
import layersImg from 'images/actions/layers.svg';

/**
 * Class to allow selection of basemaps
 */
export class BasemapControl extends Control {
    constructor({ backgroundLayers, map }) {
        //Create element to pass to control
        let element = $('<div/>', {
            class: 'myw-basemap-selector ol-unselectable ol-control'
        });
        super({ element: element[0] }); //Must not be JQuery element
        this.map = map;

        //Add table to element
        const basemapList = this.getBasemapTable(backgroundLayers);
        element.append(basemapList);
        element.mouseenter(this.toggleBasemapTable);
        element.mouseleave(this.toggleBasemapTable);
        //Open table when clicked, close when anywhere else is clicked (for mobile)
        $('.basemap-table').on('click', function (e) {
            this.toggleBasemapTable;
            e.stopPropagation();
        });
        document.addEventListener('click', this.toggleBasemapTable);

        //Set layers image
        const imageElement = document.createElement('div');
        imageElement.className = 'myw-layers-image-container';
        imageElement.innerHTML = `<img class='basemapImage' id='layers' src='${layersImg}'/>`;
        element.append(imageElement);

        this.map.on('baselayerchange', e => {
            this._onBasemapChanged(e);
        });

        map.addControl(this);
    }

    /**
     * Creates JQuery table with list of background layers with radio buttons, with onclick method for selection
     * Sets initial basemap on map to checked
     * @param {Object} backgroundLayers
     * @returns {JQueryobject} containerDiv containing html table of background layers
     */
    getBasemapTable(backgroundLayers) {
        let table = $('<table>').addClass('basemap-table').css('display', 'none');
        Object.keys(backgroundLayers).forEach(backgroundLayer => {
            const row = $(
                `<tr class="basemap-table-row"><td class="basemap-table-row"><input class="basemap-radio" name="basemaps" type="radio" value='${backgroundLayer}' ${
                    backgroundLayer == this.map.initialBaseMapName ? 'checked' : ''
                }>
                <label class="basemap-radio-label">${backgroundLayer}</label></td></tr>`
            );
            row.click({ value: backgroundLayer }, this._setCurrentBasemap.bind(this));
            table.append(row);
        });

        const containerDiv = $('<div>').addClass('basemap-table-container');

        containerDiv.append(table);

        return containerDiv;
    }

    /**
     * Shows or hides table on mouseenter or leave of myw-basemap-selector div
     * @param {event} e
     */
    toggleBasemapTable(e) {
        const basemapTable = $('.basemap-table')[0];
        if (!basemapTable) return;
        const layersIcon = $('.myw-layers-image-container')[0];

        if (e.type == 'mouseleave') {
            //Leave table - target would include 'basemap' but still want to close table
            basemapTable.style.display = 'none';
            layersIcon.style.display = 'block';
        } else if (e.type == 'mouseover' || e.target.className.includes?.('basemap')) {
            basemapTable.style.display = 'block';
            layersIcon.style.display = 'none';
        } else {
            //Click on the map - want to remove table
            basemapTable.style.display = 'none';
            layersIcon.style.display = 'block';
        }
    }

    /**
     * Sets current basemap on map
     * @param {event} e
     * @private
     */
    _setCurrentBasemap(e) {
        //change map - fires 'baselayerchange' event
        this.map.setCurrentBaseMap(e.data.value);
    }

    /**
     * Sets checked attribute on radio buttons on baselayerchange event
     * @param {event} e
     * @private
     */
    _onBasemapChanged(e) {
        $(`.basemap-radio[value='${e.layer.display_name}']`)[0].checked = true; //Set radio button
    }
}
