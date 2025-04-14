################################################################################
# An external Datasource for the ESRI REST service
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json, datetime, ctypes
from collections import OrderedDict
from requests_ntlm import HttpNtlmAuth
import shapely.wkt
import shapely.wkb

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler, MywLazyJsonFormatter
from myworldapp.core.server.base.core.myw_error import MywError

from .myw_datasource_engine import MywDatasourceEngine


class MywEsriRestDatasourceEngine(MywDatasourceEngine):
    """
    Engine for retrieving data from an Esri REST server
    """

    # For details of the ArcGIS REST API see http://resources.arcgis.com/en/help/arcgis-rest-api/index.html
    # Also http://gis.stackexchange.com/questions/50005/identifying-primary-key-field-of-layer-in-arcgis-server-using-arcgis-api-for-jav

    def __init__(
        self,
        url,
        username=None,
        password=None,
        auth_type=None,
        esri_type="MapServer",
        verify_ssl=True,
        user_agent=None,
        progress=MywProgressHandler(),
    ):
        """
        Init slots of self

        URL is the URL of the datasource
        PROGRES_PROC(level,*msg) is a callback for progress messages
        """
        super(MywEsriRestDatasourceEngine, self).__init__(
            url, username=username, password=password, user_agent=user_agent, progress=progress
        )

        self.verify_ssl = verify_ssl
        self.esri_type = esri_type
        self.auth_type = auth_type or "token"

        self._version = None  # Init lazily
        self._logged_in = False
        self._auth_token = None
        self._feature_infos = {}  # Populated lazily
        self._feature_infos_complete = False

    # ==============================================================================
    #                               GET CAPABILITIES
    # ==============================================================================

    def properties(self, full=False):
        """
        Details of self's server (a dict)
        """

        props = OrderedDict()

        if not self._version:
            data = self.send_json_request(self.base_url)
            self._version = data["currentVersion"]

        props["type"] = "ESRI REST"
        props["version"] = self._version

        return props

    def feature_type_info_for(self, feature_type, error_if_none=True):
        """
        Short info for feature_type (which must exist)
        """
        # Subclassed to avoid reading all map defs (for speed)
        # TODO: Push this up to super

        # If info not in cache ...
        if not feature_type in self._feature_infos:

            # Work out which map it is in
            # ENH: Encapsulate
            name_parts = feature_type.split(":")
            map_path = "/".join(name_parts[:-1])

            # Get feature info for that map (only)
            map_feature_infos = self._get_feature_info_for_map(map_path, "MapServer")
            self._feature_infos.update(map_feature_infos)

        # Get info from cache (if present)
        info = self._feature_infos.get(feature_type)

        # Check for does not exist
        if error_if_none and not info:
            raise MywError("Feature type not found:", feature_type)

        return info

    def all_feature_type_infos(self):
        """
        The feature types provided by self's server

        Returns a list of dicts, keyed by fully qualified feature type name"""

        if not self._feature_infos_complete:

            with self.progress.operation("Getting map definitions..."):
                self._feature_infos = self._get_feature_type_infos_below()
                self._feature_infos_complete = True

        return self._feature_infos

    def _get_feature_type_infos_below(self, folder_path=[]):
        """
        Add to FEATURES the feature type definitions for FOLDER_PATH (recursive)

        Traverses the folders and maps below BASE_URL adding feature types from each"""

        feature_infos = {}

        self.progress(2, "Getting map definitions from folder:", "/".join(folder_path))

        # Get folder meta-data
        folder_url = self._full_url_for("/".join(folder_path))
        try:
            folder_data = self.send_json_request(folder_url)

        except MywError as cond:
            self.progress("warning", "Error accessing:", folder_url, ":", "Error=", cond)
            return feature_infos

        # Add features in folder's maps
        services = folder_data.get("services", [])
        for service in services:
            if service["type"] != self.esri_type:
                continue

            url = None
            if service["type"] == "FeatureServer":
                url = service.get("url", None)
            if url is None:
                url = self._full_url_for(service["name"], service["type"])

            if service["type"] == "MapServer":
                map_feature_infos = self._get_feature_info_for_map(service["name"], service["type"])
                feature_infos.update(map_feature_infos)
            elif service["type"] == "FeatureServer":
                map_feature_infos = self._get_feature_info_for_feature(
                    service["name"], url, service["type"]
                )
                feature_infos.update(map_feature_infos)

        # Recurse on sub-folders
        folders = folder_data.get("folders", [])
        for folder in folder_data.get("folders", []):
            folder_feature_infos = self._get_feature_type_infos_below(folder_path + [folder])
            feature_infos.update(folder_feature_infos)

        return feature_infos

    def _get_feature_info_for_map(self, map_path, service_type):
        """
        Get feature type infos for map service MAP_PATH (handling errors)

        Returns a list of dicts, keyed by feature type name"""

        self.progress(3, "Getting definition for map:", map_path)

        # Get map meta-data
        try:
            url = self._full_url_for(map_path, service_type)
            map_data = self.send_json_request(url)
            return self._add_map_data(map_data, map_path, service_type)

        except MywError as cond:  # ENH: Make exception more specific e.g. raise in MywRequestError
            self.progress("warning", cond)
            return {}

    def _get_feature_info_for_feature(self, map_path, url, service_type):
        self.progress(3, "Getting definition for feature:", map_path)

        # Get map meta-data
        try:
            map_data = self.send_json_request(url)
            return self._add_map_data(map_data, map_path, service_type)

        except MywError as cond:  # ENH: Make exception more specific e.g. raise in MywRequestError
            self.progress("warning", cond)
            return {}

    def _add_map_data(self, map_data, map_path, service_type):
        map_ops = self.build_operations(map_data)

        # Build feature infos
        feature_infos = {}

        layers = map_data.get("layers", [])
        for layer_props in layers:
            layer_name = layer_props["name"]

            # Skip Esri 'group layers'
            if layer_props.get("subLayerIds"):
                continue

            # Construct myWorld name
            feature_type = map_path.replace("/", ":")
            feature_type += ":" + layer_name

            # Build info
            feature_info = {
                "name": feature_type,
                "title": layer_name,
                "id": layer_props["id"],  # internal number
                "description": "",
                "map": map_path,
                "service_type": service_type,
                "operations": map_ops,
            }

            # map_path is Hydrography/Watershed173811
            # service_type is FeatureServer

            if service_type == "FeatureServer":
                url = self._full_url_for(map_path, service_type, layer_props["id"])
                layer_data = self.send_json_request(url)
                drawing_info = layer_data.get("drawingInfo", None)
                if drawing_info is not None:
                    feature_info["drawing_info"] = drawing_info

            feature_infos[feature_type] = feature_info

        self.progress(4, "Found", len(feature_infos), "map layers")

        return feature_infos

    def build_operations(self, data):
        """
        Returns a list of operations that a service supports

        DATA is a response from a MapServer REST request"""
        # ENH: Get rid of this? Or just return a list of ops?

        capabilities = data.get("capabilities", "")
        ops = {}
        for op_name in capabilities.split(","):
            ops[op_name] = {"name": op_name}

        return ops

    # ==============================================================================
    #                           FEATURE TYPE DEFINITION ACCESS
    # ==============================================================================

    # ESRI doesn't appear to support a dateTime field type. So I have mapped esriFieldTypeDate to timestamp
    # which makes this consistent with that returned via the OGC service. However the data is returned as a
    # date (only) and so needs munging (see get to make it acceptable for the data loader. The format of dates
    # returned via ESRI doesn't appear  to be well defined either.
    # TODO: Map dates to date!

    myw_data_types = {
        "esriFieldTypeDouble": "double",
        "esriFieldTypeString": "string",
        "esriFieldTypeInteger": "integer",
        "esriFieldTypeSmallInteger": "integer",
        "esriFieldTypeGlobalID": "string",
        "esriFieldTypeOID": "integer",
        "esriFieldTypeDate": "timestamp",
    }

    myw_geom_types = {
        "esriGeometryPoint": "point",
        "esriGeometryPolyline": "linestring",
        "esriGeometryPolygon": "polygon",
        "esriGeometryMultipoint": "point",
    }

    def get_feature_type_def(self, feature_type):
        """
        Get myworld definition of FEATURE_TYPE

        Returns a myw_dd-style dict"""

        # ENH: Return a MywFeatureDescriptor instead?

        feature_info = self.feature_type_info_for(feature_type)

        raw_def = self._get_raw_feature_def(feature_type, feature_info)

        feature_info["aliases"] = self._build_aliases(feature_type, raw_def)

        return self._build_feature_type_def(feature_info, feature_type, raw_def)

    def _get_raw_feature_def(self, feature_type, feature_info):
        """
        Get Esri definition for FEATURE_TYPE

        Returns a Esri JSON definition"""

        self.progress(2, "Getting Esri feature definition:", feature_type)

        # Build the URL
        url = self._full_url_for(
            feature_info["map"], feature_info["service_type"], feature_info["id"]
        )

        # Make the request
        return self.send_json_request(url)

    def _build_aliases(self, feature_type, raw_def):
        """
        Get field aliases (Esri external names)

        Returns a dict mapping internal -> external name (where they differ)"""

        aliases = {}

        raw_fields = raw_def.get("fields") or []

        for field in raw_fields:
            name = field["name"]
            alias = field["alias"]

            if name != alias:
                aliases[name] = alias

        return aliases

    def _build_feature_type_def(self, feature_info, feature_type, raw_def):
        """
        Build a myWorld feature def from response RAW_DEF

        RAW_DEF is a response from a MapServer Layer / Table request"""

        ft_def = OrderedDict()
        key_fields = []
        geom_fields = []

        # Get basic properties
        ft_def["name"] = feature_type
        ft_def["external_name"] = raw_def["name"]

        # Get raw field definitions
        props = OrderedDict()
        fields = raw_def.get("fields") or []

        for field in fields:
            field_name = field["name"]
            field_props = OrderedDict()

            field_props["name"] = field_name
            field_props["external_name"] = self.external_name_for(field["alias"])
            field_props["type"] = self.myw_data_types.get(field["type"], field["type"])

            # Check for string length
            if field_props["type"] == "string":
                length = field.get("length")
                if length:
                    field_props["type"] = "string({})".format(length)

            # Check for key field
            if field["type"] == "esriFieldTypeOID":
                field_props["key"] = True
                field_props["mandatory"] = True
                key_fields.append(field_name)

            # Check for geometry field
            if field_props["type"] == "esriFieldTypeGeometry":
                field_props["type"] = self.myw_geom_types.get(raw_def["geometryType"])
                geom_fields.append(field_name)

            # Convert enumerated fields to type string
            # ENH: Extract range info for numeric fields
            if field.get("domain") and field["domain"]["type"] == "codedValue":
                field_props["type"] = self._type_for_enum(field["domain"])

            props[field_name] = field_props

        # For feature servers, create a dummy prop that points to self
        if feature_info.get("service_type", None) == "FeatureServer":
            esriGeometryType = raw_def.get("geometryType", "esriGeometryPoint")
            props["Shape"] = {
                "name": "Shape",
                "external_name": "Shape",
                "type": self.myw_geom_types.get(esriGeometryType),
            }

        # Convert fields to .def form
        # ENH: Build the def directly
        ft_def["fields"] = self._build_field_defs(props)
        self.progress(5, "Key field:", ",".join(key_fields))

        # Warn if definition not as expected
        if raw_def.get("type") != "Raster Layer":

            if not key_fields:
                self.progress("warning", "Feature type has no key field:", feature_type)

            if not geom_fields:
                self.progress("warning", "Feature type has no geometry field:", feature_type)

        else:
            # For raster layers, create a dummy feature type (with no key or other attributes)
            ft_def["fields"].append(
                {"name": "raster", "type": "raster", "external_name": "Raster"}
            )  # ENH: Provide helper to build field def

        return ft_def

    def _build_field_defs(self, props):
        """
        Convert field definitions PROPS to myWorld format
        """
        # ENH: Build field defs directly ..

        field_defs = []

        for field_props in list(props.values()):
            name = field_props["name"]

            # Skip calculated fields (which cause problems in extraction
            # ENH: Do this in extract engine .. for local table only
            if "." in name:
                self.progress(1, "Skipping calculated field:", name)
                continue

            # Create basic field definition
            field_def = OrderedDict()
            field_def["name"] = name
            field_def["type"] = field_props["type"]
            field_def["external_name"] = field_props.get("external_name", name)

            # Set properties ... where they differ from defaults (just to keep remote_spec small)
            if field_props.get("mandatory") == True:
                field_def["mandatory"] = True

            if field_props.get("key") == True:
                field_def["key"] = True

            if field_props.get("enum") is not None:
                self.progress("error", "Enumeration in property ignored:", name)

            field_defs.append(field_def)

        return field_defs

    def _type_for_enum(self, domain):
        """
        Determine field type from a Esri codedValue domain specification DOMAIN

        See http://cam2gismw6.iqgeo.com:6080/arcgis/sdk/rest/index.html#/Domain_objects/02ss0000002p000000/"""

        # ENH: Could just use string()

        max_len = 0
        for v in domain["codedValues"]:
            entry_len = len(v["name"])
            if entry_len > max_len:
                max_len = entry_len

        return "string({})".format(max_len)

    # ==============================================================================
    #                                 FEATURE DATA ACCESS
    # ==============================================================================

    def get_feature_data(
        self, feature_type, bounds=None, geom_name=None, geom_format="wkb", limit=None
    ):
        """
        Yields records for FEATURE_TYPE within BOUNDS (in chunks)

        Yields:
          List of feature records"""
        # ENH: Limit unused

        # Deal with default bounds (prevents requests failing)
        if bounds == None:
            bounds = ((-180, -90), (180, 90))

        # Check operation is supported
        feature_info = self.feature_type_info_for(feature_type)
        self._find_service(feature_info["operations"], "Query")

        # Build mapping from esri field names -> myworld field def
        feature_def = self.get_feature_type_def(
            feature_type
        )  # ENH: Find a way to avoid having to get this
        field_defs = {}
        for fld_def in feature_def["fields"]:
            name = fld_def["name"]
            field_defs[name] = fld_def

        # Get data
        self.progress(2, "Getting features", feature_type, "within", bounds)
        offset = 0
        while True:
            (raw_recs, more_to_get) = self._get_feature_data_chunk_via_query(
                feature_info, bounds, offset
            )

            if raw_recs:
                recs = self._convert_raw_features(raw_recs, field_defs, geom_format)
                yield self.normalise_feature_data(recs)

            if not more_to_get:
                return

            offset += len(raw_recs)

    def _get_feature_data_chunk_via_query(self, feature_info, bounds, offset):
        """
        Get features of type FEATURE_INFO within the specified BOUNDS

        Returns:
          RAW_FEATURE_RECS
          MORE_TO_GET"""

        # Build URL
        url = self._full_url_for(
            feature_info["map"], feature_info["service_type"], feature_info["id"], "query"
        )

        request_args = {"returnGeometry": "true", "outSr": "4326", "outfields": "*"}

        # Add spatial query
        if bounds:
            geom_str = "{},{},{},{}".format(
                bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]
            )  # ENH: Implement bounds object

            request_args.update(
                {
                    "inSr": "4326",  # WGS84 degrees
                    "geometry": geom_str,
                    "geometryType": "esriGeometryEnvelope",
                    "spatialRel": "esriSpatialRelIntersects",
                }
            )

        # Add offset (even if zero, to ensure ordering)
        if offset != None:
            request_args["resultOffset"] = str(offset)

        # Make request
        data = self.send_json_request(url, **request_args)

        error = data.get("error")
        if error:
            raise MywError(error["message"])

        more_to_get = data.get("exceededTransferLimit") != None

        return data.get("features"), more_to_get

    def _convert_raw_features(self, raw_recs, field_defs, geom_format="wkb"):
        """
        Build feature records from map service query response RAW_RECS

        FIELD_DEFS maps field names in the response to myworld field defs"""

        geom_field_name = self._geomFieldNameIn(field_defs)

        recs = []

        for raw_rec in raw_recs:
            rec = OrderedDict()

            # Build attributes
            for attrib_name, value in raw_rec["attributes"].items():

                fld_def = field_defs.get(attrib_name)
                if fld_def != None:  # ENH: Warn about unknown props?

                    if value == "Null" or value == None or value == "null":  # ENH: Use 'in'
                        value = ""

                    if fld_def["type"] == "timestamp" and value != "":
                        value = self._asDateTime(attrib_name, value).strftime("%Y-%m-%dT%H:%M:%S")

                    rec[fld_def["name"]] = value

            # Build geometry
            geom = self._convertGeometry(raw_rec.get("geometry"), geom_format)
            if geom:
                rec[geom_field_name] = geom

            recs.append(rec)

        return recs

    def _asDateTime(self, field_name, value):
        """
        Returns VALUE as a Python time object
        """

        try:
            # Case: milliseconds
            if isinstance(value, int):

                # Convert value to unsigned
                if isinstance(value, int):
                    value = ctypes.c_uint(value).value
                if isinstance(value, int):
                    value = ctypes.c_ulong(value).value

                return datetime.datetime.utcfromtimestamp(value / 1000.0)

            # Case: date
            else:
                return datetime.datetime.strptime(value, "%d/%m/%Y")

        except Exception as cond:
            raise MywError(
                "Field", field_name, ":", "Bad value for date:", value, "(" + str(cond) + ")"
            )

    def _geomFieldNameIn(self, field_defs):
        """
        Returns the name of the first geometry field in FIELD_DEFS (if there is one)
        """

        for f in list(field_defs.values()):
            if f["type"] in ["point", "linestring", "polygon"]:
                return f["name"]

        return None

    def _convertGeometry(self, geom, geom_format="wkb"):
        """
        Convert ESRI geometry GEOM to GEOM_FORMAT
        """
        # See: http://resources.arcgis.com/en/help/arcgis-rest-api/#/Geometry_objects/02r3000000n1000000/
        # This doesn't handle curved segments of polygons and paths ...

        if not geom:
            return None

        wkt = None

        # Handle (multi)polygon geometry
        rings = geom.get("rings")
        if rings:
            wkt = self._buildWKTPolygon(rings)

        # Handle (multi)line geometry
        paths = geom.get("paths")
        if paths:
            wkt = "MULTILINESTRING("
            sep = ""
            for line in paths:
                wkt += "{}({})".format(sep, self.__convert_coord_string(line))
                sep = ","

            wkt += ")"

        # Handle point
        x = geom.get("x")
        y = geom.get("y")
        if x and y:
            wkt = "POINT({} {})".format(x, y)

        if wkt:
            if geom_format == "wkt":
                return wkt
            elif geom_format == "ewkt":
                return "SRID=4326;" + wkt
            else:
                return shapely.wkb.dumps(shapely.wkt.loads(wkt), hex=True)

        return None

    def _buildWKTPolygon(self, rings):
        """
        Build a WKT format polygon string from ESRI geometry RINGS
        """

        # This algorithm follows the ESRI-leaflet plugin. The ESRI datamodel (as represented by the JSON)
        # is deficient: the rings element is composed of a number ring elements each of which is a list of
        # coordinates. This *could* either represent a series of disjoint outer rings OR an outer (by
        # convention the first ring) followed by a series of holes, but clearly cannot represent both. In
        # fact, inspecting the ESRI Javascript-leaflet plugin shows that
        # 1. outers are those rings directed clockwise and holes are those directed anticlockwise
        # 2. There is no structural relationship between the outers and the holes they surround; this needs to be
        # deduced by geometric tests on the geometry ... :-(
        polygons = []  # Outer in element [0], to be followed by series of holes it contains
        holes = []  # temporary holding location for all the holes returned

        for ring in rings:
            poly = self.__read_coords(ring)
            if self.__is_clockwise(poly):
                polygons.append([poly])  # Add outer
            else:
                holes.append(poly)

        for hole in holes:
            contained = False
            for polygon in polygons:
                outer = polygon[0]
                if self.coordinatesContainCoordinates(outer, hole):
                    polygon.append(hole)
                    contained = True
                    break
            if not contained:
                print("hole not contained by any outer !")
        # TODO - re-text uncontained holes for intersection

        if len(polygons) < 1:
            pass
        else:
            if len(polygons) == 1:
                wkt = "POLYGON"
            elif len(polygons) > 1:
                wkt = "MULTIPOLYGON("
            psep = ""
            for polygon in polygons:
                wkt += "{}(".format(psep)
                # Write the rings
                rsep = ""
                for ring in polygon:
                    wkt += "{}({})".format(rsep, self.__convert_coord_string(ring))
                    rsep = ","
                psep = ","
                wkt += ")"
            if len(polygons) > 1:
                wkt += ")"

        return wkt

    # ==============================================================================
    #                             GEOMETRIC HELPERS
    # ==============================================================================
    # Following methods Ported from ESRI-leaflet javascript
    # ENH: Use shapely instead?

    def coordinatesContainCoordinates(self, outer, inner):
        """ """
        return not self.arrayIntersectsArray(outer, inner) and self.coordinatesContainPoint(
            outer, inner[0]
        )

    def coordinatesContainPoint(self, coordinates, point):
        """ """
        contains = False
        i = 0
        l = len(coordinates)
        j = l - 1
        while i < l:
            if (
                (coordinates[i][1] <= point[1] and point[1] < coordinates[j][1])
                or (coordinates[j][1] <= point[1] and point[1] < coordinates[i][1])
            ) and (
                point[0]
                < (coordinates[j][0] - coordinates[i][0])
                * (point[1] - coordinates[i][1])
                / (coordinates[j][1] - coordinates[i][1])
                + coordinates[i][0]
            ):
                contains = not contains
            j = i
            i += 1
        return contains

    def arrayIntersectsArray(self, a, b):
        for i in range(len(a) - 1):
            for j in range(len(b) - 1):
                if self.vertexIntersectsVertex(a[i], a[i + 1], b[j], b[j + 1]):
                    return True
        return False

    def vertexIntersectsVertex(self, a1, a2, b1, b2):
        """ """
        uaT = (b2[0] - b1[0]) * (a1[1] - b1[1]) - (b2[1] - b1[1]) * (a1[0] - b1[0])
        ubT = (a2[0] - a1[0]) * (a1[1] - b1[1]) - (a2[1] - a1[1]) * (a1[0] - b1[0])
        uB = (b2[1] - b1[1]) * (a2[0] - a1[0]) - (b2[0] - b1[0]) * (a2[1] - a1[1])

        if uB != 0:
            ua = uaT / uB
            ub = ubT / uB
            if 0 <= ua and ua <= 1 and 0 <= ub and ub <= 1:
                return True

        return False

    def __read_coords(self, ring):
        """
        Reads coordinates into an array as number (we need to do some maths on these)
        """
        points = []
        for coords in ring:
            points.append([float(coords[0]), float(coords[1])])

        # close the ring
        if points[0][0] == points[-1][0] and points[0][1] == points[-1][1]:
            pass
        else:
            points.append(points[0])

        return points

    def __is_clockwise(self, ring):
        """
        determine if RING coordinates are clockwise. clockwise signifies outer ring, counter-clockwise a hole.
        RING *must* end with a duplicate of the start point.
        """
        # this logic was taken from the ESRI leaflet plugin, which, in turn acknowledges
        # http://stackoverflow.com/questions/1165647/how-to-determine-if-a-list-of-polygon-points-are-in-clockwise-order
        total = 0
        prev_point = None

        for point in ring:
            if prev_point:
                # pylint: disable=unsubscriptable-object
                total += (point[0] - prev_point[0]) * (point[1] + prev_point[1])
            prev_point = point
        return total >= 0

    def __convert_coord_string(self, line):
        """ """
        line_str = ""
        sep = ""
        for points in line:
            line_str += "{} {} {}".format(sep, points[0], points[1])
            sep = ","
        return line_str

    # ==============================================================================
    #                                      HELPERS
    # ==============================================================================

    @property
    def session(self):
        """
        Requests session for communicating with the external server (init lazily)
        """
        # Subclassed to set SSL certificate verification mode

        session = super(MywEsriRestDatasourceEngine, self).session

        session.verify = self.verify_ssl

        return session

    def send_json_request(self, url, **url_params):
        """
        Make a request to the server, adding auth info etc, and get response

        Returns a dict"""

        # Ensure logged in
        if self.username and not self._logged_in:
            self.login(self.auth_type, self.username, self.password)

        # Send request
        url_params["f"] = "json"
        if self._auth_token:
            url_params["token"] = self._auth_token

        resp = self.send_get_request(url, **url_params)

        # Unpick response
        data = json.loads(resp)
        self.progress(8, "Got response:", MywLazyJsonFormatter(data))

        if "error" in data:
            raise MywError("Request failed:", url, url_params, ":", data["error"]["message"])

        return data

    def login(self, auth_type, username, password):
        """
        Login to the server as USERNAME
        """

        # Case: GIS tier: Log in and obtain auth token
        if auth_type == "token":

            arcgis_url = self.base_url.split("/rest/")[0]
            login_url = arcgis_url + "/tokens/generateToken"

            # We sometimes have issues where GET is disabled for auth. If this is the case, try with POST afterwards
            try:
                self._auth_token = self.send_get_request(
                    login_url, username=username, password=password
                )

            except MywError as e:
                pass

            if self._auth_token is None:
                self._auth_token = self.send_post_request(
                    login_url,
                    data={"username": username, "password": password},
                    content_type="application/x-www-form-urlencoded",
                )

            self.progress(4, "Got authentication token:", self._auth_token)

        # Case: Web tier using Windows NTLM: Just set authenticator on session
        elif auth_type == "ntlm":
            self.session.auth = HttpNtlmAuth(username, password)

        # Case: Unknown type
        else:
            raise MywError("Bad authentication type:", auth_type)

        self.logged_in = True

    def _full_url_for(self, map_path, service_type=None, feature_type=None, service=None):
        """
        Returns the full URL for accessing a service

        FEATURE_TYPE can also be a layer_id (integer)"""
        # ENH: Split folder name from URL in init()

        url_bits = self.base_url.split("/")

        # Add path to map (handling folder-specific base_url)
        map_path_bits = map_path.split("/")

        if url_bits[-1] == map_path_bits[0]:
            map_path_bits = map_path_bits[1:]

        url_bits += map_path_bits

        # Add servcie type
        if service_type:
            url_bits += [service_type]

        # Add feature type
        if feature_type != None:
            url_bits += [str(feature_type)]

        # Add feature type
        if service != None:
            url_bits += [service]

        return "/".join(url_bits)

    # ==============================================================================
    #                               READ FEATURE STYLE
    # ==============================================================================

    ESRI_TO_MYWORLD_STYLE_LOOKUP = {"esriSMS": "point", "esriSLS": "line", "esriSFS": "fill"}

    ESRI_TO_MYWORLD_PATTERN_LOOKUP = {
        "esriSMSCircle": "circle",
        "esriSMSSquare": "square",
        "esriSMSCross": "cross",
        "esriSMSXesriSMS": "x",
        "esriSMSDiamond": "triangle",  # TODO myWorld doesn't support diamond, morph to triangle
        # lines
        "esriSLSSolid": "solid",
        "esriSLSDash": "longdash",
        "esriSLSDashDotDot": "longdashdot",
        "esriSLSDot": "dot",
        "esriSLSNull": "null",  # Not sure what this means ?
        # Fills - TODO: myWorld to support more options ?
        "esriSFSSolid": "solid",
        "esriSFSBackwardDiagonal": "solid",
        "esriSFSCross": "solid",
        "esriSFSDiagonalCross": "solid",
        "esriSFSForwardDiagonal": "solid",
        "esriSFSHorizontal": "solid",
        "esriSFSNull": "null",
        "esriSFSVertical": "solid",
    }

    def get_feature_style(self, feature_type):
        """
        Returns styling information for FEATURE_TYPE
        """

        feature_info = self.feature_type_info_for(feature_type)

        raw_def = self._get_raw_feature_def(feature_type, feature_info)

        return self._build_feature_style_from(raw_def)

    def _build_feature_style_from(self, data):
        """
        Extract style information from ESRI REST JSON response.

        This is a pretty simplistic implementation; lookup styles, images etc are not supported.

        Retruns a dict"""

        style = {}
        di = data.get("drawingInfo")

        if di:
            style["transparency"] = di.get("transparency", 0)

            # TODO needs more checking - complex style etc
            style["type"] = self.ESRI_TO_MYWORLD_STYLE_LOOKUP.get(di["renderer"]["symbol"]["type"])
            style["colour"] = di["renderer"]["symbol"]["color"]
            style["pattern"] = self.ESRI_TO_MYWORLD_PATTERN_LOOKUP.get(
                di["renderer"]["symbol"]["style"]
            )
            if style["type"] == "point":
                style["size"] = di["renderer"]["symbol"]["size"]
            elif style["type"] == "line":
                style["width"] = di["renderer"]["symbol"]["width"]
            # TODO - add fill - for outline style

        return style
