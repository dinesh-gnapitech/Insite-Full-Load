// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { Form, Input, Checkbox, Label, Dropdown, Button } from 'myWorld/uiComponents/';

export class BookmarkForm extends Form {
    static {
        this.prototype.messageGroup = 'BookmarksPlugin';
    }

    constructor(options) {
        const onZoomRequest = options.onZoomRequest ? options.onZoomRequest : new Function();
        const onCurrentCoordsRequest = options.onCurrentCoordsRequest
            ? options.onCurrentCoordsRequest
            : new Function();

        const schema = {
            messageGroup: 'CreateBookmarkDialog',
            onChange: options.onChange,
            rows: [
                {
                    components: [
                        new Input({
                            name: 'myw_title',
                            value: options.model.myw_title || ''
                        }),
                        new Label({
                            label: '{:basemap}',
                            cssClass: 'checkboxField',
                            wrap: new Checkbox({
                                name: 'includeBasemap',
                                value: options.model.includeBasemap || false
                            })
                        }),
                        new Label({
                            label: '{:layers}',
                            cssClass: 'checkboxField',
                            wrap: new Checkbox({
                                name: 'includeLayers',
                                value: options.model.includeLayers || false
                            })
                        }),
                        new Label({
                            label: '{:shared}',
                            cssClass: 'checkboxField',
                            visible: options.canCreateSharedBookmarks,
                            wrap: new Checkbox({
                                name: 'is_private',
                                value: options.model.is_private || false
                            })
                        })
                    ]
                },
                {
                    components: [
                        new Label({
                            label: '{:lat}:',
                            visible: options.showBookmarkDetail
                        }),
                        new Input({
                            name: 'lat',
                            cssClass: 'medium',
                            visible: options.showBookmarkDetail,
                            value: options.model.lat
                        }),
                        new Label({
                            label: '{:lng}:',
                            visible: options.showBookmarkDetail
                        }),
                        new Input({
                            name: 'lng',
                            cssClass: 'medium',
                            visible: options.showBookmarkDetail,
                            value: options.model.lng
                        }),
                        new Label({
                            label: '{:zoom}:',
                            visible: options.showBookmarkDetail
                        }),
                        new Dropdown({
                            name: 'zoom',
                            cssClass: 'small',
                            options: [
                                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                                20, 21, 22, 23, 24, 25
                            ],
                            visible: options.showBookmarkDetail,
                            selected: options.model.zoom
                        }),
                        new Button({
                            title: '{:setfrom}',
                            cssClass: 'action_bookmarkUpdateLocation bookmark-update-bounds',
                            visible:
                                (options.onCurrentCoordsRequest && options.showBookmarkDetail) ||
                                false,
                            onClick: () => {
                                onCurrentCoordsRequest(this);
                            }
                        }),
                        new Button({
                            title: '{:goto}',
                            cssClass: 'action_bookmarkZoom',
                            onClick: onZoomRequest,
                            visible: (options.onZoomRequest && options.showBookmarkDetail) || false
                        })
                    ]
                }
            ]
        };
        super(schema);
        this.app = options.app;
        this.map = options.map;
    }

    getValues() {
        const values = super.getValues();
        const currentBaseMap = this.map.getCurrentBaseMapName();
        const visibleLayerIdsString = this.map.getCurrentLayerIds().toString();
        // Using null for no selected layers instead of an empty string to differentiate it from the case when areLayersIncludedState is false.
        const currentLayers = visibleLayerIdsString.length > 0 ? visibleLayerIdsString : null;
        const layers = values.includeLayers || false ? currentLayers : '';
        const basemap = values.includeBasemap || false ? currentBaseMap : '';

        const myw_title = values.myw_title.substring(0, 100);

        return {
            myw_title: myw_title,
            myw_search_val1: myw_title.toLowerCase(),
            myw_search_desc1: this.msg('bookmark_external_name', { name: myw_title }),
            username: myw.currentUser.username,
            lat: values.lat,
            lng: values.lng,
            zoom: values.zoom,
            is_private: !values.is_private,
            map_display: layers !== '' || basemap !== '' ? basemap.concat(`|${layers}`) : ''
        };
    }
}

export default BookmarkForm;
