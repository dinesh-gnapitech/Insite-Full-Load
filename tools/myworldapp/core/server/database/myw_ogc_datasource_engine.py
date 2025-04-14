################################################################################
# An external Datasource for an OGC service
################################################################################
# Copyright: IQGeo Limited 2010-2023

import datetime
import re
import urllib.request, urllib.error, urllib.parse, urllib.request, urllib.parse, urllib.error
import shapely.wkt, shapely.wkb
from collections import OrderedDict
import xml.etree.ElementTree as ET

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_error import MywError
from .myw_datasource_engine import MywDatasourceEngine


class MywLazyXmlFormatter:
    """
    Helper for formatting XML in progress messages
    """

    def __init__(self, xml_el):
        """
        Init slots of self
        """
        self.xml_el = xml_el

    def __str__(self):
        """
        Self's element as a multi-line string
        """
        from xml.dom import minidom
        from xml.etree.ElementTree import tostring

        # Convert to minidom xml
        md_xml_el = minidom.parseString(tostring(self.xml_el, "utf-8"))

        # Format neatly
        res = "\n" + md_xml_el.toprettyxml(indent="  ")

        # Remove blank lines (some servers add a lot)
        res = re.sub("\n\s*\n", "\n", res)

        return res


class MywOgcDatasourceEngine(MywDatasourceEngine):
    """
    Engine for retrieving data from an OGC WFS datasource.
    """

    # See http://www.opengeospatial.org/standards

    # Support version 1.1.0
    # A half hearted attempt is made to support 2.0.0 as well, but it is not complete.

    # We should read the following from returned XML document, but ElementTree does not allow us to retrieve this info
    # ENH: download and use XML.etree instead of ET ?
    NAMESPACE = {
        "ows": "http://www.opengis.net/ows",
        "wfs": "http://www.opengis.net/wfs",
        "wms": "http://www.opengis.net/wms",
        "xlink": "http://www.w3.org/1999/xlink",
    }

    # About IDs
    # All GML features 'inherit' from gml:AbstractFeatureType, which defines properties gml:id, gml:name,
    # gml:description, gml:location and gml:boundedBy (see GML 3.1 spec $8.2.1.1) The gml:id field is guaranteed
    # mandatory and unique. The gml:id (uniquely) appears in the
    # XML as an attribute of the feature element rather than a property element. This allows the Feature datamodel to
    # also contain a property called 'id' in its namespace which may, or may not, be unique or mandatory (we can't tell).

    def __init__(
        self,
        url,
        wfs_params=None,
        wfs_version=None,
        username=None,
        password=None,
        user_agent=None,
        progress=MywProgressHandler(),
        prefer_get=True,
    ):
        """
        Init slots of self

        URL is the URL of the datasource
        PARAMS are extra parameters to add to the URL in each request
        VERSION is the server's WFS version
        USER_AGENT identifies the brower that originated the request
        PROGRES is a callback for progress messages
        PREFER_GET If true, make requests to the server using GET (rather than POST) if supported
        """

        if url.endswith("?"):
            url = url[:-1]

        super(MywOgcDatasourceEngine, self).__init__(
            url, username=username, password=password, user_agent=user_agent, progress=progress
        )

        self.wfs_params = wfs_params or {}
        self.wfs_version = wfs_version or "1.1.0"
        self.__prefer_get = prefer_get

        self.logged_in = False
        self.__capabilities_xml = None  # Init lazily

    # ==============================================================================
    #                                  CAPABILITIES
    # ==============================================================================

    def properties(self, full=False):
        """
        Details of self's server (a dict)
        """

        props = OrderedDict()

        props.update(self._basic_properties())
        props["services"] = ",".join(list(self.services().keys()))

        if full:
            props.update(self._provider_info())

        return props

    def _basic_properties(self):
        """
        Definition of self's service
        """

        xml_props = OrderedDict()
        xml_props["title"] = "ows:Title"
        xml_props["type"] = "ows:ServiceType"
        xml_props["version"] = "ows:ServiceTypeVersion"

        # Get capabilities from server
        sid_xml = self._capabilities_xml.find("ows:ServiceIdentification", self.NAMESPACE)
        if sid_xml is None:
            return {}

        return self._get_xml_props(sid_xml, xml_props, True)

    def _provider_info(self):
        """
        Information about service provider
        """
        # ENH: Could get more info

        xml_props = OrderedDict()
        xml_props["owner"] = "ows:ProviderName"
        xml_props["contact_name"] = "ows:ServiceContact/ows:IndividualName"
        xml_props["contact_position"] = "ows:ServiceContact/ows:PositionName"
        xml_props["phone_no"] = "ows:ServiceContact/ows:ContactInfo/ows:Phone/ows:Voice"
        xml_props[
            "email"
        ] = "ows:ServiceContact/ows:ContactInfo/ows:Address/ows:ElectronicMailAddress"

        # Get capabilities from server
        sp_xml = self._capabilities_xml.find("ows:ServiceProvider", self.NAMESPACE)

        if sp_xml is None:
            return {}

        return self._get_xml_props(sp_xml, xml_props, True)

    def services(self):
        """
        Information about supported services
        """

        services = OrderedDict()

        for op_elem in self._capabilities_xml.findall(
            ".//ows:OperationsMetadata/ows:Operation", self.NAMESPACE
        ):
            service = {}
            service["name"] = op_elem.attrib.get("name", None)

            # HTTP request
            get_url_elem = op_elem.find("ows:DCP/ows:HTTP/ows:Get", self.NAMESPACE)
            service["get_url"] = get_url_elem.attrib.get("{http://www.w3.org/1999/xlink}href")
            post_url_elem = op_elem.find("ows:DCP/ows:HTTP/ows:Post", self.NAMESPACE)
            service["post_url"] = get_url_elem.attrib.get("{http://www.w3.org/1999/xlink}href")

            # Parameters
            params = {}
            for param_elem in op_elem.findall("ows:Parameter", self.NAMESPACE):
                name = param_elem.attrib.get("name")
                values = []
                for value_elem in param_elem.findall("ows:Value", self.NAMESPACE):
                    values.append(value_elem.text)
                params[name] = values
            service["params"] = params
            services[service["name"]] = service

        return services

    def all_feature_type_infos(self):
        """
        The feature types provided by self's server

        Returns a list of dicts, keyed by fully qualified feature type name"""

        # ENH: Omits ows:Keywords and ows:WGS84BoundingBox wfs:DefaultSRS elements for each feature
        if self.wfs_version == "2.0.0":
            xml_props = {"name": "Name", "title": "Title", "description": "Abstract"}

            element_search = "FeatureTypeList/FeatureType"

        else:
            xml_props = {"name": "wfs:Name", "title": "wfs:Title", "description": "wfs:Abstract"}

            element_search = ".//wfs:FeatureTypeList/wfs:FeatureType"

        # Parse wfs:FeatureTypeList element
        feature_infos = {}

        for feature_type_xml in self._capabilities_xml.findall(element_search, self.NAMESPACE):
            feature_info = self._get_xml_props(feature_type_xml, xml_props)
            feature_type = feature_info["name"]
            feature_infos[feature_type] = feature_info

        return feature_infos

    @property
    def _capabilities_xml(self):
        """
        The XML capabilities document for this server
        """

        if self.__capabilities_xml == None:

            # Get capabilities
            self.ensure_logged_in()
            doc = self.send_wfs_get_request("GetCapabilities")

            # Convert XML to an element tree
            self.__capabilities_xml = ET.fromstring(doc)
            self.progress(9, "Capabilities:", MywLazyXmlFormatter(self.__capabilities_xml))

            # Check for an error
            if "ExceptionReport" in self._capabilities_xml.tag:
                d = self._get_xml_props(
                    self._capabilities_xml, {"text": "ows:Exception/ows:ExceptionText"}
                )
                raise MywError(d.get("text"))

        return self.__capabilities_xml

    def _get_xml_props(self, elem, xml_props, ordered=False):
        """
        Extract properties from xml document ELEM

        XML_PROPS is a dictionary, the keys are the keys by which the properties are to be referenced
        in the returned dictionary (i.e. they are the keys you "want"). The values are the XPath specification
        the element containing the value relative to ELEM. Only uniquely identified properties can be handled
        (if not, the first element matching the XPath spec is selected), and the value of the property must be
        the text inside the element, rather than an attribute.
        """

        res = OrderedDict() if ordered else {}

        for key, value in xml_props.items():
            ce = elem.find(value, self.NAMESPACE)
            if ce is not None:
                res[key] = ce.text
            if not res.get(key):
                res[key] = ""

        return res

    # ==============================================================================
    #                               FEATURE TYPES ACCESS
    # ==============================================================================

    def get_feature_type_def(self, feature_type, force=False):
        """
        Request and return data for a feature type definition

        If FORCE is True, we ignore whether the feature is "advertised" (This can be valid, for example
        when a feature name is un-advertised but revealed through its presence in a LayerGroup)"""

        # Cehck feature is known to server
        # ENH: Remove this check (can be slow)?
        if not force:
            features = self.all_feature_type_infos()
            feature = features.get(feature_type)
            if feature == None:
                raise MywError("Feature tpe not known to server:", feature_type)

        # Send the 'describe feature type' request
        doc = self._send_describe_feature_type_request(feature_type)

        # Unpick response
        try:
            ft_xml = ET.fromstring(doc)
            self.progress(8, "Feature definition:", MywLazyXmlFormatter(ft_xml))
        except ET.ParseError as cond:
            raise MywError("Server returned bad XML:", cond)

        if "ExceptionReport" in ft_xml.tag:
            raise MywError(doc)

        # Unpick feature definition
        feature_def = self._build_feature_info_from(feature_type, ft_xml)

        if not feature_def:
            raise MywError("Cannot find definition for feature:", feature_type)

        return feature_def

    def _send_describe_feature_type_request(self, feature_type):
        """
        Do a DescribeFeatureType request as a GET request

        OPERATION - the data for a DFT request (obtained from GetCapabilities)
        FEATURE_TYPE - the type to do the request on
        returns the servers response"""

        self.progress(2, "Getting feature definition:", feature_type)

        service = self._find_service(self.services(), "DescribeFeatureType")

        if service["get_url"] and (self.__prefer_get or not service["post_url"]):

            url = service["get_url"]  # We are making a 'GET' request # ENH: Use find service?

            self.ensure_logged_in()
            return self.send_wfs_get_request(service["name"], TypeName=feature_type)

        elif service["post_url"]:

            dft = ET.Element(
                service["name"], attrib={"version": self.wfs_version, "service": "WFS"}
            )
            tne = ET.SubElement(dft, "TypeName")
            tne.text = feature_type

            # Convert it to a string and send it
            post_str = ET.tostring(dft)
            post_url = service["post_url"]

            self.ensure_logged_in()
            return self.send_post_request(post_url, post_str, content_type="application/xml")

        else:
            raise MywError(
                "Cannot determine URL for service: DescribeFeatureType (not supported by this server?)"
            )

    def _build_feature_info_from(self, feature_type, ft_xml):
        """
        Build a feature info list from raw response FT_XML

        Field order from server must be preserved where possible. This is not possible
        with inherited properties. If you look at the field order in Geoserver, for example,
        inherited properties could be interleaved with explicit properties and there is no
        sequence information provided. So inherited properties come first.
        """

        xsd_ns = {"xsd": "http://www.w3.org/2001/XMLSchema"}
        schema_xml = ft_xml.find("xsd:element", xsd_ns)

        if schema_xml is None:
            return None  # ENH: EXTDD: Raise an error?

        feature_def = OrderedDict()
        feature_def["name"] = feature_type
        feature_def["external_name"] = schema_xml.attrib.get("name")

        field_defs = []

        # Check for GML not laid out in the way we expect. Seems to be the case with some forms of feature groups
        extension = ft_xml.find("xsd:complexType/xsd:complexContent/xsd:extension", xsd_ns)
        if extension is None:
            raise MywError("Cannot find extension information for feature: ", feature_type)

        # Add info from 'element' elements
        for elem in extension.findall("xsd:sequence/xsd:element", xsd_ns):
            props = self._parse_xml_field_def(elem, xsd_ns)
            prop_name = props["name"]

            # Property called fid appears to be a deprecated alternative to gml:id (GML 3.1 $8.2.1.1)
            if prop_name == "fid":
                continue

            # Set it
            field_defs.append(props)

        # Create default fields id, location etc (at start)
        if extension.attrib["base"] == "gml:AbstractFeatureType":
            field_defs = self.__inherited_props(field_defs) + field_defs

        feature_def["fields"] = self._featureFieldDefs(field_defs)

        return feature_def

    def _featureFieldDefs(self, properties):
        """
        Convert PROPERTIES to myworld-style field defs
        """
        # ENH: Build field defs direct

        field_defs = []
        for p in properties:
            field_def = OrderedDict()

            field_def["name"] = p["name"]
            field_def["type"] = p["type"]
            field_def["external_name"] = p.get("external_name", p["name"])

            if p.get("mandatory", False):
                field_def["mandatory"] = True

            if p.get("key", False):
                field_def["key"] = True

            if p.get("enum") is not None:
                self.progress("error", "Enumeration in property {} ignored".format(p["name"]))

            field_defs.append(field_def)

        return field_defs

    def __inherited_props(self, field_defs):
        """
        Build default field definitions

        GML Features must 'inherit' (loosely speaking) from gml:AbstractFeatureType (see GML 3.1
        Spec $8.2.6). This class defines the following properties: gml:id, gml:name, gml:description,
        gml:location, gml:boundedBy (GML 3.1 spec $8.2.1.1 ).

        Apart from the gml:id which is mandatory, if the feature has appropriate properties then a OGC
        server can interpret these as being part of the superclass. So, for example,
        the Geoserver feature cite:Outage has a name and location properties in the DB which thus appear in the
        GetFeature response as gml: attributes and don't appear in the DescribeFeatureType response
        (because they are implied by the inheritance of  gml:AbstractFeatureType).

        However, the DescribeFeatureType response does not report such attributes if the underlying data has
        a geometry field. In this case the DescribeFeatureType response states that inherits from
        AbstractFeatureType (as the GML spec mandates) even though some of the properties on AFT cannot be populated
        or, in the case of gml:boundedBy, could be but are not.
        """

        # Get names of explicit properties
        field_names_lc = []
        has_geom_field = False

        for field_props in field_defs:
            field_name = field_props["name"]

            field_names_lc.append(field_name.lower())

            if field_props["type"] in ["point", "linestring", "polygon"]:
                has_geom_field = True

        inherited_field_defs = []

        # GML features have a mandatory gml:id property that appears as an attribute
        # in the feature data, but not in the DescribeFeatureType response.
        inherited_field_defs.append(
            self.__build_field_def("gml_id", "string", external_name="gml_id", key=True)
        )

        # Create a property 'name', if it doesn't already exist
        # ENH: Is this really sensible?
        if not "name" in field_names_lc:
            inherited_field_defs.append(self.__build_field_def("name", "string"))

        # Create a location geometry property to map gml:location into.
        # Note that gml:location has been deprecated (GML 3.1 spec $8.2.2.2)
        # ENH: Warn that we are doing this?
        if not has_geom_field:
            inherited_field_defs.append(self.__build_field_def("location", "point"))

        return inherited_field_defs

    def __build_field_def(self, name, type, external_name=None, mandatory=None, key=False):
        """
        Helper to construct a field definition (as an ordered dict, for neatness)
        """

        # Deal with defaults
        if mandatory == None:
            mandatory = key
        if not external_name:
            external_name = self.external_name_for(name)

        props = OrderedDict()
        props["name"] = name
        props["type"] = type
        props["external_name"] = external_name

        if mandatory:
            props["mandatory"] = True
        if key:
            props["key"] = True

        return props

    # myWorld only supports point, linestring or polygon (what about MultiPointPropertyType)
    # See Table 1, p36 of the GML 3.1 implementation specification from OGC (for geometric types)
    # and section 3.2 here:
    # https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/datatypes.html#built-in-datatypes
    # This list is not complete ...
    SCHEMA_TO_JSON_TYPE_XML_PROPS = {
        "PointPropertyType": "point",
        "MultiLineStringPropertyType": "linestring",
        "LineStringPropertyType": "linestring",
        "CurvePropertyType": "linestring",
        "MultiCurvePropertyType": "linestring",
        "SurfacePropertyType": "polygon",
        "MultiSurfacePropertyType": "polygon",
        "string": "string",
        "normalizedString": "string",
        "boolean": "boolean",
        "decimal": "double",
        "integer": "integer",
        "long": "integer",
        "int": "integer",
        "short": "integer",
        "byte": "integer",
        "float": "double",
        "double": "double",
        "date": "timestamp",
        "dateTime": "timestamp",
    }

    def _parse_xml_field_def(self, elem, xsd_ns):
        """
        Creates a field definition dict XML field definition ELEM (an <xsd:element>)

        Returns a dict similar to a .def except:
          - source properties 'id' and 'nillable' are included despite having no myWorld equivalents
          - optional property 'enum' contains a list of possible values (and currently no name).
        """
        # Some documentation of <xsd:element> here - TODO - find it in the W3C document
        # https://msdn.microsoft.com/en-us/library/ms256118%28v=vs.110%29.aspx

        prop = OrderedDict()
        elem_attrs = elem.attrib

        # Copy simple properties across
        for prop_prop in ["name", "nillable", "id", "default"]:
            prop[prop_prop] = elem_attrs.get(prop_prop, None)

        prop["external_name"] = self.external_name_for(prop["name"])

        # Deduce the MANDATORY property
        # Useful reference for the meaning of minOccurs (and its absense):
        # http://stackoverflow.com/questions/4821477/xml-schema-minoccurs-maxoccurs-default-values
        if elem_attrs.get("minOccurs") is None or int(elem_attrs["minOccurs"]) > 0:
            prop["mandatory"] = True

        # Deduce the TYPE property
        # If the element has a simpleType child, then it is not  an Xsd base type
        # These are used to specify size-limited fields and enumerations, and more see
        # https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/datatypes.html#dc-defn
        st_restriction = elem.find("xsd:simpleType/xsd:restriction", xsd_ns)
        if st_restriction is None:
            prop_type = elem_attrs.get("type", None)
        else:
            prop_type = st_restriction.attrib.get("base", None)

        # types may come with a namespace qualifier (xs: or xsd: for XMLSchema, gml: for GML), remove it
        prop_type = prop_type.split(":")[-1]
        if not prop_type in self.SCHEMA_TO_JSON_TYPE_XML_PROPS:
            prop["type"] = "point"
            self.progress(
                "warning",
                "Assuming type '{}' for geometry field '{}'".format(prop["type"], prop["name"]),
            )
        else:
            prop["type"] = self.SCHEMA_TO_JSON_TYPE_XML_PROPS.get(prop_type, None)

        if st_restriction is not None:
            ml = st_restriction.find("xsd:maxLength", xsd_ns)
            if ml is not None:
                prop["type"] = "{}({})".format(prop["type"], ml.attrib.get("value", ""))

        # Deduce the ENUM property
        if st_restriction is not None:
            # https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/datatypes.html#rf-enumeration
            # example above shows human readable and internal values, a name and description.
            # Microsofts example here: https://msdn.microsoft.com/en-us/library/ms256219%28v=vs.110%29.aspx#
            # shows that these are optional, in which case they would need to be synthesised
            # The code below just stores the internal values (which is wrong).
            # TODO: store name, annotation/documentation, and values (external values preferred)
            # TODO: I haven't found an example to test this on...
            enum_list = []
            for enum in st_restriction.findall("xsd:enumeration", xsd_ns):
                ev = enum.attrib["value"]
                if ev:
                    enum_list.append(ev)

            if len(enum_list) > 0:
                if prop["type"] != "string":
                    self.progress(
                        "error",
                        "Enumerations based on type {} are not supported".format(prop["type"]),
                    )
                else:
                    prop["enumeration"] = enum_list

        # TODO: GML equivalents of range, unit ... ?
        # The element may have a complexType - which I guess might be a reference or reference_set ?
        return prop

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

        # Check for no such feature
        if not feature_type in self.all_feature_type_infos():
            raise MywError("Feature not known:", feature_type)

        # Get data
        doc = self._send_features_request(feature_type, geom_name, bounds, limit)

        # Unpick response
        feature_recs_xml = ET.fromstring(doc)
        self.progress(8, "Feature data:", MywLazyXmlFormatter(feature_recs_xml))

        # Check for error
        if "ExceptionReport" in feature_recs_xml.tag:
            self.progress("error", doc)

        # Extract records
        recs = self._extract_feature_data(feature_type, feature_recs_xml, geom_format)
        recs = self.normalise_feature_data(recs)

        # Yield them
        if recs:
            yield recs

    def _send_features_request(self, feature_type, geom_name, bounds, limit=None):
        """
        Perform a GetFeature request using a GET or POST

        Returns features of type FEATURE_TYPE, whose GEOM_NAME geometries interact with BOUNDS.
        """
        # ENH: Limit unused

        self.progress(2, "Getting features data for:", feature_type, "within", bounds)

        service = self._find_service(self.services(), "GetFeature")

        if service["get_url"] and (self.__prefer_get or not service["post_url"]):

            url = service["get_url"]
            if not url.endswith("?"):
                url += "?"

            args = {
                "SERVICE": "WFS",
                "REQUEST": service["name"],
                "VERSION": self.wfs_version,
                "TypeName": feature_type,
                "srsName": "EPSG:4326",
            }

            full_url = url + urllib.parse.urlencode(args)

            # urlencode uses urllib.quote_plus(), which OGC servers don't seem to like. So we use quote()
            # to convert space characters to %20
            if bounds:
                bounds_filter = urllib.parse.quote(
                    ET.tostring(self.__filter_xml(None, geom_name, bounds))
                )
                full_url += "&FILTER=" + bounds_filter

            self.ensure_logged_in()
            return self.send_get_request(full_url)

        elif service["get_post"]:

            url = service["post_url"]

            # Build the XML Document
            gfe = ET.Element(
                "wfs:GetFeature",
                attrib={
                    "version": self.wfs_version,
                    "service": "WFS",
                    "xmlns:wfs": "http://www.opengis.net/wfs",
                    "xmlns:gml": "http://www.opengis.net/gml",
                    "xmlns:ogc": "http://www.opengis.net/ogc",
                },
            )

            qe = ET.SubElement(
                gfe, "wfs:Query", attrib={"typeName": feature_type, "srsName": "EPSG:4326"}
            )
            if bounds:
                self.__filter_xml(qe, geom_name, bounds)

            # Convert it to a string and send it
            post_str = ET.tostring(gfe)

            return self.send_post_request(url, post_str, content_type="application/xml")

        else:
            raise MywError(
                "Cannot determine URL for service: GetFeature (not supported by this server?)"
            )

    def _extract_feature_data(self, feature_type, feature_recs_xml, geom_format="wkb"):
        """
        Return feature records from GetFeature response FEATURE_RECS_XML

        FEATURE_RECS_XML is the root XML element of the response
        """
        features = []
        resp_ns = {"gml": "http://www.opengis.net/gml", "wfs": "http://www.opengis.net/wfs"}

        feature_name = feature_type.split(":")[-1]

        # Case: featureMembers element with multiple features
        for elem in feature_recs_xml.findall("gml:featureMembers", resp_ns):
            features += self._extract_feature_data_from(elem, feature_name, resp_ns, geom_format)

        # Case: Mutliple featureMember elements, each one with a feature in each
        for elem in feature_recs_xml.findall("gml:featureMember", resp_ns):
            features += self._extract_feature_data_from(elem, feature_name, resp_ns, geom_format)

        return features

    def _extract_feature_data_from(self, member, feature_name, resp_ns, geom_format):
        """
        Extacrt feature records from XML members that are children of MEMBER that have the
        FEATURE_NAME as their tag (ignoring the namespace)
        """
        # Note that the GML does not list *every* property for every feature
        # So the list of properties in features[0] may be a different subset than those in
        # features[1] etc.
        # Features are returned as elements with a namespace that is specific to the server.
        # Since ElementTree won't return us the namespaces in the XML document so we loop over *all*
        # child elements and find elements that match (rather than use findall() which requires the
        # unknown namespace)

        features = []

        for child in member:
            if (
                feature_name in child.tag
            ):  # Ignores the Namespace (which we can't get from ElementTree anyway)
                feature_elem = child
                feature = OrderedDict()

                # use the gml:id attribute as our key field
                feature["gml_id"] = feature_elem.attrib.get("{http://www.opengis.net/gml}id", None)
                for field_elem in feature_elem:
                    field_name = field_elem.tag.split("}")[1]
                    feature[field_name] = self._extract_field_value(
                        field_elem, resp_ns, geom_format
                    )

                features.append(feature)

        return features

    def _extract_field_value(self, field_elem, resp_ns, geom_format):
        """
        Reformat VALUE to format expected by myWorld
        """
        # ENH: Pass in expected typGet field type info and do this for timestamps only

        # Try as geometry
        geom = self._parse_geometry(field_elem, resp_ns, geom_format)
        if geom:
            return geom

        # Assume is attribute
        value = field_elem.text

        # Remove trailing Z from date values
        if value and isinstance(value, str) and value.endswith("Z"):
            try:
                dt = datetime.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
                value = dt.strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                pass

        return value

    def _parse_geometry(self, property_elem, resp_ns, geom_format):
        """
        Element PROPERTY_ELEM as a geometry (if possible)

        PROPERTY_ELEM - the XML element to read the geometry from
        RESP_NS - the Namespaces in the response
        """

        pos = property_elem.find("gml:Point/gml:pos", resp_ns)
        wkt = None

        if pos is not None:
            wkt = "POINT( {} )".format(self.__convert_coord_string(pos.text))

        # ENH - support MULTIPOINT ?
        if wkt is None:
            pos_list = property_elem.find("gml:LineString/gml:posList", resp_ns)
            if pos_list is not None:
                # convert to WKT
                wkt = "LINESTRING( {} )".format(self.__convert_coord_string(pos_list.text))

        if wkt is None:
            geom = property_elem.find("gml:MultiLineString", resp_ns)
            if geom is not None:
                wkt = "MULTILINESTRING("
                sep = ""
                for pos_list in geom.findall(
                    "./gml:lineStringMember/gml:LineString/gml:posList", resp_ns
                ):
                    wkt += "{}( {} )".format(sep, self.__convert_coord_string(pos_list.text))
                    sep = ","
                    wkt += ")"

        if wkt is None:
            geom = property_elem.find("gml:MultiCurve", resp_ns)
            if geom is not None:
                wkt = "MULTILINESTRING("
                sep = ""
                for pos_list in geom.findall(
                    "./gml:curveMember/gml:LineString/gml:posList", resp_ns
                ):
                    wkt += "{}( {} )".format(sep, self.__convert_coord_string(pos_list.text))
                    sep = ","
                    wkt += ")"

        # ENH - support POLYGON ?
        if wkt is None:
            geom = property_elem.find("gml:MultiSurface", resp_ns)
            if geom is not None:
                wkt = "MULTIPOLYGON("
                sep = ""
                # TODO - doesn't handle holes.
                for outers in geom.findall("./gml:surfaceMember/gml:Polygon/gml:exterior", resp_ns):
                    wkt += sep + "("
                    sep = ","
                    inner_sep = ""
                    for pos_list in outers.findall("./gml:LinearRing/gml:posList", resp_ns):
                        wkt += "{}({})".format(
                            inner_sep, self.__convert_coord_string(pos_list.text)
                        )
                        inner_sep = ","
                    wkt += ")"
                wkt += ")"

        # ENH: Duplicated with ESRI engine
        if wkt:
            if geom_format == "wkt":
                return wkt
            elif geom_format == "ewkt":
                return "SRID=4326;" + wkt
            else:
                return shapely.wkb.dumps(shapely.wkt.loads(wkt), hex=True)

        return None

    def __convert_coord_string(self, coords):
        """
        GML supplies coordinates as space separated, WKT wants space separated pairs with
        comma between each pair
        """
        numbers = re.split("\s+", coords.strip())
        rs = ""
        lsep = ""
        num_count = len(numbers)
        if num_count % 2 != 0:
            num_count -= 1

        # DON'T transpose x and y for latlong
        for i in range(0, num_count, 2):
            rs = rs + lsep + numbers[i] + " " + numbers[i + 1]
            lsep = ","
        return rs

    def __filter_xml(self, parent, geom_name, bounds):
        """
        Construct the bounds filter for the GetFeature query

        Searches for features whose GEOM_NAME geometries lies within or partially within BOUNDS
        BOUNDS is a string of the format <LowerLong>,<LowerLat> <UpperLong>,<UpperLat>
        PARENT is the (optional0 XML element to put this ML fragment into
        """

        if parent is None:
            fe = ET.Element(
                "ogc:Filter",
                attrib={
                    "xmlns:wfs": "http://www.opengis.net/wfs",
                    "xmlns:gml": "http://www.opengis.net/gml",
                    "xmlns:ogc": "http://www.opengis.net/ogc",
                },
            )
        else:
            fe = ET.SubElement(parent, "ogc:Filter", attrib={"xmlns": "http://www.opengis.net/ogc"})

        bbe = ET.SubElement(fe, "ogc:BBOX")
        pne = ET.SubElement(bbe, "ogc:PropertyName")
        pne.text = geom_name

        if self.wfs_version == "1.0.0":
            be = ET.SubElement(bbe, "gml:Box")
            ce = ET.SubElement(be, "gml:coordinates")
            ce.text = "{},{} {},{}".format(bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1])

        elif self.wfs_version == "1.1.0" or self.wfs_version == "2.0.0":
            ee = ET.SubElement(bbe, "gml:Envelope")
            ee.attrib["srsName"] = "EPSG:4326"
            lc = ET.SubElement(ee, "gml:lowerCorner")
            lc.text = "{} {}".format(bounds[0][0], bounds[0][1])
            uc = ET.SubElement(ee, "gml:upperCorner")
            uc.text = "{} {}".format(bounds[1][0], bounds[1][1])

        return fe

    # ==============================================================================
    #                               LAYER ACCESS
    # ==============================================================================

    def read_layers(self):
        """
        Get the available WMS map layers
        """

        # make the request
        self.ensure_logged_in()
        resp = self.send_get_request(
            self.base_url, SERVICE="WMS", VERSION="1.3.0", REQUEST="GetCapabilities"
        )

        # read and parse the response
        doc = ET.fromstring(resp)
        layer_defs = {}
        for layer in doc.findall("./wms:Capability/wms:Layer/wms:Layer", self.NAMESPACE):
            xml_props = {
                "name": "wms:Name",
                "title": "wms:Title",
                "abstract": "wms:Abstract",
                "crs": "wms:CRS",
            }
            layer_def = self._get_xml_props(layer, xml_props)
            layer_defs[layer_def["name"]] = layer_def

        return layer_defs

    def read_layer_def(self, layer_name):
        """
        Read the definition of LAYER_NAME
        """

        self.ensure_logged_in()
        resp = self.send_get_request(
            self.base_url,
            SERVICE="WMS",
            VERSION="1.1.1",
            REQUEST="DescribeLayer",
            LAYERS=layer_name,
        )

        doc = ET.fromstring(resp)
        layer_defs = {}
        for layer_elem in doc.findall("LayerDescription"):
            layer_def = {}
            for prop_name in ["name", "wfs", "owsURL", "owsType"]:
                layer_def[prop_name] = layer_elem.attrib.get(prop_name, None)
            layer_defs[layer_def["name"]] = layer_def

        return layer_defs

    # ==============================================================================
    #                                   HELPERS
    # ==============================================================================

    def ensure_logged_in(self):
        """
        Login to the server (if necessary)
        """

        if self.username and not self.logged_in:
            self.login(self.username, self.password)
            self.logged_in = True

    def login(self, username, password):
        """
        Login to the server as USERNAME
        """
        authinfo = urllib.request.HTTPPasswordMgrWithDefaultRealm()

        url = self.base_url.split("/")[2]
        authinfo.add_password(None, url, username, password)
        handler = urllib.request.HTTPBasicAuthHandler(authinfo)
        opener = urllib.request.build_opener(handler)

        # TODO: This installs 'globally' (for the lifetime of this python process?) - Is this OK?
        urllib.request.install_opener(opener)

    def send_wfs_get_request(self, request_type, **params):
        """
        Make a WFS GET request to URL

        Returns body of response"""

        full_params = {"SERVICE": "WFS", "VERSION": self.wfs_version, "REQUEST": request_type}
        full_params.update(self.wfs_params)
        full_params.update(params)

        return self.send_get_request(self.base_url, **full_params)
