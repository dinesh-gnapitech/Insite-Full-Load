################################################################################
# myWorld version of the mapfish.protocol.Protocol class.
################################################################################
# This version enables insert or update for tables with keys of any types.
# Copyright: IQGeo Limited 2010-2023

import json
from geojson import loads, GeoJSON
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.myw_db_predicate import MywDbPredicate
from myworldapp.core.server.base.db.myw_filter_parser import MywFilterParser
from myworldapp.core.server.base.geom.myw_geometry import MywGeometry
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.geom.myw_polygon import MywPolygon
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem


class MywFeatureRequest:
    """
    Helper for parsing a feature service request

    Supported attribute query parameters are:
      field=<name> & equals=<value>
      field=<name> & like=<value>
      filter=<myw_filter>
      ids=<id>,<id>,...

    Also mapfish filters:
      queryable=<field>,<field>,...
      <field>__<op>=<value>

    Mapfish spatial filter (within):
      tolerance=<float>
      lon=<flat> & lat=<float>
      bbox=<xmin>,<ymin>,<xmax>,ymax>
      geometry=<geojson_geom>
      epsg=<srid>

    Result control:
      order_by=<order_by_json>"""

    def __init__(self, request, table, feature_def):
        """
        Init slots of self

        request       - request to be parsed
        table         - table on which request will operate (a MywFeatureTable)
        feature_def   - partial definition of feature type (from config_cache)"""

        # Set slots of self
        self.request = request
        self.table = table
        self.feature_type = table.feature_type
        self.feature_def = feature_def

    def predicate(self):
        """
        Predicate implied by self (a MywDBPredicate)
        """

        return self.auth_predicate() & self.request_predicate()

    def auth_predicate(self):
        """
        Build predicte limiting view to accessible records

        Implements the 'filter layer' functionality for queries and feature access"""

        # Check for table fully accessible
        if self.feature_def["unfiltered"]:
            return MywDbPredicate.true

        # Build union of all accessible filtered layers
        # ENH: Modify config_cache to store merged filter in feature_def
        pred = MywDbPredicate.false
        for name, auth_pred in list(self.feature_def["filter_preds"].items()):
            pred = pred | auth_pred

        return pred

    def request_predicate(self):
        """
        Build predicate from params in self.request
        """

        return (
            self.ids_predicate()
            & self.field_predicate()
            & self.myw_filter_predicate()
            & self.myw_predicate()
            & self.mapfish_attr_predicate()
            & self.geom_predicate()
        )

    def ids_predicate(self):
        """
        Build predicate for ids= parameter in self.request
        """

        if not "ids" in self.request.params:
            return MywDbPredicate.true

        key_field_name = self.table.descriptor.key_field_name
        ids = self.request.params["ids"].split(",")

        return self.table.field(key_field_name).in_(ids)

    def field_predicate(self):
        """
        Build predicate for field filters in self.request

        Looks for parameters 'field' and 'equals' or 'like'
        """

        params = self.request.params

        pred = MywDbPredicate.true

        if "field" in params:
            fld = self.table.field(params["field"])

            if "equals" in params:
                pred = pred & (fld == params["equals"])  # ENH: Convert boolean values?

            elif "like" in params:
                pred = pred & fld.like(params["like"] + "%")

        return pred

    def myw_filter_predicate(self):
        """
        Build predicate for the myworld-format filter string in self.request

        The filter param is a string with an expression the myWorld filter format"""

        if not "filter" in self.request.params:
            return MywDbPredicate.true

        filter_str = self.request.params["filter"]

        return MywFilterParser(filter_str).parse()

    def myw_predicate(self):
        """
        Build predicate for the myworld-format filter string in self.request

        The filter param is a string with an expression the myWorld filter format"""

        if not "predicate" in self.request.params:
            return MywDbPredicate.true

        predicate_str = self.request.params["predicate"]
        try:
            raw_predicate = json.loads(predicate_str)
            return MywDbPredicate.newFrom(raw_predicate)
        except json.JSONDecodeError as cond:
            print("Malformed predicate (invalid json):", predicate_str)
            raise exc.HTTPBadRequest("Malformed request")
        except Exception as ex:
            print("Failed conversion to MywDbPredicate: ", ex)
            raise exc.HTTPBadRequest("Malformed predicate")

    def mapfish_attr_predicate(self):
        """
        Build predicate for mapfish format parameters in self.request

        Consumes the following self.request parameters:
           queryable          A list of field names (attribute names) to be queried
           <attr_name>__<op>  Test to perform on the field e.g. diameter__ge: 12

        Overridden in order to implement contains_any_of operation.
        """

        # Check for nothing to do
        pred = MywDbPredicate.true

        if not "queryable" in self.request.params:
            return pred

        # Find fields that can be queried
        queryable = self.request.params["queryable"].split(",")

        # For each parameter in request ..
        for param, value in list(self.request.params.items()):

            # Check for not an attribute filter parameter
            # ENH: Find a safer way
            if "__" not in param:
                continue

            # Extract field name and operation
            field_name, op_name = param.split("__")

            # Check for not permitted to query or bad op
            if field_name not in queryable:
                continue

            # Add clause
            pred = pred & self.mapfish_attr_predicate_for(field_name, op_name, value)

        return pred

    def mapfish_attr_predicate_for(self, field_name, op_name, value):
        """
        Builds predicate for a mapfish attr clause
        """

        # Mappings from mapfish query operators to MywDbPredicate method names
        operations = {
            "eq": "__eq__",
            "ne": "__ne__",
            "lt": "__lt__",
            "lte": "__le__",
            "gt": "__gt__",
            "gte": "__ge__",
            "like": "like",
            "ilike": "ilike",
            "contains_any_of": "contains_any_of",
        }

        # Check for unknown operation
        op = operations.get(op_name)
        if not op:
            return MywDbPredicate.true  # ENH: Raise an error

        field = self.table.field(field_name)

        # Case: Contains-any-of
        if op == "contains_any_of":

            pred = MywDbPredicate.false

            strings = value.split(",")

            for string in strings:
                pred = pred | field.like("%" + string + "%")

            return pred

        # Case: Other
        else:

            # myWorld stores empty strings as NULL
            if value == "":
                value = None

            # Cast boolean literals to bool (required by Oracle)
            field_type = self.table.descriptor.fields[field_name].type
            if field_type == "boolean":
                value = value.upper() == "TRUE"  # ENH: Safer to check for expected values

            # Build filter clause
            func = getattr(field, op)
            return func(value)

    def geom_predicate(self):
        """
        Build predicate for geometry filter from params in self.request.

        Consumes the following self.request parameters:
           bbox        Bounding box (as xmin,y_min,x_max,y_max)
           lon         Longitude (in decimal degrees)
           lat         Latitude (in decimal degrees)
           geometry    A geojson geometry
           tolerance   Search radius
           epsg        Coordinate system identifier (?defines CS of params)
        """

        # Extract geometry
        if "bbox" in self.request.params:
            box = self.request.params["bbox"]
            box = list(map(float, box.split(",")))
            geom = MywPolygon(
                (
                    (box[0], box[1]),
                    (box[0], box[3]),
                    (box[2], box[3]),
                    (box[2], box[1]),
                    (box[0], box[1]),
                )
            )

        elif "lon" and "lat" in self.request.params:
            geom = MywPoint(float(self.request.params["lon"]), float(self.request.params["lat"]))

        elif "geometry" in self.request.params:
            factory = lambda ob: GeoJSON.to_instance(ob)
            geom_json = loads(self.request.params["geometry"], object_hook=factory)
            geom = MywGeometry.decode(geom_json)

        else:
            return MywDbPredicate.true

        # Extract other parameters
        tolerance = 0
        if "tolerance" in self.request.params:
            tolerance = float(self.request.params["tolerance"])

        epsg = None
        if "epsg" in self.request.params:
            epsg = int(self.request.params["epsg"])

            geom_coord_sys = MywCoordSystem(epsg)
            db_coord_sys = MywCoordSystem(4023)
            geom = geom.geoTransform(geom_coord_sys, db_coord_sys)

        # Build predicate
        primary_geom_name = self.table.descriptor.primary_geom_name
        if primary_geom_name is None:
            return MywDbPredicate.false

        geom_field = self.table.field(primary_geom_name)
        if tolerance == 0:
            return geom_field.geomIntersects(geom)
        else:
            return geom_field.geomWithinDist(geom, tolerance)

    def order_by_info(self):
        """
        Returns order criteria implied by self.request parameters (if any)

        Uses 'order_by' parameter from self.request with format:
          [ <field_spec>, ...]

        where field_spec is a dict with keys:
          fieldName   <string> Name of field (mandatory)
          descending  <bool>   Sort order (optional)

        Returns a list of (field_name,ascending) tuples"""

        # Get self.request parameter
        order_by = self.request.params.get("order_by")

        if not order_by:
            return []

        field_specs = json.loads(order_by)

        # Build order_by info
        info = []
        for field_spec in field_specs:

            field_name = field_spec.pop("fieldName", None)
            descending = field_spec.pop("descending", False)

            # Check for bad args
            if field_name == None:
                raise exc.HTTPBadRequest("Missing orderBy key: fieldName")

            if not isinstance(descending, bool):
                raise exc.HTTPBadRequest(
                    f"Wrong type of arg descending: {descending} type={field_name.__class__}"
                )

            if field_spec:
                raise exc.HTTPBadRequest(f"Unexpected arg: {list(field_spec.keys())}")

            # Add to list
            info.append((field_name, not descending))

        return info
