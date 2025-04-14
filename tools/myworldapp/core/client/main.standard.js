// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

// this code is executed once all the required modules have been loaded
myw.applicationDefinition = {
    Application: myw.Application,
    GeoMapControl: myw.GeoMapControl,
    plugins: {
        mapViewStack: myw.MapViewStackPlugin,
        bookmarks: myw.BookmarksPlugin,
        mapLink: myw.MapLinkPlugin,
        relatedFeatures: myw.RelatedFeaturesPlugin,
        measureTool: myw.MeasureToolPlugin,
        userLocation: myw.UserLocationPlugin,
        gpsStatus: myw.GpsStatusPlugin,
        print: myw.PrintPlugin,

        streetview: myw.StreetviewPlugin,
        internals: myw.InternalsPlugin,

        export: myw.ExportFeaturesPlugin,
        directions: myw.DirectionsPlugin,
        createFeature: myw.CreateFeaturePlugin,
        resultsGrid: myw.ResultsGridPlugin,
        minimap: [myw.MinimapPlugin, { enabled: false }],
        zoomLevelControl: [myw.ZoomLevelControlPlugin, { enabled: false }],
        mousePositionControl: [
            myw.MousePositionPlugin,
            { enabled: false, position: 'bottomleft', decimalPlaces: 5 }
        ],
        scaleLineControl: [myw.ScaleLinePlugin, { enabled: true }],
        internetStatus: myw.InternetStatusPlugin,
        adminNotifications: myw.AdminNotificationsPlugin,
        snapping: myw.SnappingPlugin,
        adHocQueryPlugin: myw.AdHocQueryPlugin,

        //Native App specific plugins
        syncUpload: myw.SyncUploadPlugin,
        syncDownload: myw.SyncDownloadPlugin,
        softKeyboardInput: myw.SoftKeyboardInputPlugin,
        touchStyles: myw.TouchStylesPlugin,
        nativeNotifications: myw.NativeNotificationsPlugin
    },
    mapContextMenuActions: [
        'copyCoordinate',
        'clearSelection',
        'multipleSelect',
        'refresh',
        '-',
        'zoomLevelControl.toggle',
        'mousePositionControl.toggle',
        'minimap.toggle'
    ],
    displayUnits: {
        length: 'm'
    },
    layouts: {}
};

//define desktop layout
myw.applicationDefinition.layouts['desktop'] = {
    layoutClass: myw.DesktopLayout,
    mapDivId: 'map_canvas',
    controls: {
        toolbar: [
            myw.ToolbarControl,
            {
                divId: 'toolbar',
                buttons: [
                    'mapViewStack.prev',
                    'mapViewStack.next',
                    'home',
                    'bookmarks.dialog',
                    'mapLink.dialog',
                    'createFeature.dialog',
                    'measureTool.dialog',
                    'userLocation.locate',
                    'print.dialog'
                ]
            }
        ],

        tabControl: [
            myw.TabControl,
            {
                divId: 'left-content',
                tabs: [
                    {
                        id: 'details',
                        titleMsg: 'details_tab',
                        control: [
                            myw.DetailsControl,
                            {
                                pluginIds: ['relatedFeatures', 'streetview', 'internals'],
                                featureButtons: [
                                    'application.clearCurrentSet',
                                    'results-list',
                                    'edit',
                                    'directions.currentFeature',
                                    'zoom'
                                ],
                                resultsButtons: [
                                    'application.clearCurrentSet',
                                    'bulk-edit',
                                    'resultsGrid.activate',
                                    'export.exportCurrentSet',
                                    'zoom-all'
                                ]
                            }
                        ]
                    },
                    {
                        id: 'layers',
                        titleMsg: 'layers_tab',
                        control: [myw.LayersControl, {}]
                    },
                    {
                        id: 'help',
                        titleMsg: 'help_tab',
                        control: [myw.HelpPanel, {}]
                    }
                ],
                initialTab: 'layers'
            }
        ],

        search: [myw.SearchControl, { divId: 'text-search-control' }],

        featureBriefControl: [myw.FeatureBriefControl, { divId: 'feature-brief' }],

        resultsGridControl: [
            myw.ResultsGridControl,
            {
                divId: 'bottom-panel',
                buttons: ['results-list', 'export.exportCurrentSet', 'zoom-all']
            }
        ],

        notifications: [
            myw.NotificationsControl,
            {
                divId: 'footer-right',
                pluginDisplayOrder: [
                    'touchStyles',
                    'softKeyboardInput',
                    'syncUpload',
                    'syncDownload',
                    'adminNotifications',
                    'internetStatus'
                ]
            }
        ]
    }
};

//define phone layout
myw.applicationDefinition.layouts['phone'] = {
    layoutClass: myw.PhoneLayout,
    mapDivId: 'map_canvas',
    extraPages: {
        layers: {
            pageClass: myw.PhoneLayoutPage,
            divId: 'layers-page',
            title: '{:layers_title}',
            withMap: true
        }
    },
    controls: {
        menu: [
            myw.PhoneMenuControl,
            {
                divId: 'menu-container',
                buttons: [
                    'basemap',
                    'layers.view',
                    'home',
                    'mapLink.dialog',
                    'createFeature.dialog',
                    'userLocation.locate'
                ]
            }
        ],
        search: [myw.SearchControl, { divId: 'text-search-control', fullscreen: true }],
        layers: [myw.LayersControl, { divId: 'layers-page' }],
        details: [
            myw.PhoneLayoutDetailsPage,
            {
                pluginIds: ['relatedFeatures'],
                featureButtons: ['streetview.currentFeature', 'edit', 'directions.currentFeature']
            }
        ],
        notifications: [
            myw.NotificationsControl,
            {
                divId: 'notifications-container',
                pluginDisplayOrder: [
                    'syncUpload',
                    'syncDownload',
                    'adminNotifications',
                    'gpsStatus',
                    'internetStatus'
                ]
            }
        ]
    }
};

myw.applicationDefinition.layouts['print'] = {
    layoutClass: myw.PrintLayout
};
