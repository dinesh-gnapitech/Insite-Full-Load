// Copyright: IQGeo Limited 2010-2023
import { DragBox } from 'ol/interaction';
import { platformModifierKeyOnly } from 'ol/events/condition';
import { toLatLngBounds } from 'myWorld/base/proj';

/**
 * Handler to add ctrl-drag box interaction with a map
 * Fires a 'ctrldragbox-end' event on the map when the user releases the mouse button after dragging to create the box
 * @private
 */
export class CtrlDragBox extends DragBox {
    constructor(map) {
        const condition = platformModifierKeyOnly;
        super({ condition });
        this.on('boxstart', this.onBoxStart);
        this.on('boxdrag', this.onBoxDrag);
        //onBoxEnd is called automatically, so to avoid having it called twice, we don't run: this.on('boxend', this.onBoxEnd);
        this.map = map;
    }

    onBoxStart() {
        const shouldStartBox = this.map.currentInteractionMode().handleCtrlDragBoxStart();
        if (!shouldStartBox) return false;
    }

    onBoxDrag() {
        this.map_.getViewport().style.cursor = 'crosshair';
    }

    onBoxEnd() {
        this.map_.getViewport().style.cursor = '';

        const extent = this.getGeometry().getExtent(); // the projection of the extent is the map's projection EPSG:3857
        const latLngBounds = toLatLngBounds(extent, 'EPSG:3857');
        this.map.fire('ctrldragbox-end', { latLngBounds });
    }
}

export default CtrlDragBox;
