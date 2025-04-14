# Copyright: IQGeo Limited 2010-2023

# Database object descriptors. Provided due to limitations in SQLAlchemy descriptors.

import re
from collections import OrderedDict
from datetime import datetime

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.db.myw_table_change import (
    MywAddColumnChange,
    MywAlterColumnChange,
    MywDropColumnChange,
    MywAddIndexChange,
    MywDropIndexChange,
)


# ==============================================================================
#                                  MywDbTable
# ==============================================================================


class MywDbTable:
    """
    A database table descriptor

    Defines table structure, indexes and constraints"""

    def __init__(self, schema, name, *items):
        """
        Init slots of self

        Optional ITEMS are MywDbColumn, MywDbIndex and MywConstraintDesc objects"""

        # Init slots
        self.schema = schema
        self.name = name
        self.columns = OrderedDict()
        self.indexes = []
        self.constraints = []

        # Add structure (if given)
        for item in items:
            self.add(item)
            item.table = self

    def add(self, item):
        """
        Add a definition element

        ITEM is a MywDbColumn, MywDbIndex or MywConstraintDesc object"""

        item.table = self

        if isinstance(item, MywDbColumn):
            self.columns[item.name] = item  # ENH: Check for field already exists

        elif isinstance(item, MywDbIndex):
            self.indexes.append(item)

        elif isinstance(item, MywDbConstraint):
            self.constraints.append(item)

        else:
            raise MywInternalError("Bad table definition item: " + str(item))

    @property
    def key_column_names(self):
        """
        Names of the key columns of self
        """

        names = []
        for name, field in list(self.columns.items()):
            if field.key:
                names.append(name)

        return names

    def mutationsTo(self, new_table_desc):
        """
        Yields TableChange objects that mutate SELF to NEW_TABLE_DESC
        """

        # ENH: Yield constraint drops (would be required for use on system tables)

        # Yield index drops
        for index_desc in self.indexes:
            if not index_desc in new_table_desc.indexes:
                yield MywDropIndexChange(self.schema, self.name, index_desc)

        # Yield field adds and mods
        for field_name, new_field_desc in list(new_table_desc.columns.items()):
            old_field_desc = self.columns.get(field_name)

            if not old_field_desc:
                yield MywAddColumnChange(self.schema, self.name, field_name, new_field_desc)

            elif not (old_field_desc == new_field_desc):
                yield MywAlterColumnChange(
                    self.schema, self.name, field_name, old_field_desc, new_field_desc
                )

        # Yield field drops
        for (field_name, old_field_desc) in list(self.columns.items()):
            if not field_name in new_table_desc.columns:
                yield MywDropColumnChange(self.schema, self.name, field_name, old_field_desc)

        # Yield index adds
        for index_desc in new_table_desc.indexes:
            if not index_desc in self.indexes:
                yield MywAddIndexChange(self.schema, self.name, index_desc)

        # ENH: Yield constraint adds (would be required for use on system tables)

    def equals(self, other_table_desc):
        """
        True if self and other are equivalent
        """

        for m in self.mutationsTo(other_table_desc):
            return False

        return True


# ==============================================================================
#                                  MywDbTableItem
# ==============================================================================


class MywDbTableItem:
    """
    Abstract superclass for field, index and constraint descriptors
    """

    def __init__(self, table=None):
        self.table = table

    @property
    def table_name(self):
        """
        Name of the table to which self related
        """

        return self.table.name


# ==============================================================================
#                                  MywDbColumn
# ==============================================================================


class MywDbColumn(MywDbTableItem):
    """
    Database field descriptor

    Has database-independent properties name, type
    etc. Reflected columns also have database-specific property db_type"""

    def __init__(
        self,
        name,
        type,
        key=False,
        nullable=None,
        default=None,
        generator=None,
        reference=None,
        unit=None,
        db_type=None,
    ):
        """
        Init slots of self

        TYPE is the name of a myWorld basic data type"""

        # Note: UNIT (a string) is not really a database property and is not reflectable.
        #       It is required for feature table type mutations only
        super().__init__()

        # Deal with defaults
        if nullable == None:
            nullable = not key

        if isinstance(reference, MywDbColumn):
            reference = {"field": reference}

        self.name = name
        self.type = type
        self.key = key
        self.nullable = nullable
        self.default = default
        self.generator = generator
        self.reference = reference  # ENH: Better as explicit constraint .. or data type?
        self.unit = unit
        self.db_type = db_type

    def __repr__(self):
        """
        String representation of self (for debug messages etc)
        """

        return "{}({},{},key={},nullable={},default={},generator={},unit={})".format(
            self.__class__.__name__,
            self.name,
            self.type,
            self.key,
            self.nullable,
            self.default,
            self.generator,
            self.unit,
        )

    @property
    def type_desc(self):
        """
        Self's data type descriptor (a MywDbType)
        """

        return MywDbType(self.type)

    def prop_names(self, *aspects):
        """
        Names of the properties of self
        """

        aspect_props = {
            "stored": ["type", "key", "nullable", "default", "generator", "reference"],
            "dd": ["unit"],
        }

        if not aspects:
            aspects = ["stored", "dd"]

        props = []
        for aspect in aspects:
            props += aspect_props[aspect]

        return props

    def get(self, name):
        """
        The value of self's propery NAME
        """

        return getattr(self, name)

    def differences(self, other):
        """
        The properties of self that are different from OTHER
        """

        diffs = []
        for prop in self.prop_names():
            if self.get(prop) != other.get(prop):
                diffs.append(prop)

        return diffs

    def __eq__(self, other):
        """
        True if self is functionally equivalent to OTHER
        """

        for prop in self.prop_names():
            if self.get(prop) != other.get(prop):
                return False

        return True

    def isGeometry(self):
        """
        True if self is a geometry column
        """
        # ENH: Move down onto MywDbType

        return self.type in ["point", "linestring", "polygon"]

    @property
    def constraints(self):
        """
        The field constraint descriptors for self (a list of MywDbConstraints)
        """

        descs = []

        if self.reference:
            descs.append(
                MywDbConstraint("FOREIGN KEY", [self.name], reference=self.reference["field"])
            )

        return descs


# ==============================================================================
#                                  MywDbType
# ==============================================================================


class MywDbType(MywDbTableItem):
    """
    Database field type descriptor
    """

    base_types = [
        "reference",
        "reference_set",
        "foreign_key",
        "link",
        "boolean",
        "integer",
        "bigint",
        "double",
        "numeric",
        "timestamp",
        "date",
        "string",
        "image",
        "file",
        "json",
        "point",
        "linestring",
        "polygon",
    ]

    def __init__(self, myw_type_str):
        """
        Init slots of self from string representation MYW_TYPE_STR
        """

        super().__init__()

        self.str = myw_type_str

        (self.base, self.args) = self.parseMywType(myw_type_str)

    def parseMywType(self, myw_type):
        """
        Parse a myWorld data type name e.g. "string(120)"

        Returns:
          BASE    Name of base type e.g. "string"
          ARGS    List of arguments, converted to expected types e.g. [120]"""

        # Check for empty / unset
        if not myw_type:
            raise MywError("Bad data type:", myw_type)

        # Split into base and args
        match = re.match("^(.*)\((.*)\)$", myw_type)
        if match:
            base = match.groups(1)[0]
            args_str = match.groups(1)[1]
            args = args_str.split(",") if args_str else []
        else:
            base = myw_type
            args = []

        n_args = len(args)

        # Check base is a known type
        if not base in self.base_types:
            raise MywError("Bad data type:", myw_type)

        # Convert args
        if base in ["string", "numeric", "image", "file"]:
            try:
                args = list(map(int, args))
            except Exception:
                raise MywError("Bad data type:", myw_type)

            # Check for more missing / spurious args
            if base == "numeric" and not (n_args == 2 and args[0] >= args[1]):
                raise MywError("Bad data type:", myw_type)
            if base == "string" and not n_args in (0, 1):
                raise MywError("Bad data type:", myw_type)
            if base == "image" and not n_args in (0, 2):
                raise MywError("Bad data type:", myw_type)
            if base == "file" and not n_args in (0, 1):
                raise MywError("Bad data type:", myw_type)

        return base, args

    @property
    def length(self):
        """
        Max length of self, in chars (if there is one)

        None unless self is a string field with defined length"""

        if self.base == "string" and self.args:
            return self.args[0]

        return None

    def convert(self, value_str):
        """
        String VALUE_STR cast to self's data type

        Throws ValueError if cannot convert"""

        # ENH: Duplicated with IO streams etc
        date_format = "%Y-%m-%d"
        timestamp_format = "%Y-%m-%dT%H:%M:%S.%f"

        bool_strs = {"true": True, "false": False}

        if value_str == None:
            return None

        if self.base == "boolean":
            value = value_str.lower()
            if not value in bool_strs:
                raise ValueError("Invalid boolean value: '{}'".format(value_str))
            return bool_strs[value]

        if self.base in ("integer", "bigint"):
            return int(value_str)

        if self.base in ["double", "numeric"]:  # ENH: Use decimal for numeric
            return float(value_str)

        if self.base == "date":
            return datetime.strptime(value_str, date_format).date()

        if self.base == "timestamp":
            return datetime.strptime(value_str, timestamp_format)

        return value_str


# ==============================================================================
#                                  MywDbIndex
# ==============================================================================


class MywDbIndex(MywDbTableItem):
    """
    Database index descriptor
    """

    def __init__(
        self, column_names, type=None, unique=False, db_name=None, db_options=None
    ):  # ENH: gather args?
        """
        Init slots of self

        COLUMN_NAMES is an ordered list of column names. TYPE is one of:
          'pkey'
          'plain'
          'like'
          'spatial'
          'geographic'

        Optional DB_NAME is name of index in database"""

        super().__init__()

        self.column_names = column_names
        self.type = type
        self.unique = unique
        self.db_name = db_name
        self.db_options = db_options

    @property
    def column_names_str(self):
        """
        Names of column_names of self (as a comma-separated string)
        """

        return ",".join(self.column_names)

    def __repr__(self):
        """
        String representation of self (for debug messages etc)
        """

        return "{}({},{})".format(self.__class__.__name__, self.type, self.column_names_str)

    def __eq__(self, other):
        """
        True if self is functionally equivalent to OTHER
        """

        return (
            self.column_names == other.column_names
            and self.type == other.type
            and self.unique == other.unique
        )


# ==============================================================================
#                                  MywDbConstraint
# ==============================================================================


class MywDbConstraint(MywDbTableItem):
    """
    Database table constraint descriptor
    """

    # ENH: Better as separate classes MywDbUniqueConstraint, MywDbForeignKeyConstraint, ...?

    @staticmethod
    def pKey(*column_names):
        """
        Convenience wrapper returning a new primary key constraint
        """

        return MywDbConstraint("PRIMARY KEY", column_names)

    @staticmethod
    def unique(*column_names):
        """
        Convenience wrapper returning a new unique constraint
        """

        return MywDbConstraint("UNIQUE", column_names)

    @staticmethod
    def foreignKey(field, reference):
        """
        Convenience wrapper returning a new foreign key constraint

        REFERENCE is the column descriptor for the referenced field"""

        return MywDbConstraint("FOREIGN KEY", [field], reference=reference)

    def __init__(self, type, column_names, reference=None, db_name=None, db_defn=None):
        """
        Init slots of self

        COLUMN_NAMES is an ordered list of column names. TYPE is one of 'PRIMARY KEY', 'UNIQUE' and 'FOREIGN KEY'.
        Optional DB_NAME is name of constraint in database"""

        if not type in ["PRIMARY KEY", "UNIQUE", "FOREIGN KEY"]:
            raise MywInternalError("Bad constraint type: " + type)

        super().__init__()

        self.type = type
        self.column_names = column_names
        self.reference = reference  # Column descriptor (for foreign key constraints)
        self.db_name = db_name
        self.db_defn = db_defn

    @property
    def field_names(self):
        """
        Names of column_names to which self applies (as a comma-separated string)
        """

        return ",".join(self.column_names)
