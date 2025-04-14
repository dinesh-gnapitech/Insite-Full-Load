################################################################################
# Auth data cache
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import logging
from copy import deepcopy
from functools import cached_property

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_thread_safe_cache import MywThreadSafeCache
from myworldapp.core.server.base.core.myw_thread_safe_record_cache import MywThreadSafeRecordCache
from myworldapp.core.server.base.core.utils import PropertyDict

from myworldapp.core.server.base.db.myw_filter_parser import MywFilterParser
from myworldapp.core.server.base.db.myw_db_predicate import MywDbPredicate
from myworldapp.core.server.base.core.utils import getCacheManager

from myworldapp.core.server.models.myw_role import MywRole
from myworldapp.core.server.models.myw_datasource import MywDatasource
from myworldapp.core.server.models.myw_application import MywApplication
from myworldapp.core.server.models.myw_layer import MywLayer
from myworldapp.core.server.models.myw_network import MywNetwork
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
from myworldapp.core.server.models.myw_layer_feature_item import MywLayerFeatureItem
from myworldapp.core.server.models.myw_filter import MywFilter
from myworldapp.core.server.models.myw_search_rule import MywSearchRule

log = logging.getLogger("myworldapp")

# Cache of application configs, (keyed by config version + app name)
# preserved across requests .. but not Apache reboots.
# Shared across instances (no need to re-fetch defs for each different role combination )
# data doesn't include rights details as that is an association between roles and applications (permissions)
# calls to this cache object wait if another threads is populating the same item (instead of initiating the same work)
app_config_cache = MywThreadSafeCache()

# caches shared across instances, keyed on config version (no need to re-fetch defs for each different role combination )
# only to be used during build of the cache (otherwise records could go stale)

# Caches which store SQLA records (require a different cache class to handle stale sessions)
application_recs_cache = MywThreadSafeRecordCache()
feature_recs_cache = MywThreadSafeRecordCache()
layer_feature_items_cache = MywThreadSafeRecordCache()

# Caches which store non-records (e.g. dictionaries and lists built from SQLA record objects)
layer_defs_cache = MywThreadSafeCache()
filters_cache = MywThreadSafeCache()
datasource_defs_cache = MywThreadSafeCache()
network_defs_cache = MywThreadSafeCache()
layer_render_details_cache = MywThreadSafeCache()


class MywConfigCache:
    """
    In-memory cache of rights granted by a set of roles

    Stores partial definitions of the layers, feature types etc
    accessible to each application the roles can access"""

    #  ENH: Could simplify by using cache classes internally

    def __init__(self, db_session, role_names, config_version, progress):
        """
        Init slots of self from SQLAlchemy database DB_SESSION

        PROGRESS is a progress handler"""
        #  Note: Initialised eagerly to ensure consistent view

        self.db_session = db_session
        self.role_names = role_names
        self.config_version = config_version
        self.progress = progress

        self.app_data = self._get_data()

    @cached_property
    def sharedCacheManager(self):
        """
        A shared cache manager (memcache) or None if not configured
        """
        return getCacheManager("config", 2 * 86400)

    # ==============================================================================
    #                                     CONSTRUCTION
    # ==============================================================================

    def _get_data(self):
        """
        Get properties from database

        Returns a list of dicts, keyed by application name. Each entry contains keys:
          'rights'                 User's rights in the application
          'layer_defs'             Accessible layers (layer definitions, keyed by layer name)
          'datasource_defs'        Datasources used by accessible layers
          'overlays'               Accessible overlay layers (keyed by overlay code)
          'tile_layers'            Accessible tile file layers (names of tile layers .. not myWorld layers)
          'feature_defs'           Accessible feature types and their filters (keyed by (dataource,feature_type) )
          'editable_feature_defs'  Accessible feature types that are editable

        Also includes an entry for dummy application None that
        contains union of rights over all applications. This is for
        use in authorisation of pure REST calls)"""

        self.cache = {"layer_feature_items": {}}

        # Get application-specific rights
        app_data = {}
        app_names = self._getAppNames()

        for app_name in app_names:
            # start by obtaining config that is application specific (doesn't depend on roles)
            # from (shared) cache, if already populated
            key = (self.config_version, app_name)
            app_props = app_config_cache.get(key, self._getApplicationData, app_name)

            # include configuration dependant on roles
            app_props = app_data[app_name] = app_props.copy()
            app_props["rights"] = self._getAppRights(app_name)
            app_props["editable_feature_defs"] = self._getAppEditableFeatureDefs(
                app_name, app_props["feature_defs"], app_props["rights"], app_props["layer_defs"]
            )

        # Get union of application-specific rights
        merged_props = {}
        for prop_name in [
            "rights",
            "layer_defs",
            "overlays",
            "tile_layers",
            "feature_defs",
            "editable_feature_defs",
        ]:

            if prop_name in ["layer_defs", "overlays", "feature_defs", "editable_feature_defs"]:
                merged_props[prop_name] = {}
            elif prop_name == "rights":
                merged_props[prop_name] = []
            else:
                merged_props[prop_name] = set()

            for app_name in app_names:
                app_props = app_data[app_name]

                if prop_name == "feature_defs":
                    self._mergeAppFeatureDefs(merged_props[prop_name], app_props[prop_name])
                elif prop_name == "rights":
                    self._mergeAppRights(merged_props[prop_name], app_props[prop_name])
                else:
                    merged_props[prop_name].update(app_props[prop_name])

        # Add non-application-specific props
        merged_props["network_defs"] = network_defs_cache.get(
            self.config_version, self._getNetworkDefs
        )

        # Store as a dummy application
        app_data[None] = merged_props

        return app_data

    def _getAppNames(self):
        """
        Build list of application names self's roles grant permission to
        """
        return self._application_rights.keys()

    def _getApplicationData(self, app_name):
        """
        Obtains the configuration of an application - doesn't include user/role dependent information
        Uses a shared (across processes/servers) cache if available.
        See _fetchApplicationData for return value
        """
        # check if data already available in shared cache (across processes and servers)
        sharedCache = None
        if self.sharedCacheManager:
            sharedCache = self.sharedCacheManager.get_cache("app_config")
        key = str(self.config_version) + ":" + app_name
        data = None
        if sharedCache:
            try:
                data = sharedCache.get_value(key)
                self.progress(11, "Using application config data from shared cache for key", key)
            except:
                pass  # not available in shared cache

        if not data:
            data = self._fetchApplicationData(app_name)

            if sharedCache:
                self.progress(10, "Storing application config data in shared cache for key", key)
                sharedCache.put(key, data)

        return data

    def _fetchApplicationData(self, app_name):
        """
        Obtains the configuration of an application - doesn't include user/role dependent information
        Return a dict with the following keys:
        'layer_defs'             Accessible layers (layer definitions, keyed by layer name)
          'datasource_defs'        Datasources used by accessible layers
          'overlays'               Accessible overlay layers (keyed by overlay code)
          'tile_layers'            Accessible tile file layers (names of tile layers .. not myWorld layers)
          'feature_defs'           Accessible feature types and their filters (keyed by (dataource,feature_type) )
        """
        self.progress(10, "Fetching application config data for ", app_name)
        app_props = {}
        layerItemRecs = self._layerItemRecsFor(app_name)  # get records only once for performance
        app_props["layer_defs"] = self._getAppLayerDefsFrom(layerItemRecs)
        app_props["datasource_defs"] = self._getAppDatasourceDefs(app_name, app_props["layer_defs"])
        app_props["overlays"] = self._getAppOverlays(app_name, app_props["layer_defs"])
        app_props["tile_layers"] = self._getAppTileLayersFrom(layerItemRecs)
        app_props["feature_defs"] = self._getAppFeatureTypeDefs(app_name, app_props["layer_defs"])

        return app_props

    def _getAppRights(self, application_name):
        """
        Build list of self's application-specific rights in APPLICATION_NAME
        """

        self.progress(12, "Getting rights for:", application_name)

        names = self._application_rights.get(application_name, [])

        def sort_key(right):
            try:
                return right["name"]
            except TypeError:
                return right

        return sorted(names, key=sort_key)  # Sort is to make tests stable

    def _getAppLayerDefsFrom(self, layer_item_recs):
        """
        Build list of layer definitions from given list of (layer, application_layer) records
        """
        layer_defs = {}

        for layer_rec, layer_item in layer_item_recs:
            layer_def = self._layerDefFor(
                layer_rec
            ).copy()  # no need for deepcopy as only top level properties are different
            layer_def["read_only"] = layer_item["read_only"]
            layer_def["snap"] = layer_item["snap"]
            layer_defs[layer_rec.name] = layer_def
        return layer_defs

    def _layerItemRecsFor(self, application_name):
        """
        Returns a list of (layer, application_layer) records for the given application
        """
        self.progress(12, "Getting layer definitions for:", application_name)
        return self._applicationRec(application_name).layer_item_recs()

    def _layerDefFor(self, layer_rec):
        """
        The layer definition for LAYER_REC (from cache, if available)
        """
        # Provided to avoid re-reading layer definitions for different applications (slow)

        return layer_defs_cache.get(
            (self.config_version, layer_rec.id), self._getLayerDefFor, layer_rec
        )

    def _getLayerDefFor(self, layer_rec):
        """
        Obtains the layer definition for LAYER_REC
        """
        # obtain layer feature items from a cache of all records to pass to layer definition method, avoiding one (or more) query per layer
        feature_recs = self._layer_feature_items_cache.get(layer_rec.id, [])
        return layer_rec.definition(full=True, with_defaults=True, feature_recs=feature_recs)

    def _getAppDatasourceDefs(self, application_name, layer_defs):
        """
        Build list of datasource definitions accessible to APPLICATION_NAME
        """

        self.progress(12, "Getting datasource definitions for:", application_name)

        datasource_defs = {}

        ds_names = [layer_def["datasource"] for layer_def in list(layer_defs.values())]
        # ensure myworld and google (for streetview) are in the list
        # ENH: should also include the geocoder datasource being used. replace with list in settings(?)
        ds_names.append("myworld")
        ds_names.append("google")
        ds_names = set(ds_names)

        for ds_name in ds_names:
            datasource_defs[ds_name] = self._datasource_defs_cache.get(ds_name)

        return datasource_defs

    def _getAppOverlays(self, application_name, layer_defs):
        """
        Build list of overlays accessible to APPLICATION_NAME

        Returns a list of layer definitions, keyed by overlay code
        """
        # ENH: Neater to store the whole definition

        self.progress(12, "Getting overlays for:", application_name)

        overlays = {}

        for layer_def in list(layer_defs.values()):
            code = layer_def.get("code")

            if code != None:
                overlays[code] = layer_def

        return overlays

    def _getAppTileLayersFrom(self, layer_item_recs):
        """
        Build list of world types / geo layers accessible from given (layer, application_layer) records

        Returns a list of world type / geo layer names"""

        tile_layers = []

        for layer_rec, layer_item in layer_item_recs:
            tile_layer = layer_rec.tile_layer()

            if tile_layer:
                tile_layers.append(tile_layer)

        return tile_layers

    def _getAppFeatureTypeDefs(self, application_name, layer_defs):
        """
        Build list of feature types that self's roles grant access to view in APPLICATION_NAME

        Returns partial feature definitions (dicts), keyed by (datasource,feature_type).
        A partial definition contains keys:
          'id'                 # As per record
          'datasource_name'    # As per record
          'feature_name'       # As per record
          'external_name'      # As per record
          'primary_geom_name'  # As per record
          'editable'           # As per record
          'versioned'          # As per record
          'search_rule_ids'    # Ids of search rules for feature type
          'filter_exprs'       # Dict of filter expressions, keyed by filter name (depends on LAYER_DEFS)
          'filter_preds'       # Dict of MywDbPredicates, keyed by filter name (depends on LAYER_DEFS)
          'filter_ir_map'      # Mapping from feature field names to index record filter field names
          'unfiltered'         # True if LAYER_DEFS includes an unfiltered view of the feature table"""

        self.progress(12, "Getting feature type definitions for:", application_name)

        # Get list of accessible feature types (and names of their filters)
        feature_filters = {}
        ds_to_feature_types = {}  # keyed on datasource name
        for layer_def in list(layer_defs.values()):
            for item in layer_def["feature_types"]:
                ds_name = layer_def["datasource"]
                feature_type = item["name"]
                key = (ds_name, feature_type)
                filter_name = item.get("filter")

                if not key in feature_filters:
                    feature_filters[key] = set()
                feature_filters[key].add(filter_name)

                if ds_to_feature_types.get(ds_name, None) is None:
                    ds_to_feature_types[ds_name] = []
                ds_to_feature_types[ds_name].append(feature_type)

        # Get feature definitions
        # ENH: Faster to use keys from feature_filters .. or get from cache for dd_feature table?
        feature_defs = {}
        for ds_name, feature_types in ds_to_feature_types.items():
            for feature_name in feature_types:
                feature_rec = self._feature_recs_cache[(ds_name, feature_name)]
                key = (ds_name, feature_name)
                feature_def = feature_defs[key] = {}

                for prop in [
                    "id",
                    "datasource_name",
                    "feature_name",
                    "external_name",
                    "primary_geom_name",
                    "editable",
                    "versioned",
                ]:
                    feature_def[prop] = feature_rec[prop]

                feature_def["search_rule_ids"] = {}  # by language

                self._setFeatureDefFilters(feature_def, feature_rec, feature_filters.get(key, []))

        # Add search rule IDs (avoiding Postgres warning about empty in clause in none)
        myw_feature_types = ds_to_feature_types.get("myworld", [])
        if myw_feature_types:
            query = self.db_session.query(MywSearchRule).filter(
                (MywSearchRule.datasource_name == "myworld")
                & (MywSearchRule.feature_name.in_(myw_feature_types))
            )
            for search_rule_rec in query.all():
                key = (search_rule_rec.datasource_name, search_rule_rec.feature_name)
                lang = search_rule_rec.lang
                if not lang in feature_defs[key]["search_rule_ids"]:
                    feature_defs[key]["search_rule_ids"][lang] = []
                feature_defs[key]["search_rule_ids"][lang].append(search_rule_rec.id)

        return feature_defs

    def _setFeatureDefFilters(self, feature_def, feature_rec, filter_names):
        """
        Cache filter info on FEATURE_DEF (handling errors)

        FILTER_NAMES is the list of filters accessible to the
        application. The dummy name None indicates an unfiltered
        view is available"""

        feature_def["filter_ir_map"] = feature_rec.filter_ir_map()

        filter_exprs = feature_def["filter_exprs"] = {}
        filter_preds = feature_def["filter_preds"] = {}
        feature_def["unfiltered"] = False

        for filter_name in filter_names:
            if filter_name == None:
                feature_def["unfiltered"] = True
            else:

                try:
                    filter_key = (
                        feature_rec.datasource_name,
                        feature_rec.feature_name,
                        filter_name,
                    )
                    filter_value = self._filters_cache.get(filter_key, None)
                    if filter_value is None:
                        raise MywError("No such filter:", filter_name)
                    filter_exprs[filter_name] = filter_value
                    filter_preds[filter_name] = MywFilterParser(filter_value).parse()

                except MywError as cond:
                    print("***Error***", "Reading filter for", str(feature_rec), ":", cond)
                    filter_exprs[filter_name] = "0 = 1"
                    filter_preds[filter_name] = MywDbPredicate.false

    def _mergeAppFeatureDefs(self, feature_defs, app_feature_defs):
        """
        Merge feature definitions APP_FEATURE_DEFS into FEATURE_DEFS
        """
        #  Required because need to merge certain app-specific properties explicitly

        for key, app_feature_def in list(app_feature_defs.items()):

            if key in feature_defs:
                feature_def = feature_defs[key]
                feature_def["filter_exprs"].update(app_feature_def["filter_exprs"])
                feature_def["filter_preds"].update(app_feature_def["filter_preds"])
                feature_def["unfiltered"] |= app_feature_def["unfiltered"]
            else:
                feature_defs[key] = deepcopy(app_feature_def)

    def _mergeAppRights(self, rights, app_rights):
        """
        Merge list of rights app_rights into rights
        """
        #  Required because need to merge certain app-specific properties explicitly

        # Merge rights by type (some are strings, some are dicts. These can be dupes of each other.)
        combined_dict_rights = {}
        for r in rights[:] + app_rights:
            name = r["name"]
            if name in combined_dict_rights:
                # Combine the restrictions (assumed to be lists of hashable objects)
                existing_restrictions = combined_dict_rights[name]["restrictions"]
                if existing_restrictions is None or r["restrictions"] is None:
                    new_restrictions = None
                else:
                    new_restrictions = list(set(existing_restrictions + r["restrictions"]))
                combined_dict_rights[name]["restrictions"] = new_restrictions
            else:
                # If we don't deepcopy this, then we'll modify it on a later iteration (and
                # accumulate restrictions in the first app we process.)
                combined_dict_rights[name] = deepcopy(r)

        rights.clear()
        rights.extend(combined_dict_rights.values())

    def _getAppEditableFeatureDefs(self, application_name, feature_defs, rights, layer_defs):
        """
        Build list of feature types that self's roles grant access to modify in APPLICATION_NAME

        Returns a list of partial feature definitions (dicts), keyed by (datasource,feature_type)"""

        # ENH: Do this on-the-fly?

        def filter_for_editFeatures(right):
            try:
                return right["name"] == "editFeatures"
            except TypeError:
                return right == "editFeatures"

        # Find any item in rights which matches a valid template for "editFeatures"
        editFeaturesDefinition = next(
            (right for right in rights if filter_for_editFeatures(right)),
            None,
        )

        if editFeaturesDefinition is None:
            return {}

        try:
            restrictions = editFeaturesDefinition["restrictions"]
        except TypeError:
            restrictions = None

        if restrictions is not None:
            # ENH: if editFeatures rights become granular on the field level here, this will need
            # refactoring in general, so we don't attempt to handle that schema here yet.
            # (the draft schema for that case is [
            #   "note",
            #   {"feature": "damage_assessment", "fields": "type"}
            # ])

            def allowed_under_restrictions(feature_def):
                feature_name = feature_def["feature_name"]

                # restrictions is assumed to be a simple list of feature types for which the right
                # is granted.
                return feature_name in restrictions

        else:

            def allowed_under_restrictions(_):
                return True

        editable_feature_defs = {}

        # For each layer check if layer is read_only, and if not get features then add the layers to dict of editable_feature_defs
        for layer_name, layer_def in list(layer_defs.items()):
            if not layer_def["read_only"]:
                # If layer is not read only add features to editable features
                # If a feature is configured on both a read only and non-read only layer it will be editable
                layer_feature_item_defs = layer_def["feature_types"]
                dsname = layer_def["datasource"]
                for layer_feature_item_def in layer_feature_item_defs:
                    feature_name = layer_feature_item_def["name"]
                    feature_def = feature_defs[dsname, feature_name]
                    if feature_def["editable"] and allowed_under_restrictions(feature_def):
                        editable_feature_defs[dsname, feature_name] = feature_def

        return editable_feature_defs

    def _applicationRec(self, application_name):
        """
        The database record for APPLICATION_NAME
        """
        return self._application_recs_cache[application_name]

    @property
    def _application_recs_cache(self):
        """
        cache of application records for self's config version
        dict keyed on application name
        obtained from cache shared across instances/threads
        only using during build of data (as records could go stale)
        """
        return application_recs_cache.get(self.config_version, self._getApplicationRecs)

    @property
    def _feature_recs_cache(self):
        """
        cache of all dd_feature records for self's config version
        Dict keyed on BOTH dd_feature.id and (dd_feature.datasource_name, dd_feature.feature_name)
        obtained from cache shared across instances/threads
        only using during build of data (as records could go stale)
        """
        return feature_recs_cache.get(self.config_version, self._getDDFeatureRecs)

    @property
    def _layer_feature_items_cache(self):
        """
        cache of all layer_feature_item records and corresponding feature_dd records for self's config version
        Returns dict keyed on layer id and values are a list of (lfi, dd_feature) tuples
        """
        return layer_feature_items_cache.get(self.config_version, self._getLayerFeatureItemRecs)

    @property
    def _filters_cache(self):
        """
        cache of filter records for self's config version
        obtained from cache shared across instances/threads
        only using during build of data (as records could go stale)
        """
        return filters_cache.get(self.config_version, self._getFilters)

    @property
    def _datasource_defs_cache(self):
        """
        cache of datasource definitions for self's config version
        obtained from cache shared across instances/threads
        """
        return datasource_defs_cache.get(self.config_version, self._getDatasourceDefs)

    @cached_property
    def _application_rights(self):
        """
        Dictionary with sets of right names, keyed on application name
        """
        # cached so the underlying query doesn't get executed multiple times unnecessarily
        # notice this cache can't be shared with other instances as it depends on roles
        #
        self.progress(12, "Getting accessible applications and rights")

        query = MywRole.application_rights_join(self.db_session).filter(
            MywRole.name.in_(self.role_names)
        )
        rightsPerAppName = {}
        for role, right, app, permission in query:
            if not rightsPerAppName.get(app.name, None):
                rightsPerAppName[app.name] = {}

            if right.name in rightsPerAppName[app.name]:
                # de-dup, being careful not to stomp on restrictions.
                existing_restrictions = rightsPerAppName[app.name][right.name]["restrictions"]
                # right = rightsPerAppName[app.name][right.name]
                # existing_restrictions = right["restrictions"]
                if existing_restrictions is None or permission.restrictions is None:
                    new_restrictions = None
                else:
                    new_restrictions = list(set(existing_restrictions + permission.restrictions))
                rightsPerAppName[app.name][right.name]["restrictions"] = new_restrictions
            else:
                rightsPerAppName[app.name][right.name] = {
                    "name": right.name,
                    "restrictions": permission.restrictions,
                }

        return {app_name: rights.values() for app_name, rights in rightsPerAppName.items()}

    def _getApplicationRecs(self):
        """
        obtains all application records
        returns dict keyed on application name
        """
        nameToRec = {}
        for rec in self.db_session.query(MywApplication):
            nameToRec[rec.name] = rec
        return nameToRec

    def _getDDFeatureRecs(self):
        """
        Obtains all dd_feature records
        Returns dict keyed on both dd_feature.id and (dd_feature.datasource_name, dd_feature.feature_name)
        """
        ddRecs = {}
        for rec in self.db_session.query(MywDDFeature):
            ddRecs[rec.id] = rec
            ddRecs[(rec.datasource_name, rec.feature_name)] = rec
        return ddRecs

    def _getLayerFeatureItemRecs(self):
        """
        Obtains all layer_feature_item records and corresponding feature_dd records
        Returns dict keyed on layer id and values are a list of (lfi, dd_feature) tuples
        """
        # use cache of feature_dd records to avoid multiple queries
        layerIdToItems = {}
        for lfi in self.db_session.query(MywLayerFeatureItem):
            if layerIdToItems.get(lfi.layer_id, None) is None:
                layerIdToItems[lfi.layer_id] = []
            layerIdToItems[lfi.layer_id].append((lfi, self._feature_recs_cache[lfi.feature_id]))
        return layerIdToItems

    def _getFilters(self):
        """
        Obtains all filter record
        Returns dict with the filter value keyed on (datasource_name, feature_name, name)
        """
        filters = {}
        for rec in self.db_session.query(MywFilter):
            key = (rec.datasource_name, rec.feature_name, rec.name)
            filters[key] = rec.value
        return filters

    def _getDatasourceDefs(self):
        """
        Build list of datasource definitions, keyed on name
        """
        datasource_defs = {}
        for ds_rec in self.db_session.query(MywDatasource):
            datasource_defs[ds_rec.name] = ds_rec.definition()
        return datasource_defs

    def _getNetworkDefs(self):
        """
        Build list of network definitions

        Returns a list of network definitions, keyed by internal name"""
        network_defs = {}
        for rec in self.db_session.query(MywNetwork):
            network_defs[rec.name] = rec.definition()
        return network_defs

    # ==============================================================================
    #                                   PROPERTIES
    # ==============================================================================

    def accessibleApplicationNames(self):
        """
        Names of the applications self's user is authorised to use

        Note: Does not include the config application"""

        names = []
        for name in list(self.app_data.keys()):
            if name != None:
                names.append(name)

        return names

    def accessibleOverlays(self, application_name=None):
        """
        Definitions of the overlays accessible to self

        Returns a list of layer definitions, keyed by layer code"""

        return self._property("overlays", application_name)

    def accessibleLayerDefs(self, application_name=None):
        """
        Definitions of the layers accessible to self

        Returns a list of layer definitions, keyed by layer name"""

        return self._property("layer_defs", application_name)

    def accessibleNetworkDefs(self, application_name=None):
        """
        Definitions of the network accessible to self

        Returns a list of network definitions, keyed by internal name"""

        return self._property("network_defs")  # Note: Networks not application specific

    def accessibleDatasourceDefs(self, application_name=None):
        """
        Definitions of the layers accessible to self

        Returns a list of layer definitions, keyed by layer name"""

        return self._property("datasource_defs", application_name)

    def accessibleTileLayers(self, application_name=None):
        """
        Names of the worlds / geo layers self's roles grant access to view
        """

        return self._property("tile_layers", application_name)

    def accessibleFeatureTypeDefs(self, application_name=None):
        """
        Feature types self's roles grant access to view

        Returns a list of partial feature definitions, keyed by (datasource,feature_type)"""

        return self._property("feature_defs", application_name)

    def editableFeatureTypeDefs(self, application_name=None):
        """
        Feature types self's roles grant access to modify

        Returns a list of partial feature definitions, keyed by (datasource,feature_type)"""

        return self._property("editable_feature_defs", application_name)

    def rights(self, application_name=None):
        """
        Rights granted by self's roles
        """

        return self._property("rights", application_name)

    def rightNames(self, application_name=None):
        """
        Names of rights granted by self's roles
        """

        return [r["name"] for r in self.rights(application_name)]

    def _property(self, prop_name, application_name=None):
        """
        Returns value for property PROP_NAME
        """

        if not application_name in self.app_data:
            return {}

        return self.app_data[application_name][prop_name]

    # ==============================================================================
    #                                 LAZY FIELDS
    # ==============================================================================

    def layerRenderFeatureDetails(self, layer_name):  # TODO: Draw order arg ignored
        """
        Returns cached feature items for LAYER_NAME (which must exist)
        """
        # Built by lazy caching
        # ENH: For consistency, should really do this eagerly .. but can be slow

        key = (self.config_version, layer_name)

        return layer_render_details_cache.get(key, self._getLayerRenderDetails, layer_name)

    def _getLayerRenderDetails(self, layer_name):
        """
        A feature can have multiple geometry fields to render. This method returns the details
        necessary to do one query per feature type when rendering.
        """

        # Get and sort items (slow because involves getting feild geom types)
        # ENH: Use unsorted items we already have cached?
        layer_rec = self.db_session.query(MywLayer).filter(MywLayer.name == layer_name).first()
        if layer_rec is None:
            feature_item_defs = []
        else:
            feature_item_defs = layer_rec.feature_item_defs(in_draw_order=True, with_defaults=True)

        featureTypeDetails = PropertyDict()
        featureTypeDetails.zoomRange = layer_rec.zoomRangeFn()

        # gather item details per feature type
        for feature_item_def in feature_item_defs:
            feature_type = feature_item_def["name"]

            field_name = feature_item_def.get("field_name")
            if feature_type not in featureTypeDetails:
                featureTypeDetails[feature_type] = {
                    "field_names": [],
                    "required_fields": ["myw_geometry_world_name"],
                    "min_vis": 100,
                    "max_vis": 0,
                }

            details = featureTypeDetails[feature_type]
            if field_name:
                details["field_names"].append(field_name)
                details["required_fields"].extend(
                    [field_name, "myw_gwn_" + field_name, "myw_orientation_" + field_name]
                )

            # include fields used by text styles in results
            text_style = feature_item_def.get("text_style", "")
            text_field = text_style.split(":")[0]
            if text_field:
                details["required_fields"].append(text_field)

            details["min_vis"] = min(details["min_vis"], feature_item_def["min_vis"])
            details["max_vis"] = max(details["max_vis"], feature_item_def["max_vis"])
            details["filter"] = feature_item_def.get(
                "filter"
            )  # filter should be the same if several items

        return featureTypeDetails
