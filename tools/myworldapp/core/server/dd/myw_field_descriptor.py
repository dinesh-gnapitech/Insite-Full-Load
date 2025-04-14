################################################################################
# Feature descriptor
################################################################################
# Copyright: IQGeo Limited 2010-2023

from collections import OrderedDict

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.db.myw_db_meta import MywDbType


# myWorld data types that map to geometry
# ENH: Get this from MywDbType .. or use MywDbType.isGeometry()
myw_geometry_types = ["point", "linestring", "polygon", "raster"]


class MywFieldDescriptor:
    """
    In-memory definition of a myWorld feature field
    """

    props = [
        "name",
        "type",
        "external_name",
        "value",
        "default",
        "key",
        "mandatory",
        "indexed",
        "enum",
        "generator",
        "unit",
        "display_unit",
        "unit_scale",
        "min_value",
        "max_value",
        "display_format",
        "read_only",
        "visible",
        "viewer_class",
        "editor_class",
        "new_row",
        "validators",
        "creates_world_type",
    ]

    def __init__(self, name, type, **props):
        """
        Init slots of self
        """

        # Flatten range property
        if "range" in props:
            value = props.pop("range")
            if not isinstance(value, list) or len(value) != 2:
                raise MywError("Field {}: Range must have exactly 2 values".format(name))
            props["min_value"] = value[0]
            props["max_value"] = value[1]

        # Avoid false positives when diffferencing (since DB maps '' to null)
        for prop, value in list(props.items()):
            if value == "":
                props[prop] = None

        # Ensure default value is a string (pre-4.1 compatability)
        default_value = props.get("default")
        if default_value != None and not isinstance(default_value, str):
            props["default"] = str(default_value)

        # Set slots
        self.name = name
        self.type = type
        self.external_name = props.pop("external_name", None)
        self.value = props.pop("value", None)
        self.default = props.pop("default", None)
        self.key = props.pop("key", False)
        self.mandatory = props.pop("mandatory", "false")
        self.indexed = props.pop("indexed", False)
        self.enum = props.pop("enum", None)
        self.generator = props.pop("generator", None)
        self.unit = props.pop("unit", None)
        self.display_unit = props.pop("display_unit", None)
        self.unit_scale = props.pop("unit_scale", None)
        self.min_value = props.pop("min_value", None)
        self.max_value = props.pop("max_value", None)
        self.display_format = props.pop("display_format", None)
        self.world_types = props.pop("world_types", None)
        self.read_only = props.pop("read_only", "false")
        self.visible = props.pop("visible", "true")
        self.viewer_class = props.pop("viewer_class", None)
        self.editor_class = props.pop("editor_class", None)
        self.new_row = props.pop("new_row", True)
        self.validators = props.pop("validators", None)
        self.creates_world_type = props.pop("creates_world_type", None)

        self._field_accessor = None  # Init lazily

        # conversions from previous formats. Some fields were converted from boolean to (string) expressions. We still want to accept boolean values
        for name in ["mandatory", "read_only", "visible"]:
            if self[name] == False:
                self[name] = "false"
            elif self[name] == True:
                self[name] = "true"

        # Check for unknown property
        if props:
            raise MywError(
                "Field {}.{}: Unknown property: {}".format(self.name, name, list(props.keys())[0])
            )

        # Handle defaults
        if not self.external_name:
            self.external_name = self._defaultExternalName()

    def _defaultExternalName(self):
        """
        Returns the default external name for self
        """

        geom_field_names = {"point": "Location", "linestring": "Route", "polygon": "Boundary"}

        # Case primary geometry
        if self.name == "the_geom" and self.type in geom_field_names:
            return geom_field_names[self.type]

        # Case system field
        # ENH: Do better
        if self.name.startswith("myw_"):
            return self.name

        # Case Other
        return self.name.title().replace("_", " ")

    def __repr__(self):
        """
        String representation of self for tracebacks etc
        """

        return "{}({},{})".format(
            self.__class__.__name__, self.name, self.type
        )  # ENH: Add non-default props

    def defaultCastToType(self):
        """
        Self's default value cast to self's data type

        Raises MywError if value is invalid for type"""

        # Check for not set
        if self.default == None:
            return None

        type_desc = self.type_desc

        # Check for dynamic date default
        # For integer defaults, default date is dynamically calculated by client, so don't save a default
        if type_desc.base == "date":
            try:
                int(self.default)
                return None
            except:
                pass

        # Cast value (if possible)
        try:
            return type_desc.convert(self.default)

        except ValueError as cond:
            msg = "Field {}: Bad default value for type '{}': '{}'".format(
                self.name, type_desc.base, self.default
            )
            raise MywError(msg)

    def definition(self):
        """
        Definition of self as a dict

        Omits properties where their value is the default value (to keep .def simple)"""

        field_def = OrderedDict()

        field_def["name"] = self.name
        field_def["external_name"] = self.external_name
        field_def["type"] = self.type

        if self.value is not None:
            field_def["value"] = self.value
        if self.key:
            field_def["key"] = self.key
        if self.enum:
            field_def["enum"] = self.enum
        if self.unit:
            field_def["unit"] = self.unit
        if self.display_unit:
            field_def["display_unit"] = self.display_unit
        if self.unit_scale:
            field_def["unit_scale"] = self.unit_scale
        if self.min_value is not None:
            field_def["range"] = [self.min_value, self.max_value]
        if self.generator is not None:
            field_def["generator"] = self.generator
        if self.default is not None:
            field_def["default"] = self.default
        if self.display_format is not None:
            field_def["display_format"] = self.display_format
        if self.mandatory != "false":
            field_def["mandatory"] = self.mandatory
        if self.indexed:
            field_def["indexed"] = self.indexed
        if self.world_types:
            field_def["world_types"] = self.world_types
        if self.read_only != "false":
            field_def["read_only"] = self.read_only
        if self.visible != "true":
            field_def["visible"] = self.visible
        if self.viewer_class:
            field_def["viewer_class"] = self.viewer_class
        if self.editor_class:
            field_def["editor_class"] = self.editor_class
        if self.new_row is not True:
            field_def["new_row"] = self.new_row
        if self.validators:
            field_def["validators"] = self.validators
        if self.creates_world_type:
            field_def["creates_world_type"] = self.creates_world_type

        return field_def

    # ==============================================================================
    #                                 PROPERTIES
    # ==============================================================================

    def isStored(self):
        """
        True if self is a stored field
        """

        return self.value == None

    def isGeometry(self):
        """
        True if self is a geometry field
        """

        return self.type in myw_geometry_types

    def defaultAsString(self):
        """
        Self's default value as a string
        """
        # Converts default value to database agnostic form

        # ENH: Store default as string in self

        value = self.default
        if value is not None and self.type in ["boolean", "double"]:
            value = str(value).lower()

        return value

    @property
    def type_desc(self):
        """
        Self's type descriptor (a MywDbType)
        """

        return MywDbType(self.type)

    def __getitem__(self, prop):
        """
        Convenience wrapper for accessing the value of self's property PROP
        """

        return getattr(self, prop)

    def __setitem__(self, prop, value):
        """
        Convenience wrapper for setting the value of self's property PROP
        """

        return setattr(self, prop, value)

    # ==============================================================================
    #                                 FIELD ACCESSOR
    # ==============================================================================

    def accessorClass(self):
        """
        The MywField class to use for accessing self's values
        """
        # Lazy evaluated (for speed)
        # ENH: Replace by proper SQLAlchemy field accessors?

        if not self._field_accessor:
            self._field_accessor = self.__accessorClass()

        return self._field_accessor

    def __accessorClass(self):
        """
        The MywField class to use for accessing self's values
        """
        # ENH: Move to MywField.newFor()

        from .myw_field import MywField
        from .myw_string_field import MywStringField
        from .myw_boolean_field import MywBooleanField
        from .myw_date_field import MywDateField
        from .myw_timestamp_field import MywTimestampField
        from .myw_file_field import MywFileField
        from .myw_image_field import MywImageField
        from .myw_numeric_field import MywNumericField
        from .myw_geometry_field import MywGeometryField
        from .myw_stored_reference_field import MywStoredReferenceField
        from .myw_calculated_reference_field import MywCalculatedReferenceField

        base_type = self.type_desc.base

        if self.isStored():
            if base_type == "string":
                return MywStringField
            if base_type == "boolean":
                return MywBooleanField
            if base_type == "date":
                return MywDateField
            if base_type == "timestamp":
                return MywTimestampField
            if base_type == "file":
                return MywFileField
            if base_type == "image":
                return MywImageField
            if base_type in ["double", "integer", "numeric"]:
                return MywNumericField
            if base_type in ["point", "linestring", "polygon"]:
                return MywGeometryField
            if base_type in ["reference", "reference_set", "foreign_key"]:
                return MywStoredReferenceField

        else:
            if base_type in ["reference", "reference_set"]:
                return MywCalculatedReferenceField

        return MywField

    # ==============================================================================
    #                                  DIFFERENCING
    # ==============================================================================

    def differenceStrs(self, other):
        """
        Descriptions of differences SELF -> OTHER
        """

        descs = []
        for prop, old_value, new_value in self.differences(other):

            if old_value == None:
                old_value = "null"
            if new_value == None:
                new_value = "null"

            desc = "{}({}->{})".format(prop, old_value, new_value)
            descs.append(desc)

        return descs

    def differences(self, other):
        """
        Yields properties of self that are different in OTHER

        Yields:
          PROP
          SELF_VALUE
          OTHER_VALUE"""

        for prop in self.props:
            if self.valueDiffers(self[prop], other[prop]):
                yield prop, self[prop], other[prop]

    def valueDiffers(self, value1, value2):
        """
        True if VALUE1 is different from VALUE2
        """
        # Provided to suppress jitter float comparisons on Oracle

        def floats_differ(a, b, sig_fig=10):
            return a != b and int(a * 10**sig_fig) != int(b * 10**sig_fig)

        if isinstance(value1, float) and isinstance(value2, float):
            return floats_differ(value1, value2)
        else:
            return value1 != value2

    # ==============================================================================
    #                                  VALIDATION
    # ==============================================================================

    def assertValid(self, warnings_progress=None):
        self.defaultCastToType()
        if self.validators is not None:

            if not isinstance(self.validators, list):
                raise MywError(
                    f"Bad {self.name} validators value, should be {[]}, not {self.validators!r}"
                )

            for validator in self.validators:
                required_keys = {"expression", "message"}
                if missing_keys := [key for key in required_keys if key not in validator]:
                    raise MywError(
                        f"Bad {self.name} validator properties, missing {list(sorted(missing_keys))!r}"
                    )

                if not isinstance(validator["message"], str):
                    raise MywError(
                        f"Bad {self.name} validator message, should be a string, not {validator['message']!r}"
                    )

                predicate = validator["expression"]
                if not isinstance(predicate, str):
                    raise MywError(
                        f"Bad {self.name} validator expression, should be a string, not {predicate!r}"
                    )

                # Validator predicates use the same syntax as filter expressions.
                from myworldapp.core.server.base.db.myw_filter_parser import MywFilterParser

                kwargs = {}
                if warnings_progress is not None:
                    kwargs["progress"] = warnings_progress

                try:
                    parser = MywFilterParser(predicate, **kwargs)
                    parser.readExpression()
                except MywError as cond:
                    inner_msg = cond.msg
                    raise MywError(f"Bad {self.name} expression: {inner_msg}")

                if warnings_progress is not None:
                    if invalid_keys := [key for key in validator if key not in required_keys]:
                        warnings_progress(
                            "warning",
                            f"Unrecognised {self.name} validator properties: {list(sorted(invalid_keys))!r} will be ignored.",
                        )
