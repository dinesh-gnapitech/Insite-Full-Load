// Copyright: IQGeo Limited 2010-2023
import { Control } from 'ol/control';

export default class ZoomLevelControl extends Control {
    constructor() {
        const element = document.createElement('div');
        super({ element, render });

        this.zoomLevelIndicator = document.createElement('div');

        element.className = 'myw-zoom-level ol-unselectable ol-control';
        element.appendChild(this.zoomLevelIndicator);
    }
}

export function render(mapEvent) {
    if (!mapEvent.frameState) {
        return;
    }
    const zoom = parseInt(mapEvent.frameState.viewState.zoom);
    if (parseInt(this.zoomLevelIndicator.innerHTML) !== zoom)
        this.zoomLevelIndicator.innerHTML = zoom;
}
