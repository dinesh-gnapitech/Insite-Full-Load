# Copyright: IQGeo Limited 2010-2023

import geojson, re
from collections import OrderedDict
from sqlalchemy import inspect
from sqlalchemy.sql import null

from myworldapp.core.server.base.core.myw_error import (
    MywError,
    MywInternalError,
    MywUnknownFeatureTypeError,
)
from myworldapp.core.server.models.base import MywModelMixin

from .myw_reference import MywReference


class MywFeatureModelMixin(MywModelMixin):
    """
    Superclass for feature models

    Provides protocols for serialisation and de-serialisation.

    Requires slots _view to be set on construction (see MywFeatureTable)"""

    # Warning: Use '_' prefix to prevent clashes with record attributes e.g. ._id not .id()

    @classmethod
    def _key_column(self):
        """
        SQAlchemy column object for self's key field
        """

        return self.__table__.columns[self._descriptor.key_field_name]

    # ==============================================================================
    #                                   IDENT
    # ==============================================================================

    def __repr__(self):
        """
        String identifying self in tracebacks etc
        """

        return self.__ident__()

    def __ident__(self, full=True):
        """
        String identifying self in progress and error messages
        """

        # ENH: Find a cleaner way e.g. subclass for deltas
        if hasattr(self, "myw_delta") and full:
            return "{}({},{})".format(self.feature_type, self._id, self.myw_delta)
        else:
            return "{}({})".format(self.feature_type, self._id)

    def __ne__(self, other):
        """
        True if doesn't have same key as OTHER
        """
        #  Overridden to handle expunged
        return not self.__eq__(other)

    def __eq__(self, other):
        """
        True if has same key as OTHER
        """
        #  Overridden to handle expunged
        if other is None:
            return False
        return self.feature_type == other.feature_type and self._id == other._id

    def __hash__(self):
        """
        Hash based on feature type and key
        """
        return hash((self.feature_type, self._id))

    # ==============================================================================
    #                                 PROPERTIES
    # ==============================================================================

    @property
    def feature_type(self):
        """
        Returns self's feature type
        """
        # ENH: Make name safer (would be hidden by a field 'feature_type')

        return self._descriptor.name

    def _urn(self, **qualifiers):
        """
        Unique identifier of self within database

        If optional QUALIFIERS are supplied, they are included in the URN e.g.
          cable/123?from_pair=3&to_pair=7"""

        ref = MywReference(None, self.feature_type, self._id, qualifiers)

        return ref.urn()

    @property
    def _id(self):
        """
        Value of self's key field
        """

        return self[self._descriptor.key_field_name]

    # ==============================================================================
    #                                 SERIALISATION
    # ==============================================================================

    def asGeojsonFeature(
        self,
        cache=None,
        include_geo_geometry=False,
        include_lobs=True,
        include_display_values=False,
        include_titles=True,
        include_nulls=True,
        coord_sys=None,
        for_file=False,
        lang=None,
        fields=[],
    ):
        """
        Return self as a Geojson feature structure

        Optional CACHE is used to cache geo-world geometries between calls (for speed)"""

        # Deal with defaults
        # Note: Cannot add this as arg default
        if cache == None:
            cache = {}

        # Get names of special columns
        primary_geom_name = self._descriptor.primary_geom_name

        # Init properties
        properties = OrderedDict()
        id = None
        primary_geom = None
        secondary_geoms = {}
        display_values = OrderedDict()

        # Add stored fields
        for field_name, field_desc in list(self._descriptor.storedFields().items()):

            # Remember key value
            if field_desc.key:
                id = self[field_name]

            if fields and not field_name in fields:
                continue

            # Case: Geometry
            if field_desc.isGeometry():
                geom = self._field(field_name).geom(coord_sys=coord_sys)
                if field_name == primary_geom_name:
                    primary_geom = geom
                else:
                    secondary_geoms[field_name] = geom

            # Case: Attribute
            else:
                value = self[field_name]
                field_type_desc = field_desc.type_desc

                if value == None and not include_nulls:
                    continue

                # Apply output conversions
                if not for_file:
                    value = self._field(field_name).asJsonValue()

                # Set as attribute
                if include_lobs or not (field_type_desc.base in ["image", "file"]):
                    properties[field_name] = value

                # Build text to display in editor
                if include_display_values:
                    display_value = self._field(field_name).displayValue()
                    if display_value is not None:
                        display_values[field_name] = display_value

        # Build properties
        props = {"id": id, "geometry": primary_geom, "properties": properties}

        # Add myWorld group
        myw_props = props["myw"] = OrderedDict()
        myw_props["feature_type"] = self._descriptor.name
        if include_titles:
            title = self._title(lang)
            short_description = self._shortDescription(lang)
            if title:
                myw_props["title"] = title
            if short_description:
                myw_props["short_description"] = short_description

        # Add delta and delta owner title
        if hasattr(self, "myw_delta"):
            myw_props["delta"] = self.myw_delta
            if include_display_values:
                # Get delta owner title (from cache if possible, since this method will
                # be called in a loop for many features.)
                delta_owner_title = self._urnToTitle(cache, self.myw_delta)

                if delta_owner_title:
                    myw_props["delta_owner_title"] = delta_owner_title

        if hasattr(self, "myw_change_type"):
            myw_props["change_type"] = self.myw_change_type

        # Add bounds
        if primary_geom != None:
            try:
                props["bbox"] = primary_geom.bounds
            except Exception as e:  # ENH: Make this more specific
                print("Geometry bounds error for ", primary_geom, ": ", e)

        # Add myWorld specials
        if secondary_geoms:
            props["secondary_geometries"] = secondary_geoms
        if include_display_values:
            props["display_values"] = display_values  # ENH: Only if any values?

        # Add geo geometry
        if include_geo_geometry:
            (geo_geom, derived) = self._geoGeometry(cache)
            if geo_geom != None and derived:
                props["geo_geometry"] = geo_geom

        # Build feature
        return geojson.Feature(**props)

    def _title(self, lang=None):
        """
        Build self's title string
        """
        display_language = self._dd.language_parser.display_language(lang)
        missing_language_message = ".".join([self.feature_type, "title"])
        return self._evalExpressions(self._title_expr, display_language, missing_language_message)

    def _shortDescription(self, lang=None):
        """
        Build self's short description string
        """
        display_language = self._dd.language_parser.display_language(lang)
        return self._evalExpressions(self._short_description_expr, display_language, "")

    def _evalExpressions(self, expressions, language, missing_language_message):
        language_parser = self._dd.language_parser

        if not expressions:
            return ""
        if language is None or language not in expressions:
            return missing_language_message

        return self._evalExpression(expressions[language], language)

    def _evalExpression(self, expr_els, lang):
        """
        Build a string by substituting attributes from self into parsed expression EXPR_ELS

        EXPR_EL is a list of tuples, as returned by MywExpressionParser.parse()"""

        text = ""
        for (el_type, value) in expr_els:

            if el_type == "literal":
                text += value

            elif el_type == "field":
                text += self._evalFieldValue(value, lang)

            else:
                raise MywInternalError("Unknown expression element type:", el_type)

        return text

    def _evalFieldValue(self, field_name, lang):
        """
        Returns field value as a unicode string"""

        field = self._field(field_name)
        if field is None:
            return ""

        display_value = self[field_name]
        if display_value is None:
            return ""

        field_desc = field.desc

        # If field has precision and is float, round decimal points to correct significant figures
        if field_desc.display_format is not None and isinstance(display_value, float):
            try:
                display_format = field_desc.display_format.split(":")
                precision = int(display_format[0])
                display_value = round(display_value, precision)
            except ValueError:
                pass  # If incorrect format for display_format give, let it pass (without rounding)

        # If field has an enumerator, use the enumerator's display value
        if field_desc.enum is not None:
            display_value = self._evalEnumDisplayValue(field_name, lang)

        # If field is timestamp, remove microseconds for display
        if field_desc.type == "timestamp":
            display_value = display_value.replace(microsecond=0)

        # If field has unit, append to string
        if field_desc.unit is not None:
            display_value = str(display_value) + str(field_desc.unit)

        return str(display_value)

    def _evalEnumDisplayValue(self, field_name, lang=None):
        """
        Returns enumerator display value for field as a unicode string
        Resolves any internationalisation stored for that enum value."""

        field_value = self[field_name]
        if field_value is None:
            return ""

        default = field_value

        feature_desc = self._descriptor
        if not hasattr(feature_desc, "enum_display_values"):
            return default

        enum_display_values = feature_desc["enum_display_values"]
        if not field_name in enum_display_values:
            return default

        field_enum_values = enum_display_values[field_name]
        if not field_value in field_enum_values:
            return default

        enum_display_value = field_enum_values[field_value]

        # Use default language if none is provided.
        if lang == None:
            lang = self._dd.default_language

        # evaluate multi-language strings
        if lang is not None and isinstance(enum_display_value, str):
            language_parser = self._dd.language_parser
            missing_lang_message = "{%s}" % ".".join(
                [self._field(field_name).desc.enum, self[field_name]]
            )

            enum_display_value = language_parser.parse(
                enum_display_value, missing_lang_message, lang
            )

        return enum_display_value

    def _geoGeometry(self, result_cache={}, visiting=[]):
        """
        The geometry representing SELF's location in the 'geo' world

        For internals objects, navigates through self's parent
        worlds until a 'geo' geom is found.

        RESULT_CACHE is a dict of result tuples, keyed by feature urn

        Returns:
          GEOM     Shapely geometry defining self's location in geo world
          DERIVED  True if geom was derived by navigation"""

        # ENH: Return the geo world object instead

        geom = None

        # Get self's URN
        matches = re.search("(.+)YY(.+)YY(.+)$", str(self._id))
        if matches and matches.lastindex == 3:
            fid = matches.group(3)
        else:
            fid = self._id

        self_urn = self.feature_type + "YY" + str(fid)

        # Check for self's geo geom already in cache
        if self_urn in result_cache:
            return result_cache[self_urn]

        # For each geom field on self ..
        self_worlds = set()
        for geom_field_name, world_field_name in list(self._geom_field_info.items()):

            # Get the world in which the geometry resides
            if world_field_name:
                geom_world = self[world_field_name]
            else:
                geom_world = "geo"

            if not geom_world:
                continue

            # If in geo world .. use it
            if geom_world == "geo":
                geom = self._field(geom_field_name).geom()
                if geom:
                    result_cache[self_urn] = (geom, False)
                    return result_cache[self_urn]

            # Add world to list for scanning later
            # ENH: Only if geom field is populated
            self_worlds.add(geom_world)

        # Prevent infinite recursion
        visiting.append(self_urn)

        # For each world in which self has a geom ..
        geom = None
        for world_name in self_worlds:

            # Build URN for world owner (handling broken urls etc)
            matches = re.search(".*?/(.*?)YY(.*?)YY(.*?)$", world_name)
            if not matches or matches.lastindex != 3:
                continue

            owner_type = matches.group(2)
            owner_id = matches.group(3)
            owner_urn = owner_type + "YY" + owner_id

            # Check for already have geo geom for world owner
            if owner_urn in result_cache:
                geom = result_cache[owner_urn][0]
                break

            # Prevent infinite recursion
            if owner_urn in visiting:
                continue

            # Get table for world owner (skipping unknown feature types)
            try:
                owner_table = self._view.table(owner_type)
            except MywUnknownFeatureTypeError:
                print("Unknown world owner type:", owner_type)  # ENH: Use progress
                continue

            # Get world owner record (handling different key models)
            owner = owner_table.get(owner_id)
            if not owner:
                urn_id = matches.group(1) + "YY" + owner_type + "YY" + owner_id
                owner = owner_table.get(urn_id)

            if not owner:
                continue

            # Find its geo_geom
            (geom, derived) = owner._geoGeometry(result_cache, visiting=visiting)
            break

        result_cache[self_urn] = (geom, True)  # ENH: What if self_worlds empty?

        visiting.pop()
        return result_cache[self_urn]

    def _urnToTitle(self, cache, urn):
        """
        retrieve titles by URN, use cache for fewer reads.

        note: raises ValueError if urn doesn't resolve to a feature."""

        urn_with_suffix = urn + "_title"

        delta_owner_title = cache.get(urn_with_suffix, None)

        if delta_owner_title is None:
            delta_owner = self._view.get(urn)

            try:
                delta_owner_title = delta_owner._title()
            except AttributeError:
                # delta_owner is None, which means it was likely deleted.
                # Store the error message in the cache, for next time this ex-delta comes up:
                delta_owner_title = "Bad reference: " + urn

            cache[urn_with_suffix] = delta_owner_title

        return delta_owner_title

    # ==============================================================================
    #                                 DE-SERIALISATION
    # ==============================================================================

    def updateFrom(self, feature, **opts):
        """
        Updates self with values from FEATURE (a geojson.Feature, record or dict)

        Properties of self not mentioned in FEATURE are left
        unchanged. Properties in FEATURE not in self are ignored.

        OPTS define data format etc of FEATURE (see updateFromDict())"""
        # ENH: Use OPTS in all calls

        if isinstance(feature, geojson.Feature):
            self.updateFromGeoJSON(feature)
        elif isinstance(feature, MywFeatureModelMixin):
            self.updateFromRec(feature)
        else:
            self.updateFromDict(feature, **opts)

    def updateFromGeoJSON(self, feature):
        """
        Updates self with values from FEATURE (a geojson.Feature)

        Includes support for myWorld GeoJSON extensions (secondary geoms)

        Properties of self not mentioned in FEATURE are left
        unchanged. Properties in FEATURE not in self are ignored.
        """

        # Set properties
        columns = self.__table__.columns
        for (prop, value) in list(feature.properties.items()):

            # Skip properties that don't match a database field
            if not prop in columns:
                continue
            field = self._field(prop)

            # Set field value
            self[prop] = field.asDbValue(value)

        # Set geometries
        primary_geom_name = self._descriptor.primary_geom_name
        # If 'geometry' isn't a key in feature, then is was not present in the request, and shouldn't be updated.
        if primary_geom_name is not None and "geometry" in feature:
            # if feature.geometry is present, and None, we will wipe the geom in the db to null. See case 19646.
            self[primary_geom_name] = self._field(primary_geom_name).asDbValue(feature.geometry)

        if "secondary_geometries" in feature:
            for field_name, geom in feature.secondary_geometries.items():
                self[field_name] = self._field(field_name).asDbValue(geom)

    def updateFromDict(
        self, values, truncate_strings=True, date_format=None, timestamp_format=None, coord_sys=None
    ):
        """
        Updates self with values from dict VALUES

        Properties of self not mentioned in VALUES are left
        unchanged. Properties in VALUES not in self are ignored.

        Optional TRUNCATE_STRINGS is True, strings that are too long for the
        database field are silectly truncate_stringsd. Optional DATE_FORMAT
        and TIMESTAMP_FORMAT are Python-style format strings."""

        # For each property ..
        for (prop, value) in list(values.items()):

            # Skip properties that don't match a database field
            if not prop in self._descriptor.storedFields():
                continue

            # Cast value to internal representation
            field = self._field(prop)
            base_type = field.desc.type_desc.base

            if base_type == "date":
                self[prop] = field.asDbValue(value, date_format)
            elif base_type == "timestamp":
                self[prop] = field.asDbValue(value, timestamp_format)
            elif base_type == "string":
                self[prop] = field.asDbValue(value, truncate_strings)
            elif base_type in ["point", "linestring", "polygon"]:
                self[prop] = field.asDbValue(value, coord_sys)
            else:
                self[prop] = field.asDbValue(value)

    def updateFromRec(self, rec):
        """
        Updates self from corresponding fields in record REC (where they exist)

        REC can be a feature record or raw SQLAlchemy record"""

        # For each stored field .. if matching column, copy its value
        for name, desc in list(self._descriptor.fields.items()):

            if not desc.isStored():
                continue

            if not name in rec.__table__.columns:
                continue

            value = getattr(rec, name)
            # when updating from existing records, convert None to NULL otherwise default values get used (and not match the value from REC)
            if (
                value is None
                and name != self._descriptor.key_field_name
                and not inspect(rec).transient
            ):
                value = null()

            self[name] = value

    # ==============================================================================
    #                                  FIELD ACCESSORS
    # ==============================================================================

    def primaryGeometry(self):
        """
        Self's primary geometry, as an in-memory object

        Returns a MywGeometry or None"""

        return self._primary_geom_field.geom()

    @property
    def _primary_geom_field(self):
        """
        Field accessor for self's primary geometry

        Returns a MywGeometryField"""

        return self._field(self._descriptor.primary_geom_name)

    def _field(self, field_name):
        """
        Wrapper object for accessing self's field FIELD_NAME

        Returns a MywField objects that provides myWorld-specific behavour"""

        field_desc = self._descriptor.fields.get(field_name)

        if not field_desc:
            raise MywError(self.feature_type, ": No such field:", field_name)

        accessor_class = field_desc.accessorClass()

        return accessor_class(self, field_name)

    # ==============================================================================
    #                                   OTHER
    # ==============================================================================

    def _clone(self, include_key=False):
        """
        Returns detached copy of self
        """

        # ENH: Neater to use expunge() + make_transient()?

        tab = self._view.table(self.feature_type)

        rec = tab.model()

        for fld, fld_desc in list(self._descriptor.storedFields().items()):
            if fld_desc.key and not include_key:
                continue

            rec[fld] = self[fld]

        return rec

    def _differences(self, other, fields=None):
        """
        Names of the fields of self have a difference value in OTHER

        OTHER is a record of the same type as self"""

        fields = fields or list(self._descriptor.storedFields().keys())

        diffs = []

        for fld in fields:
            fld_desc = self._descriptor.fields[fld]

            if fld_desc.isGeometry():
                left = self._field(fld).asWKB()
                right = other._field(fld).asWKB()
            else:
                left = self[fld]
                right = other[fld]

            if left == "":
                left = None
            if right == "":
                right = None

            if left != right:
                diffs.append(fld)

        return diffs
