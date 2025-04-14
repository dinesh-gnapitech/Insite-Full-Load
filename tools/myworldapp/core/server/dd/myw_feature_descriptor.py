################################################################################
# Feature descriptor
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json
from collections import OrderedDict
from copy import copy, deepcopy

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.db.myw_db_meta import (
    MywDbTable,
    MywDbColumn,
    MywDbIndex,
    MywDbType,
)
from myworldapp.core.server.base.db.myw_expression_parser import MywExpressionParser
from myworldapp.core.server.base.db.myw_filter_parser import MywFilterParser

from .myw_field_descriptor import MywFieldDescriptor


class MywFeatureDescriptor:
    """
    In-memory definition of a myWorld feature type

    Holds name, basic properties, field definitions, groups, searches etc. Provides:
     - Construction from, and serialisation to, .def format
     - Convenience APIs for accessing properties (fields, key_field_names, ..)
     - Validation
     - Differencing
     - Construction of table descriptor"""

    basic_props = [
        "datasource",
        "name",
        "external_name",
        "title",
        "short_description",
        "track_changes",
        "versioned",
        "editable",
        "insert_from_gui",
        "update_from_gui",
        "delete_from_gui",
        "remote_spec",
        "editor_options",
        "geom_indexed",
    ]

    # ==============================================================================
    #                                 CONSTRUCTION
    # ==============================================================================

    @staticmethod
    def fromDef(feature_def, add_defaults=False):
        """
        Construct from .def format dict FEATURE_DEF

        If ADD_DEFAULTS is True, add myw fields, default query etc (if required)"""

        feature_def = feature_def.copy()

        # Construct descriptor
        datasource = feature_def.pop("datasource", "myworld")
        name = feature_def.pop("name")

        feature_desc = MywFeatureDescriptor(datasource, name)
        feature_desc.update(feature_def, add_defaults=add_defaults)

        # Add a default query (if necessary)
        if add_defaults and (not "queries" in feature_def):
            feature_desc.addDefaultQueryIfAppropriate()

        return feature_desc

    def __init__(
        self,
        datasource,
        name,
        external_name=None,
        title=None,
        short_description=None,
        editable=False,
        insert_from_gui=False,
        update_from_gui=False,
        delete_from_gui=False,
        track_changes=True,
        versioned=False,
        remote_spec=None,
        editor_options=None,
        geom_indexed=True,
    ):
        """
        Construct with basic properties
        """

        # Init basic props
        self.datasource = datasource
        self.name = name
        self.external_name = external_name
        self.title = title
        self.short_description = short_description
        self.track_changes = track_changes
        self.versioned = versioned
        self.editable = editable
        self.insert_from_gui = insert_from_gui
        self.update_from_gui = update_from_gui
        self.delete_from_gui = delete_from_gui
        self.remote_spec = remote_spec
        self.editor_options = editor_options
        self.geom_indexed = geom_indexed

        # Init compound properties
        # ENH: key groups etc by name
        self.fields = OrderedDict()
        self.groups = []
        self.searches = []
        self.queries = []
        self.filters = []

        # Init derived properties
        self.enum_display_values = OrderedDict()

    def __repr__(self):
        """
        String representation of self for tracebacks etc
        """

        return "{}({},{})".format(self.__class__.__name__, self.datasource, self.name)

    def addField(self, name, type, **props):
        """
        Add a field NAME with properties PROPS (a dict)
        """

        # Check for already exists
        if name in self.fields:
            raise MywError("Duplicate definition for field: " + name)

        mandatory = props.get(
            "mandatory", None
        )  # needs to be obtained before props are modified by field descriptor constructor

        # Set properties
        descriptor = MywFieldDescriptor(name, type, **props)
        self.fields[name] = descriptor

        # For myworld features, set the primary/first geometry as mandatory by default (desired and keeps consistency with pre 6.5 where mandatory prop was ignored on geom fields)
        if (
            self.datasource == "myworld"
            and type in ["point", "linestring", "polygon"]
            and mandatory is None
            and self.primary_geom_field is descriptor
        ):
            descriptor.mandatory = "true"

    def dropField(self, name):
        """
        Remove field NAME from self (which must exist)
        """

        del self.fields[name]

    def addGroup(self, name, fields, expanded=False, visible="true"):
        """
        Add a field group definition to self
        """

        group_def = OrderedDict()
        group_def["name"] = name
        group_def["fields"] = fields
        group_def["expanded"] = expanded or False
        group_def["visible"] = visible or "true"

        self.groups.append(group_def)

    def addEnumValues(self, field_name, enum_values):
        """
        Add enumerator values available to a field
        """

        self.enum_display_values[field_name] = enum_values

    def addSearch(self, value, description, lang=None):
        """
        Add a search rule definition to self
        """

        search_def = OrderedDict()
        search_def["value"] = value
        search_def["description"] = description
        search_def["lang"] = lang

        self.searches.append(search_def)

    def addQuery(self, value, description, filter=None, lang=None):
        """
        Add a query definition to self
        """

        query_def = OrderedDict()
        query_def["value"] = value
        query_def["description"] = description
        query_def["lang"] = lang
        if filter:
            query_def["filter"] = filter

        self.queries.append(query_def)

    def addFilter(self, name, value):
        """
        Add a filter definition to self
        """

        filter_def = OrderedDict()
        filter_def["name"] = name
        filter_def["value"] = value

        self.filters.append(filter_def)

    # ==============================================================================
    #                                SERIALISATION
    # ==============================================================================

    def definition(self, extras=False):
        """
        Returns self as a dict (as per .def file)

        Optional EXTRAS is used by controllers to add redundant info on geometry_type etc"""

        ftr_def = OrderedDict()

        # Add basic props
        ftr_def["datasource"] = self.datasource
        ftr_def["name"] = self.name
        ftr_def["external_name"] = self.external_name
        ftr_def["title"] = self.title
        ftr_def["short_description"] = self.short_description
        ftr_def["track_changes"] = self.track_changes
        ftr_def["versioned"] = self.versioned
        ftr_def["geom_indexed"] = self.geom_indexed

        if not self.editable:
            ftr_def["editable"] = False
        else:
            ftr_def["editable"] = {
                "insert_from_gui": self.insert_from_gui,
                "update_from_gui": self.update_from_gui,
                "delete_from_gui": self.delete_from_gui,
            }
            ftr_def["editor_options"] = self.editor_options

        # Add fields
        fields = ftr_def["fields"] = []
        for name, field_desc in list(self.fields.items()):
            fields.append(field_desc.definition())

        # Add groups etc
        ftr_def["groups"] = self.groups
        ftr_def["searches"] = self.searches
        ftr_def["queries"] = self.queries
        ftr_def["filters"] = self.filters

        # Add remote definition (used by external features)
        if self.remote_spec:
            ftr_def["remote_spec"] = self.remote_spec

        # Add redundant info (if requested)
        if extras:
            ftr_def["geometry_type"] = self.geometry_type

        return ftr_def

    def update(self, props, add_defaults=False, skip_keys=[]):
        """
        Update self from a (possibly partial) .def format dict

        If add_defaults is True, add (or re-add) myWorld special fields etc"""

        props = props.copy()

        # Remove compound properties
        field_defs = props.pop("fields", None)
        group_defs = props.pop("groups", None)
        search_defs = props.pop("searches", None)
        query_defs = props.pop("queries", None)
        filter_defs = props.pop("filters", None)

        # Discard attributes no longer supported
        for prop in ["layers", "min_select", "max_select"] + skip_keys:
            if prop in props:
                props.pop(prop)

        # Flatten editable property (which can be a dict or a boolean)
        if "editable" in props:
            editable = props["editable"]
            sub_props = ["insert_from_gui", "update_from_gui", "delete_from_gui"]

            # Case: Dict
            if isinstance(editable, dict):
                props["editable"] = True
                for prop in sub_props:
                    props[prop] = editable.get(prop, False)

            # Case: Boolean
            else:
                for prop in sub_props:
                    props[prop] = editable

        # Set basic properties
        for prop in self.basic_props:
            if prop in props:
                setattr(self, prop, props.pop(prop))

        # Set fields
        if field_defs != None:
            if isinstance(field_defs, dict):
                # dictionary with new or modified fields
                for name, field_def in field_defs.items():
                    field_props = copy(field_def)
                    type = field_props.pop("type")
                    if name in self.fields:
                        # replace entry instead of dropping and adding to keep the field order
                        self.fields[name] = MywFieldDescriptor(name, type, **field_props)
                    else:
                        self.addField(name, type, **field_props)
            else:
                # array with complete list of fields
                self.fields.clear()
                for field_def in field_defs:
                    field_props = copy(field_def)
                    name = field_props.pop("name")
                    type = field_props.pop("type")
                    self.addField(name, type, **field_props)

        # Set groups
        if group_defs != None:
            self.groups = []
            for group_def in group_defs:
                self.addGroup(
                    group_def["name"],
                    group_def["fields"],
                    group_def.get("expanded"),
                    group_def.get("visible"),
                )

        # Set searches
        if search_defs != None:
            self.searches = []
            for search_def in search_defs:
                self.addSearch(
                    search_def["value"], search_def["description"], search_def.get("lang")
                )

        # Set queries
        if query_defs != None:
            self.queries = []
            for query_def in query_defs:
                self.addQuery(
                    query_def["value"],
                    query_def["description"],
                    query_def.get("filter"),
                    query_def.get("lang"),
                )

        # Set filters
        if filter_defs != None:
            self.filters = []
            for filter_def in filter_defs:
                self.addFilter(filter_def["name"], filter_def["value"])

        # Check for bad property
        if props:
            raise MywError("Unknown property in feature definition:", list(props.keys())[0])

        # Deal with default external name etc
        if add_defaults:
            self.setDefaults()

        return self

    def deepcopy(self):
        """
        Returns a deep copy of self
        """

        return deepcopy(self)

    # ==============================================================================
    #                                  IDENT
    # ==============================================================================

    def __str__(self):
        """
        String used to indentify self at command line
        """

        if self.datasource == "myworld":
            return self.name
        else:
            return self.datasource + "/" + self.name

    # ==============================================================================
    #                                   PROPERTIES
    # ==============================================================================

    @property
    def key_field(self):
        """
        Self's key field (if there is one)
        """

        return self.fields[self.key_field_name]

    @property
    def key_field_name(self):
        """
        Name of self's key field (if there is one)
        """

        names = self.key_field_names

        if len(names) > 1:
            raise MywError(
                "Tables with multiple keys not supported:",
                self.name,
                ":",
                "keys",
                ",".join(self.key_field_names),
            )

        if not names:
            return None

        return names[0]

    @property
    def key_field_names(self):
        """
        Names of self's key fields (in order)
        """

        key_field_names = []

        for name, field_desc in list(self.fields.items()):
            if field_desc.key:
                key_field_names.append(name)

        return key_field_names

    @property
    def geometry_type(self):
        """
        Type of self's primary geometry field (if there is one)
        """

        field_desc = self.primary_geom_field

        if not field_desc:
            return None

        return field_desc.type

    @property
    def primary_geom_name(self):
        """
        Name of self's primary geometry field (if there is one)
        """

        field_desc = self.primary_geom_field

        if not field_desc:
            return None

        return field_desc.name

    @property
    def primary_geom_field(self):
        """
        Descriptor of self's primary geometry field (if there is one)

        Primary geometry is the 'the_geom' field (if present) or,
        failing that, the first geometry field in the fields list"""

        primary_field_desc = None

        for name, field_desc in list(self.fields.items()):

            if not field_desc.isGeometry():
                continue

            if name == "the_geom" or not primary_field_desc:
                primary_field_desc = field_desc

        return primary_field_desc

    def geomFields(self):
        """
        Descriptors of self's geometry fields

        Returns an ordered list of MywFieldDescriptors, keyed by field name"""

        descs = OrderedDict()

        for name, field_desc in list(self.fields.items()):

            if field_desc.isGeometry():
                descs[name] = field_desc

        return descs

    def storedFields(self, *types):
        """
        Field definitions for the non-calculated fields of self

        Optional TYPES is a list of field types

        Returns an ordered list of dicts, keyed by field name"""

        descs = OrderedDict()

        for name, field_desc in list(self.fields.items()):

            if not field_desc.isStored():
                continue

            if types and not (field_desc.type_desc.base in types):
                continue

            descs[name] = field_desc

        return descs

    def filterFields(self):
        """
        Field names referenced in self's filters (an ordered list)
        """

        # Build list of referenced fields
        fields = set()
        for filter_def in self.filters:
            expr = filter_def["value"]
            pred = MywFilterParser(expr).parse()
            fields.update(pred.fieldNames())

        # Make order defined (prevents unnecessary rebuilds of index records)
        return sorted(fields)

    def parsedExpressionsFor(self, prop, language_parser):
        """
        Return the parsed versions of PROP (title or short_description)

        Returns a dictionary of tuple lists as per MywExpressionParser.parse(), keyed on Language"""

        value = self[prop] or ""
        langs = language_parser.languages_for(value)
        default_language = language_parser.default_language
        expressions = {}

        if value == "":
            return expressions

        if len(langs) == 0:
            expressions[default_language] = self.parsedExpressionFor(
                prop, language_parser, default_language
            )

        for lang in langs:
            expressions[lang] = self.parsedExpressionFor(prop, language_parser, lang)

        return expressions

    def parsedExpressionFor(self, prop, language_parser, lang=None):
        """
        Return the parsed version of PROP (title or short_description)

        Returns a list of tuples, as per MywExpressionParser.parse()"""
        # ENH: modify to receive the expression instead of prop - finding expresson and parsing it should be done by caller

        fallbackText = ".".join([self.name, prop]) if prop != "short_description" else ""
        expr = language_parser.parse(self[prop], fallbackText, lang) or ""
        pseudo_fields = OrderedDict()

        # Build list of pseudo-fields (in substitution order)
        # ENH: Duplicated with myw_db_driver
        pseudo_fields["short_description"] = language_parser.parse(self.short_description, "", lang)
        pseudo_fields["title"] = language_parser.parse(
            self.title, ".".join([self.name, "title"]), lang
        )
        pseudo_fields["external_name"] = language_parser.parse(
            self.external_name, ".".join([self.name, "external_name"]), lang
        )  # For pre-4.3 compatibility
        pseudo_fields["display_name"] = language_parser.parse(
            self.external_name, ".".join([self.name, "display_name"]), lang
        )

        return MywExpressionParser(expr, pseudo_fields).parse()

    def __getitem__(self, prop):
        """
        Conveniences wrapper for accessing the value of self's property PROP
        """

        return getattr(self, prop)

    # ==============================================================================
    #                                    DEFAULTS
    # ==============================================================================

    def setDefaults(self):
        """
        Set default external name etc in self (if necessary)
        """
        # Should only be called once all fields are added

        # Set default external name
        if not self.external_name:
            self.external_name = self.name.replace("_", " ").title()

        # Set default title
        # ENH: Get from descriptor?
        if not self.title:
            title = "{display_name}"
            if "name" in self.fields:
                title += ": [name]"
            elif "label" in self.fields:
                title += ": [label]"
            elif "myw_smallworld_id" in self.fields:
                title += ": [myw_smallworld_id]"
            elif self.key_field_name != None:
                title += ": [{}]".format(self.key_field_name)
            self.title = title

    def addDefaultQueryIfAppropriate(self):
        """
        Add default query to self (if appropriate)
        """

        if not self.queries and self.geometry_type != "raster":
            # check if multi-language string
            try:
                multi_language_string = json.loads(self.external_name)
                for lang, external_name in multi_language_string.items():
                    self.addQuery(external_name.lower(), external_name, lang=lang)
            except Exception as e:
                # not multi-lang string
                self.addQuery(self.external_name.lower(), self.external_name)

    # ==============================================================================
    #                                 VALIDATION
    # ==============================================================================

    def assertValid(self, max_filter_fields, db_driver, warnings_progress=None):
        """
        Throw an error if self is not valid

        MAX_FILTER_FIELDs is the maxiumum permitted number of references in filter definitions
        DB_DRIVER is a hack for applying looser checks on native app local feature defs

        """

        # Determine if we are loading def into sqlite db (myw_db update operation)
        # Note: Ideally would determine if this is a 'local' table .. but no way to do that
        local_table = db_driver.dialect_name == "sqlite"

        # Check names etc obey myWorld constraints
        if self.datasource == "myworld":
            self.assertMywValid(local_table)

        # Check field definitions are valid
        for field_name, field_desc in list(self.fields.items()):
            field_desc.assertValid(warnings_progress)

        # Check title expressions are valid
        for prop in ["title", "short_description"]:
            expr = self[prop]
            if expr:
                self.assertExpressionValid(prop, expr)

        # Check search expressions are valid
        for search in self.searches:
            self.assertExpressionValid("search value", search.get("value", ""))
            self.assertExpressionValid("search description", search.get("description", ""))

        # Check groups are valid
        for group in self.groups:
            name = group.get("name", "")
            fields = group.get("fields", [])
            self.assertFieldsValid("group '" + name + "'", fields)

        # Check queries are valid
        for query_def in self.queries:
            if query_def.get("filter"):
                self.assertFilterValid("query", query_def.get("value"), query_def["filter"])

        # Check filters are valid
        for filter_def in self.filters:
            self.assertFilterValid("filter", filter_def.get("name"), filter_def.get("value", ""))

        # Check for too many references
        filter_fields = self.filterFields()
        if len(filter_fields) > max_filter_fields:
            raise MywError(
                "Filters reference more than", max_filter_fields, "fields:", ",".join(filter_fields)
            )

        # Check editor_options schema is valid:
        self.assertEditorOptionsValid(warnings_progress)

    def assertMywValid(self, local_table):
        """
        Raises MywError if self is not a valid definition for a myworld feature

        LOCAL_TABLE is a hack for applying looser checks on native app local feature defs"""
        # ENH: EXTDD: Support arbitrary key field name etc on all myworld features and remove LOCAL_TABLE

        # Check name
        if not self.nameValid(self.name):
            raise MywError("Invalid feature type name: " + self.name)

        # Check field definitions (inc calculated)
        for field_name, field_desc in list(self.fields.items()):

            # ENH: Fix handling of type 'raster' and move this into assertValid()
            self.assertDataTypeValid(field_name, field_desc.type)

            # Check internal name is valid
            if not self.nameValid(field_name) and not local_table:
                raise MywError("Invalid field name: " + field_name)

        # Check for no key field
        if self.key_field_name == None:
            raise MywError("Feature {}: Definition must include a key field".format(self.name))

    def nameValid(self, name):
        """
        True if NAME is a valid internal name
        """
        # Note: Could make this less strict .. but would need to fix DB
        #       drivers to quote table and field names in table mutation etc

        punct = r"[!" "#$%&'()*+-,./:;<=>?@\[]^`{|}~ "
        uppers = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        digits = "0123456789"

        bad_chs = uppers + punct
        bad_first_chs = bad_chs + digits

        # Check for name empty
        if not name:
            return False

        # Check first character is alphabetic
        if name[0] in bad_first_chs:
            return False

        # Check remaining characters are alphabetic or digits
        for ch in name:
            if ch in bad_chs:
                return False

        return True

    def assertDataTypeValid(self, field_name, data_type):
        """
        Raise MywError if DATA_TYPE is a valid myWorld data type
        """

        try:
            MywDbType(data_type)

        except MywError as cond:
            msg = "Field {}.{}: {}".format(self.name, field_name, cond)
            raise MywError(msg)

    def assertExpressionValid(self, expr_type, expr):
        """
        Raises MywError if EXPR references a field not in self

        EXPR is a string including references of the form:
           [<field_name>]"""

        # Note: We don't expand pseudo_fields here to avoid confusing error messages

        stored_fields = list(self.storedFields().keys())

        for name in MywExpressionParser(expr).fields():
            if not name in stored_fields:
                raise MywError("Bad reference in {}: [{}]".format(expr_type, name))

    def assertFilterValid(self, filter_type, name, expr):
        """
        Raises MywError if EXPR is not a valid filter expression

        FILTER_TYPE is 'query' or 'filter'"""

        try:
            pred = MywFilterParser(expr).parse()
            self.assertFieldsValid("'" + expr + "'", pred.fieldNames())

        except MywError as cond:
            raise MywError(filter_type, name, ":", cond)

    def assertFieldsValid(self, msg, field_names):
        """
        Raises MywError if field_names not in self
        """

        for name in field_names:
            # name can be:
            # - a dictionary
            # - a string of encoded JSON starting with {.
            #   => skip, as this won't be in fields (it's a separator.)
            # - a string with a valid SQL name in
            #   => verify it is listed in fields.

            if isinstance(name, dict) or name[0] == "{":
                continue
            if not name in self.fields:
                raise MywError("Bad reference in {}: [{}]".format(msg, name))

    def assertEditorOptionsValid(self, warnings_progress=None):
        if self.editor_options is not None:
            if not isinstance(self.editor_options, dict):
                raise MywError(
                    f"Bad editor_options value, should be {{}}, not {self.editor_options!r}"
                )
            if warnings_progress is not None:
                valid_keys = {"popup", "popup_width"}
                if invalid_keys := [key for key in self.editor_options if key not in valid_keys]:
                    warnings_progress(
                        "warning",
                        f"Unrecognised editor_options properties: {list(sorted(invalid_keys))!r} will be ignored.",
                    )

    # ==============================================================================
    #                           TABLE DESCRIPTOR BUILDING
    # ==============================================================================

    def tableDescriptor(self, schema="data"):
        """
        Definition of self's database table in SCHEMA (a MywDbTable)

        SCHEMA is one of:
          'data'    Master feature table
          'delta'   Stores per-version changes. Includes delta (key) and change type fields
          'base'    Store base records for per-version changes. Includes delta (key)"""

        table_desc = MywDbTable(schema, self.name)

        stored_field_descs = self.storedFields()

        # Add delta
        if schema in ["delta", "base"]:
            table_desc.add(MywDbColumn("myw_delta", "string(400)", key=True))

        # Add stored fields
        for field_name, field_desc in list(stored_field_descs.items()):

            column_desc = MywDbColumn(
                field_name,
                field_desc.type,
                key=field_desc.key,
                default=field_desc.defaultCastToType(),
                unit=field_desc.unit,
            )

            if (schema != "base") and field_desc.generator:
                column_desc.generator = field_desc.generator

            table_desc.add(column_desc)

        # Add delta change type
        if schema == "delta":
            table_desc.add(MywDbColumn("myw_change_type", "string(10)"))  # ENH: Should be indexed?

        # Add explicit indexes
        # ENH: Could skip these for base
        for field_name, field_desc in list(stored_field_descs.items()):
            if field_desc.indexed:
                index_desc = MywDbIndex([field_name])
                table_desc.add(index_desc)

        return table_desc

    # ==============================================================================
    #                                DIFFERENCING
    # ==============================================================================

    def basicPropDifferences(self, other):
        """
        Yields names and values of basic properties that differ between self and other
        """

        for prop in self.basic_props:
            if self[prop] != other[prop]:
                yield prop, self[prop], other[prop]

    def fieldDifferences(self, other):
        """
        Field differences self -> OTHER

        Returns a list of (FIELD_NAME,CHANGE,DIFFS_STR) tuples"""

        # ENH: Return a list of diff objects instead

        schema = "data"
        feature_name = self.name

        diffs = []

        # Yield field additions and modifications
        for (field_name, other_field_desc) in list(other.fields.items()):
            self_field_desc = self.fields.get(field_name)

            if self_field_desc == None:
                diffs.append((field_name, "added", ""))

            else:
                field_diffs = self_field_desc.differenceStrs(other_field_desc)
                if field_diffs:
                    diffs.append((field_name, "updated", " ".join(field_diffs)))

            # Order updated
            if (
                field_name in other.fields
                and field_name in self.fields
                and list(self.fields.keys()).index(field_name)
                != list(other.fields.keys()).index(field_name)
            ):
                diffs.append((field_name, "order", ""))

        # Yield field deletions
        for (field_name, self_field_desc) in list(self.fields.items()):
            if not field_name in other.fields:
                diffs.append((field_name, "deleted", ""))

        return diffs
