################################################################################
# Controller for select requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import warnings
from geojson import FeatureCollection

from sqlalchemy import literal, Column, exists
from geoalchemy2 import Geography
from pyramid.view import view_config

from myworldapp.core.server.base.core.myw_error import MywInternalError
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.geom.myw_polygon import MywPolygon
from myworldapp.core.server.base.geom.myw_geo_utils import scaleDistortionAt, degrees_to_metres
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.dd.myw_reference import MywReference
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
from myworldapp.core.server.models.base import ModelBase, MywModelMixin

from myworldapp.core.server.controllers.base.myw_controller import MywController
from myworldapp.core.server.controllers.base.myw_utils import featuresFromRecs, filterFor

import myworldapp.core.server.controllers.base.myw_globals as myw_globals


# Geometry index tables to check
geometry_table_names = [
    "geo_world_point",
    "geo_world_linestring",
    "geo_world_polygon",
    "int_world_point",
    "int_world_linestring",
    "int_world_polygon",
    "delta_geo_world_point",
    "delta_geo_world_linestring",
    "delta_geo_world_polygon",
    "delta_int_world_point",
    "delta_int_world_linestring",
    "delta_int_world_polygon",
]


def getModels(Session, tablenames):
    """
    Returns dictionary of record 'exemplars' for the geom index tables
    """
    # ENH: Get via driver

    # Suppressing SQLAlchemy warnings about geographic indexes
    with warnings.catch_warnings():
        from sqlalchemy import exc as sa_exc

        warnings.simplefilter("ignore", category=sa_exc.SAWarning)  # ENH: Should it be SA.exc?

        models = {}

        for a_tablename in tablenames:

            # Build a new table class
            model = type(
                a_tablename,
                (ModelBase, MywModelMixin),
                dict(
                    __tablename__=Session.myw_db_driver.dbNameFor("myw", a_tablename),
                    __table_args__={
                        "schema": Session.myw_db_driver.dbNameFor("myw"),
                        "autoload": True,
                        "extend_existing": True,
                        "autoload_with": Session.bind,
                    },
                    the_geom=Column(Geography(srid=4326)),
                ),
            )

            # Add it to the dictionary
            models[a_tablename] = model

        return models


def getFeatureRecsWithoutIndexes(Session):
    """
    Returns dictionary of feature table names to records, where these features are excluded from
    the geometry index.
    """

    # ENH check all geom types for features with multiple geoms and put in the "highest" type category.
    recs = {
        "point": {},
        "linestring": {},
        "polygon": {},
    }
    for rec in Session.query(MywDDFeature):
        geom_type = rec.geometry_type
        if not rec.geom_indexed and geom_type in recs:
            # Separate the cache (for speed of identifying clicks) by geom type:
            recs[geom_type][rec.feature_name] = rec
    return recs


class MywSelectController(MywController):
    """
    Controller for select requests
    """

    # Cache index table record exemplars (for speed)
    models = getModels(Session, geometry_table_names)
    non_indexed_feature_recs = getFeatureRecsWithoutIndexes(Session)

    def __init__(self, request):
        """
        Initialize self
        """

        MywController.__init__(self, request)

        self.db = myw_globals.db

    # ==============================================================================
    #                                  SELECT NEAR
    # ==============================================================================

    @view_config(route_name="myw_select_controller.select_near", renderer="json")
    def select_near(self):
        """
        Returns 'hits' with tolerance of a given point (a set of features).

        First looks for points. If nothing found, tries linestrings. If still nothing tries polygons."""

        # Extract paramaters
        lat = self.get_param(self.request, "lat", type=float, mandatory=True)
        lon = self.get_param(self.request, "lon", type=float, mandatory=True)
        zoom = self.get_param(self.request, "zoom", type=int, mandatory=True)
        layer_codes = self.get_param(self.request, "layers", list=True, mandatory=True)
        limit = self.get_param(self.request, "limit", type=int)
        world = self.get_param(self.request, "w")
        pixel_tolerance = self.get_param(self.request, "pixel_tolerance", type=int, default=8)
        application = self.get_param(self.request, "application")
        svars = self.get_param(self.request, "svars", type="json", default={})
        delta = self.get_param(self.request, "delta")
        schema = self.get_param(self.request, "schema", default="data")
        feature_types = self.get_param(self.request, "types", default=None)
        lang = self.get_param(self.request, "lang", type=str, default=None)

        # Exclude null layer codes (which can cause problems later)
        layer_codes = self.excludeEmptyStrs(layer_codes)

        # Check authorised
        self.current_user.assertAuthorized(self.request, layer_codes=layer_codes)

        # Build filtering info
        session_vars = self.current_user.sessionVars(application=application, **svars)

        # Do the scan
        recs = self.recsNear(
            layer_codes,
            session_vars,
            lon,
            lat,
            zoom,
            pixel_tolerance,
            world,
            delta,
            schema,
            limit,
            feature_types,
        )

        # Convert to feature collection
        features = featuresFromRecs(
            recs,
            include_display_values=True,
            include_lobs=False,
            include_geo_geometry=True,
            lang=lang,
        )

        return FeatureCollection(features)

    def recsNear(
        self,
        layer_codes,
        session_vars,
        lon,
        lat,
        zoom,
        pixel_tolerance,
        world,
        delta,
        schema,
        limit,
        feature_types,
    ):
        """
        Returns features from LAYER_CODES in WORLD near (LON,LAT)

        LAYER_CODES is a list of overlays to scan. WORLD is the name of a world or NONE (for gis world).
        LON and LAT are the search point (in WGS84 degrees).

        SESSION_VARS are used when evaluating the auth filter

        Uses 'hit' logic (points first, then lines, then polygons)"""

        # Convert 'pixel' tolerance to world units
        nominal_pixel_size_m_z0 = 156250.0  # Nominal size of level 0 pixel at equator, in metres
        nominal_pixel_size_m = nominal_pixel_size_m_z0 / pow(2, zoom)
        tolerance = pixel_tolerance * nominal_pixel_size_m  # projected metres
        tolerance = tolerance * scaleDistortionAt(lat)  # real world metres

        # Build list of feature types to scan for
        feature_items = self.featureItemsFor(layer_codes, zoom, feature_types)

        # Check for no feature types accessible
        if not feature_items:
            return []

        # Build point geometry
        pnt = MywPoint(lon, lat)

        unindexed_recs = self.unindexedRecsNear(
            feature_items, session_vars, pnt, tolerance, world, delta, schema, limit=limit
        )

        # Find the geometry index records that match
        index_recs = self.indexRecsNear(
            feature_items, session_vars, pnt, tolerance, world, delta, schema, limit=limit
        )

        # Get features they reference
        return unindexed_recs + self.featureRecsFrom(index_recs, delta, schema)

    def indexRecsNear(
        self, feature_items, session_vars, geom, tolerance, world, delta, schema, limit=None
    ):
        """
        Scan geometry index tables for geometries with TOLERANCE (in meters) of GEOM (a WKB geom)

        First looks for points, then linestrings then polygons. If one table has matching records, only those are returned.

        Returns an unordered list of index records
        """

        world_type = "int" if world else "geo"

        # For geometry type in 'hit' order ..
        for geom_type, dist in [("point", tolerance), ("linestring", tolerance), ("polygon", 0.0)]:

            # Do the scan
            recs = self.scanGeomIndex(
                world_type,
                geom_type,
                feature_items,
                session_vars,
                "within_dist",
                geom,
                dist=dist,
                world=world,
                delta=delta,
                schema=schema,
                limit=limit,
            )

            # If anything found ... give up
            if recs:
                return recs

        return []

    def unindexedRecsNear(
        self, feature_items, session_vars, geom, tolerance, world, delta, schema, limit=None
    ):

        for geom_type, dist in [("point", tolerance), ("linestring", tolerance), ("polygon", 0.0)]:
            non_indexed_feature_recs = self.non_indexed_feature_recs[geom_type]
            recs = []
            for feature in feature_items:
                if feature["name"] in non_indexed_feature_recs:
                    # Do the scan
                    recs += self.scanFeatureTable(
                        feature,
                        session_vars,
                        "within_dist",
                        geom,
                        dist=dist,
                        world=world,
                        delta=delta,
                        schema=schema,
                        limit=limit,
                    )
            # If anything found for this geom_type, return them.
            if recs:
                return recs

        return []

    # ==============================================================================
    #                                  SELECT WITHIN
    # ==============================================================================

    @view_config(route_name="myw_select_controller.select_within", renderer="json")
    def select_within(self):
        """
        Returns all selectable features within supplied polygon
        """

        # Extract paramaters
        coords = self.get_param(self.request, "coords", type="coords", mandatory=True)
        zoom = self.get_param(self.request, "zoom", type=int, mandatory=True)
        layer_codes = self.get_param(self.request, "layers", list=True, mandatory=True)
        limit = self.get_param(self.request, "limit", type=int)
        world = self.get_param(self.request, "w")
        application = self.get_param(self.request, "application")
        svars = self.get_param(self.request, "svars", type="json", default={})
        delta = self.get_param(self.request, "delta")
        schema = self.get_param(self.request, "schema", default="data")
        feature_types = self.get_param(self.request, "types", default=None)
        lang = self.get_param(self.request, "lang", type=str, default=None)

        # Build geometry
        poly = MywPolygon(coords)

        # Exclude null layer codes (which can cause problems later)
        layer_codes = self.excludeEmptyStrs(layer_codes)

        # Check authorised
        self.current_user.assertAuthorized(self.request, layer_codes=layer_codes)

        # Build filtering info
        session_vars = self.current_user.sessionVars(application=application, **svars)

        # Do the scan
        recs = self.recsWithin(
            layer_codes, session_vars, poly, zoom, world, delta, schema, limit, feature_types
        )

        # Convert to feature collection
        features = featuresFromRecs(
            recs,
            include_display_values=True,
            include_lobs=False,
            include_geo_geometry=True,
            lang=lang,
        )

        return FeatureCollection(features)

    def recsWithin(
        self, layer_codes, session_vars, poly, zoom, world, delta, schema, limit, feature_types
    ):
        """
        Returns features in WORLD within POLY (a MywPolygon)

        LAYER_CODES is a list of overlays to scan. WORLD is the name of a world or NONE (for gis world).
        POLY is a MywPolygon in WGS84 degrees.

        SESSION_VARS are used when evaluating the auth filter

        Returns all points, linestrings and polygons within POLY"""

        # Build list of feature types to scan for
        feature_items = self.featureItemsFor(layer_codes, zoom, feature_types)

        # Check for no feature types accessible
        if not feature_items:
            return []

        unindexed_recs = self.unindexedRecsWithin(
            feature_items, session_vars, poly, world, delta, schema, limit=limit
        )

        # Find the geometry index records that match
        index_recs = self.indexRecsWithin(
            feature_items, session_vars, poly, world, delta, schema, limit=limit
        )

        # Get features they reference
        return self.featureRecsFrom(index_recs, delta, schema) + unindexed_recs

    def indexRecsWithin(self, feature_items, session_vars, poly, world, delta, schema, limit=None):
        """
        Scan geometry index tables for geometries within POLY

        Returns an unordered list of index records
        """

        world_type = "int" if world else "geo"

        # For each index table ..
        recs = []
        for geom_type in ["point", "linestring", "polygon"]:

            # Find index records
            geom_type_recs = self.scanGeomIndex(
                world_type,
                geom_type,
                feature_items,
                session_vars,
                "covered_by",
                poly,
                world=world,
                delta=delta,
                schema=schema,
                limit=limit,
            )
            recs += geom_type_recs

            # Check for limit exceeded
            if limit:
                limit -= len(geom_type_recs)
                if limit <= 0:
                    break

        return recs

    def unindexedRecsWithin(
        self, feature_items, session_vars, poly, world, delta, schema, limit=None
    ):
        """
        Scan feature tables for unindexed geometries within POLY

        Returns an unordered list of feature records
        """
        recs = []

        for geom_type in ["point", "linestring", "polygon"]:
            non_indexed_feature_recs = self.non_indexed_feature_recs[geom_type]

            for feature_item in feature_items:
                if feature_item["name"] in non_indexed_feature_recs:
                    # Do the scan
                    recs += self.scanFeatureTable(
                        feature_item,
                        session_vars,
                        "covered_by",
                        poly,
                        world=world,
                        delta=delta,
                        schema=schema,
                        limit=limit,
                    )

        return recs

    # ==============================================================================
    #                              SCANNING THE INDEX
    # ==============================================================================

    def scanGeomIndex(
        self,
        world_type,
        geom_type,
        feature_items,
        session_vars,
        scan_type,
        geom,
        dist=None,
        world=None,
        delta="",
        schema="data",
        offset=None,
        limit=None,
    ):
        """
        Scan index GEOM_TYPE for geometries around GEOM (a MywGeometry)

        Supported SCAN_TYPEs are:
           'within_dist'    Returns records within DIST metres of GEOM (calculation in geodetic space)
           'covered_by'     Returns records entirely within GEOM (calculation in projected space)

        Returns an array with the matching records
        """

        # Find master recs if needed
        if schema == "data":
            index_recs = self._masterScanQuery(
                world_type,
                geom_type,
                feature_items,
                session_vars,
                scan_type,
                geom,
                dist,
                world,
                delta,
                offset,
                limit,
            ).all()
        else:
            index_recs = []

        if not delta and schema == "data":
            return index_recs

        # Add delta recs
        if limit:
            limit -= len(index_recs)
            if limit <= 0:
                return index_recs

        index_recs += self._deltaScanQuery(
            world_type,
            geom_type,
            feature_items,
            session_vars,
            scan_type,
            geom,
            dist,
            world,
            delta,
            schema,
            offset,
            limit,
        ).all()
        return index_recs

    def _masterScanQuery(
        self,
        world_type,
        geom_type,
        feature_items,
        session_vars,
        scan_type,
        geom,
        dist,
        world=None,
        delta="",
        offset=None,
        limit=None,
    ):
        """
        Returns query to scan master index table GEOM_TYPE for geometries around GEOM
        """

        # Build table name
        table_name = "{}_world_{}".format(world_type, geom_type)
        model = self.models[table_name]

        # Build basic query
        query = self._scanQuery(
            model, feature_items, session_vars, scan_type, geom, dist, world, delta
        )

        # Exclude shadowed records
        # ENH: Doesn't handle case where geom type has changed in delta .. or geom has been unset
        if delta:
            delta_table_name = "delta_" + table_name
            delta_model = self.models[delta_table_name]

            delta_rec_exists_filter = (
                (delta_model.delta == delta)
                & (delta_model.feature_table == model.feature_table)
                & (delta_model.feature_id == model.feature_id)
            )

            query = query.filter(~exists().where(delta_rec_exists_filter))

        # Add limit and offset (if requested)
        if limit:
            query = query.limit(limit)
        if offset:
            query = query.offset(offset)

        return query

    def _deltaScanQuery(
        self,
        world_type,
        geom_type,
        feature_items,
        session_vars,
        scan_type,
        geom,
        dist,
        world=None,
        delta="",
        schema="data",
        offset=None,
        limit=None,
    ):
        """
        Returns query to scan delta index table GEOM_TYPE for geometries around GEOM
        """

        # Build table name
        table_name = "delta_{}_world_{}".format(world_type, geom_type)
        model = self.models[table_name]

        # Build basic query
        query = self._scanQuery(
            model, feature_items, session_vars, scan_type, geom, dist, world, delta
        )

        # Filter to requested delta
        if schema == "delta":
            query = query.filter(model.delta != delta).filter(model.change_type != "delete")
        else:
            query = query.filter(model.delta == delta).filter(model.change_type != "delete")

        # Add limit and offset (if requested)
        if limit:
            query = query.limit(limit)
        if offset:
            query = query.offset(offset)

        return query

    def _scanQuery(
        self, model, feature_items, session_vars, scan_type, geom, dist, world=None, delta=""
    ):
        """
        Returns query to scan index table MODEL for geometries around GEOM
        """

        # Get the SQLAlchemy table
        query = Session.query(model)

        # Add spatial filter
        query = query.filter(self.spatialFilterFor(scan_type, model, geom, dist))

        # Add feature type filter
        query = query.filter(self.featureTypeFilterFor(feature_items, session_vars, model))

        # Apply world filter
        if world is not None:
            query = query.filter(model.myw_world_name == world)

        return query

    def spatialFilterFor(self, scan_type, model, geom, dist):
        """
        Build SQLAlchemy filter selecting the index records for SCAN_TYPE

        Supported SCAN_TYPEs are:
           'within_dist'    Finds records within DIST metres of GEOM (calculation in geodetic space)
           'covered_by'     Finds records entirely within GEOM (calculation in projected space)"""

        from geoalchemy2 import Geography
        from sqlalchemy import func, cast

        geography = Geography(None)  # Geography(None) matches type used when we addGeographyIndex

        geom_wkb_el = geom.asWKBElement(srid=4326)

        if scan_type == "within_dist":
            return func.ST_DWithin(cast(geom_wkb_el, geography), model.the_geom, dist)

        if scan_type == "covered_by":
            return model.the_geom.ST_CoveredBy(geom_wkb_el)

        raise MywInternalError("Bad scan_type", scan_type)

    def featureTypeFilterFor(self, feature_items, session_vars, model):
        """
        Build SQLAlchemy filter selecting the index records for FEATURE_ITEMS

        FEATURE_ITEMS is a list of layer_feature_items
        (dicts). MODEL is the record exemplar for an index table

        Returns a SQAlchemy predicate"""

        # Note: Result returned prevents the use of the primary key - this IS desirable (read above).
        # If changing this code, ensure performance does not degrade

        # ENH: Use SQLAlchemy @hybrid_property to define property feature_table + field_name.
        # This will be easier if we explicitly defined the model classes for the geom index tables

        pred = literal(False)

        # Add a clause for each filtered layer
        unfiltered_geom_fields = []
        for feature_item in feature_items:
            feature_type = feature_item["name"]
            field_name = feature_item.get("field_name")
            filter = feature_item.get("filter")

            if not field_name:
                continue

            if filter:
                pred = pred | self.authFilterFor(
                    feature_type, field_name, filter, session_vars, model
                )
            else:
                unfiltered_geom_fields.append(feature_type + "." + field_name)

        # Add clause for other layers
        if unfiltered_geom_fields:
            pred = pred | (model.feature_table + "." + model.field_name).in_(unfiltered_geom_fields)

        return pred

    def authFilterFor(self, feature_type, field_name, filter_name, session_vars, model):
        """
        The sqlalchemy filter for FILTER_NAME of FEATURE_TYPE

        FEATURE_TABLE is the feature's sqlalchemny table descriptor"""
        # ENH: Neater to pass in sqa columns?

        # Build predicate to select all index records for this feature type
        ft_filter = (model.feature_table == feature_type) & (model.field_name == field_name)

        # Add filter based on attribute values
        attr_pred = self.current_user.featureTypeFilter(
            None, "myworld", feature_type, filter_name
        )  # ENH: pass in application name
        feature_def = self.current_user.featureTypeDef(None, "myworld", feature_type)
        field_map = feature_def["filter_ir_map"]
        feature_model = self.db.dd.featureModel(
            feature_type, "data"
        )  # ENH: Ideally would know schema ... but this is safe

        attr_filter = attr_pred.sqaFilter(
            feature_model.__table__, model.__table__, field_map, variables=session_vars
        )

        return ft_filter & attr_filter

    # ==============================================================================
    #                          SCANNING FEATURE TABLES
    # ==============================================================================
    def scanFeatureTable(
        self,
        feature_item,
        session_vars,
        scan_type,
        geom,
        dist=None,
        world=None,
        delta="",
        schema="data",
        offset=None,
        limit=None,
    ):
        """
        Returns query to scan feature_item's table for geometry around GEOM
        """

        dist_deg = None
        if dist is not None:
            # convert dist in metres to dist in degrees.
            lat = geom.y
            dist_in_degrees_at_equator = dist / degrees_to_metres
            dist_deg = (
                dist_in_degrees_at_equator * scaleDistortionAt(lat) * 2
            )  # 2 is empiric factor to adjust for degrees not being an accurate measure

        # Grab the feature table model (handles deltas for us)
        table = self.db.view(delta, schema).table(feature_item["name"])
        filter_builder = lambda model: filterFor(
            self.current_user,
            model,
            feature_item["name"],
            [feature_item["field_name"]],
            world if world else "geo",
            geom.asWKBElement(4326),
            feature_item.get("filter"),
            session_vars,
            mode=scan_type,
            dist=dist_deg,
        )
        query = table.filterWith(filter_builder)

        # Add limit and offset (if requested)
        if limit:
            query = query.limit(limit)
        if offset:
            query = query.offset(offset)

        return query.all()

    # ==============================================================================
    #                                  HELPERS
    # ==============================================================================

    def featureItemsFor(self, layer_codes, zoom, feature_types):
        """
        Returns the feature items for layers LAYER_CODES selectable at level ZOOM

        Returns a list of MywLayerFeatureItems"""

        # Get dict of accessible layers
        layer_defs = self.current_user.overlays()

        # For each requested layer ..
        feature_items = []
        for layer_code in layer_codes:

            # Find definition
            layer_def = layer_defs.get(layer_code)
            if not layer_def:
                continue

            # For each feature item in layer .. add to list (if selectable at this zoom)
            for item in layer_def["feature_types"]:
                feature_type = item["name"]
                if feature_types and feature_type not in feature_types:
                    continue
                if item["min_select"] <= zoom <= item["max_select"]:
                    feature_items.append(item)

        return feature_items

    def excludeEmptyStrs(self, layer_codes):
        """
        Returns copy of LAYER_CODES with empty strings removed
        """

        filter_proc = lambda code: len(code) > 0
        return list(filter(filter_proc, layer_codes))

    def featureRecsFrom(self, index_recs, delta, schema):
        """
        Returns the feature records referenced by INDEX_RECS (a list of geom index records)
        """

        # ENH: Remove duplicates? Or does getRecs() do that?

        # Build list of URNs to retrieve
        refs = []
        for index_rec in index_recs:
            ref = MywReference("myworld", index_rec.feature_table, index_rec.feature_id)
            refs.append(ref)

        # Get feature records
        db_view = self.db.view(delta, schema)
        recs = db_view.getRecs(refs)

        return recs
