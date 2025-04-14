// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { msg } from 'myWorld-base';
import { Dialog, Form, Input, Button } from 'myWorld/uiComponents';

export class CoordinatesDialog extends Dialog {
    static {
        this.prototype.id = 'coordinates-dialog';

        this.mergeOptions({
            autoOpen: false // .show() is used instead //ENH: simplify this
        });
    }

    constructor(owner, options) {
        super(options);
        this.geomType = options.geomType;
        this._coords = options.coords;
        this.geomDrawMode = options.geomDrawMode;
        this.precision = options.precision;
        this.renderDialog();
        ['handleCoordinatesChange', 'close'].forEach(
            method => (this[method] = this[method].bind(this))
        );
        this.geomDrawMode.map.on('geomdraw-changed', this.handleCoordinatesChange);
        this.geomDrawMode.map.on('geomdraw-disable', this.close);
    }

    //Open dialog to add to geometry
    renderDialog() {
        if (!this.addObjectDialog) {
            this.$el
                .dialog({
                    modal: false,
                    autoOpen: false,
                    width: '490px',
                    position: { my: 'right-100', at: 'top+300', of: window },
                    title: this.msg('title'),
                    closeText: this.msg('close_tooltip'),
                    buttons: {
                        Close: {
                            text: this.msg('close_btn'),
                            click: () => {
                                this.close();
                            }
                        }
                    },
                    open(event, ui) {
                        $(':focus', this).blur();
                    },
                    close: () => {
                        this.close();
                    }
                })
                .dialog('widget')
                .find('.ui-dialog-buttonset');
            this.messageContainer = $('<div class="message-container"></div>').appendTo(
                this.$el.dialog('widget').find('.ui-dialog-buttonpane')
            );
        }
    }

    render() {
        this.form = new CoordinatesForm({
            geomType: this.geomType,
            renderDialog: this.renderDialog,
            setCoords: this.options.setCoords,
            coords: this.removeClosingCoordFromPolygon(this._coords),
            onChange: this.onChange,
            onInputChange: this.onInputChange.bind(this),
            owner: this
        });
        this.$el.html(this.form.$el);
    }

    _setFormCoords(coords) {
        this._coords = coords;
    }

    getCoords() {
        return this.geomDrawMode.getCoords();
    }

    handleCoordinatesChange() {
        this._setFormCoords(this.getCoords());
        this.render();
    }

    /*
     * Shows the bookmark window.
     */
    show() {
        this.render();
        this.$el.dialog('open');
    }

    close() {
        this.geomDrawMode.coordinatesDialog = null;
        this.$el.dialog('destroy').remove();
        this.geomDrawMode.map.un('geomdraw-changed', this.handleCoordinatesChange);
        this.geomDrawMode.map.un('geomdraw-disable', this.close);
        // ensure focus back to the map, otherwise keydown event not work.
        this.geomDrawMode.map.getContainer().focus();
    }

    onInputChange() {
        const values = this.form.getValues();
        const coords = this.parseForm(values);
        if (!coords) return;
        this.form.setValues(this.setPrecision(values));

        if (this.geomType == 'LineString' || this.geomType == 'Point') {
            this._coords = coords;
        } else if (this.geomType == 'Polygon') {
            this._coords = [coords];
        }
        try {
            this.options.setCoords(this.replaceClosingCoord([...this._coords]));
        } catch (e) {
            console.log(e);
        }
    }

    /**
     * Sets the precision of all number in values to the precision passed in as options to coordinates dialog
     * @param {Object} values
     */
    setPrecision(values) {
        Object.entries(values).forEach(([key, val]) => {
            values[key] =
                values[key] || values[key] === 0
                    ? Number.parseFloat(values[key].toPrecision(this.precision))
                    : null;
        });
        return values;
    }

    //Transform data back into what is expected from feature
    parseForm(values) {
        if (Object.values(values).find(value => value === '') !== undefined) return; //Must have added row so dont want to parse the values
        let coords = [];
        const columns = [1, 0];
        const formColumnNames = ['coord_dialog_lat', 'coord_dialog_lng'];
        const rows = Object.keys(values).length / 2;
        for (let i = 0; i < rows; i++) {
            const temp = [];
            formColumnNames.forEach((col, index) => {
                const val =
                    values[col + '_' + i] || values[col + '_' + i] === 0
                        ? Number.parseFloat(values[col + '_' + i].toPrecision(this.precision))
                        : null;
                if (!val && val !== 0) return; // Need to keep 0
                temp[columns[index]] = val;
            });
            if (Object.keys(temp).length == 2) coords.push(temp);
        }
        if (this.geomType == 'Point') coords = coords[0];
        return coords;
    }

    removeClosingCoordFromPolygon(coords) {
        if (this.geomType !== 'Polygon') return coords;
        else {
            const hasClosingCoord =
                coords[0][0][0] == coords[0][coords[0].length - 1][0] &&
                coords[0][0][1] == coords[0][coords[0].length - 1][1];
            if (hasClosingCoord) coords[0].pop();
            return coords;
        }
    }

    replaceClosingCoord(coords) {
        if (this.geomType !== 'Polygon') return coords;
        else {
            const temp = [...coords];
            temp[0].push(temp[0][0]);
            return temp;
        }
    }
}

export class CoordinatesForm extends Form {
    static {
        this.prototype.messageGroup = 'GeomDrawMode';
    }

    constructor(options) {
        const schema = {
            messageGroup: 'GeomDrawMode',
            onChange: options.onChange
        };
        const onAddClick = () => this.addRow();
        schema.rows = getCoordinateRows({ onAddClick, ...options });

        super(schema);
        this.geomType = options.geomType;
        this.coords = options.coords;
        this.owner = options.owner;
    }

    addRow() {
        // Add row respecting different ways geometries are configured
        let coords;
        if (this.geomType == 'LineString') coords = this.coords;
        else if (this.geomType == 'Polygon') coords = this.coords[0];
        else throw new Error(`Unsupported geom type`);

        //Add new row only if previous end coords are null
        const lastCoord = coords[this.coords.length - 1];
        if (!lastCoord || (lastCoord[0] !== null && lastCoord[1] !== null))
            coords.push([null, null]);

        this.owner._setFormCoords(this.geomType == 'Polygon' ? [coords] : coords);
        this.owner.render();
    }
}

function getCoordinateRows({ coords, geomType, setCoords, onInputChange, onAddClick }) {
    const rows = [];
    if (!coords) coords = [];

    if (geomType == 'Point') coords = [coords];
    else if (geomType == 'Polygon') coords = coords[0] || [[]];

    coords.forEach((coord, index) => {
        const row = {
            labelObj: "<td class='ui-label' style='width: 20px'></td>",
            label: `<strong>${index + 1}:</strong>`,
            components: [
                new Input({
                    name: `coord_dialog_lat_${index}`,
                    type: 'number',
                    disabled: !setCoords,
                    value: coord[1],
                    onChange: () => onInputChange(),
                    step: 0.0001
                }),
                new Input({
                    name: `coord_dialog_lng_${index}`,
                    type: 'number',
                    disabled: !setCoords,
                    value: coord[0],
                    onChange: () => onInputChange(),
                    step: 0.0001
                })
            ]
        };
        rows.push(row);
    });
    const buttonRow = {
        componentsObj: '<td class="ui-form-component-wrapper" colspan="2">',
        components: [
            new Button({
                text: msg('CoordinatesDialog', 'add_row'),
                cssClass: 'ui-button',
                onClick: onAddClick,
                visible: geomType == 'Point' || !coords ? false : true
            })
        ]
    };
    rows.push(buttonRow);
    return rows;
}
