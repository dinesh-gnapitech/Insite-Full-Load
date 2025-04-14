# Copyright: IQGeo Limited 2010-2023
# pylint: disable=no-member

import re, warnings
from collections import OrderedDict
from contextlib import contextmanager

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    Float,
    Integer,
    MetaData,
    Numeric,
    Sequence,
    TEXT,
    Table,
)
from sqlalchemy import exc
from sqlalchemy.exc import DBAPIError
from sqlalchemy.engine import reflection
from sqlalchemy.ext.declarative import declarative_base

from myworldapp.core.server.base.core.myw_error import (
    MywError,
    MywDbQueryTimeOutError,
    MywInternalError,
)
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from geoalchemy2 import Geometry

from myworldapp.core.server.base.db.myw_db_meta import (
    MywDbColumn,
    MywDbConstraint,
    MywDbIndex,
    MywDbTable,
)
from myworldapp.core.server.base.db.myw_expression_parser import MywExpressionParser


class MywDbDriver:
    """
    Abstract superclass for myw database drivers

    Provides a database-independent API for performing various
    functions missing from SQLAlchemy:

     - Name mapping:     Conversion from myWorld names to database object names (see .dbNameFor()
     - Type mapping:     Mapping from myWorld types to DB types
     - Table management: Create/mutate/drop tables
     - Trigger building: Construction of feature and system table triggers
     - Locking:          Advisory lock acquisition

    Subclasses must implement:
      .supports_data_model_rollback
      .reserved_words
      .null_geometry
      .dbNameFor(schema,table=None,full=False)
      .dbIndexNameFor(schema,table,columns,full=False)
      .dbConstraintNameFor(schema,table,columns,full=False)
      .tableNamesIn(schema)
      .createSchema()
      .dropSchema()
      ._createTriggerSqls()
      ._featureTriggerSetKeySql()
      ._getGeomTypeClause()
      .disableTriggersSql()
      .enableTriggersSql()
      .tableExists(schema,table)
      .sqlTypeFor()
      .addColumnSqls()
      .alterColumnSqls()
      .dropColumnSqls()
      .nextValSql()
      .setSequenceRange()
      .setSequenceValue()
      .trimExpr()
      .withinExpr()
      .acquireVersionStampLock()
      .nestedTransaction()
      .vacuum()"""

    world_types = ["geo", "int"]
    geom_types = ["point", "linestring", "polygon"]  # ENH: Share this

    sqa_geometry_opts = {}  # Gets overwritten in MywSqliteDbDriver

    @staticmethod
    def newFor(session):
        """
        Returns an instance of the MywDbDriver subclass appropriate for the underlying database of SESSION
        """

        dialect = session.bind.dialect.name

        if dialect == "postgresql":
            from .myw_postgres_db_driver import MywPostgresDbDriver

            return MywPostgresDbDriver(session)

        elif dialect == "sqlite":
            from .myw_sqlite_db_driver import MywSqliteDbDriver

            return MywSqliteDbDriver(session)

        else:
            raise Exception("No driver for database dialect:" + dialect)

    def __init__(self, session, progress=MywProgressHandler()):
        """
        Init slots of self

        SESSION is a SQLAlchemy session object"""

        # Init slots
        self.session = session
        self.progress = progress

        # Cache the database metadata (here, to avoid deadlocks later)
        self.metadata = MetaData(bind=self.session.bind)

        # Engine for building table classes (hook for test framework)
        self.model_builder = None  # ENH: Avoid need for this?

    @property
    def dialect_name(self):
        """
        Name of self's database dialect
        """
        #  Just for convenience

        return self.session.bind.dialect.name

    def __repr__(self):
        """
        String representation of self (for tracebacks etc)
        """

        return "{}({})".format(self.__class__.__name__, id(self))

    # ==============================================================================
    #                                  REFLECTION
    # ==============================================================================

    def tableDescriptorFor(self, schema, table):
        """
        Definition of TABLE's structure, indexes, etc (a MywDbTable)
        """

        table_desc = MywDbTable(schema, table)

        # Add field descriptors
        field_defs = self.columnDefsFor(schema, table, True)  # ENH: Return descriptors directly

        for field_name, field_def in list(field_defs.items()):
            sqa_type = field_def["type"]  # TODO: Convert to myWorld type

            column_desc = MywDbColumn(
                field_name,
                self.dataTypeFor(sqa_type),
                key=field_def.get("key"),
                nullable=field_def.get("nullable"),
                default=field_def.get("default"),
                generator=field_def.get("generator"),
                db_type=sqa_type,
            )

            table_desc.add(column_desc)

        # Add indexes
        for index_name, props in list(
            self.sortedIndexesFor(schema, table).items()
        ):  # ENH: Return descriptors directly

            index_desc = MywDbIndex(
                props["field_names"],
                type=props.get("type"),
                unique=props["unique"],
                db_name=index_name,
                db_options=",".join(props["options"]),
            )

            table_desc.add(index_desc)

        # Add constraints
        for constraint_name, props in list(
            self.sortedConstraintsFor(schema, table).items()
        ):  # ENH: Return descriptors directly

            constraint_desc = MywDbConstraint(
                props["type"], props["fields"], db_name=constraint_name, db_defn=props["defn"]
            )

            table_desc.add(constraint_desc)

        return table_desc

    def columnDefsFor(self, schema, table_name, full=False):
        """
        Definitions of the fields of TABLE

        Returns an ordered list of field definitions, keyed by field name"""

        # Note: Gets subclassed to add extra properties if FULL is true

        insp = self.inspector()

        # Get SQLAlchemy info
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=exc.SAWarning)

            db_schema = self.dbNameFor(schema)
            db_table_name = self.dbNameFor(schema, table_name)

            sqa_defs = insp.get_columns(db_table_name, schema=db_schema)
            key_field_names = insp.get_pk_constraint(db_table_name, schema=db_schema)[
                "constrained_columns"
            ]

        # Convert to useful format
        field_defs = OrderedDict()
        for sqa_def in sqa_defs:
            name = sqa_def["name"]

            field_def = {}
            field_def["type"] = sqa_def["type"]
            field_def["key"] = name in key_field_names

            # Fix up geometry field defs
            if field_def["type"].__class__.__name__ == "Geometry":
                field_def["type"] = "geometry"

            field_defs[name] = field_def

        return field_defs

    def sortedIndexesFor(self, schema, table_name):
        """
        Definitions of the indexes of TABLE_NAME
        """

        # Suppressing SQLAlchemy warnings about geographic indexes ..
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=exc.SAWarning)

            index_defs = {}

            db_schema = self.dbNameFor(schema)
            db_table_name = self.dbNameFor(schema, table_name)

            index_defs = self.indexesFor(db_schema, db_table_name)
            for index_def in list(index_defs.values()):
                index_def["options"] = sorted(index_def["options"])

            return OrderedDict(sorted(index_defs.items()))

    def sortedConstraintsFor(self, schema, table_name):
        """
        Definitions of the constraints of TABLE_NAME (a dict of dicts)
        """

        constraint_defs = self.constraintsFor(schema, table_name)

        # TODO: Fix sorting - Python 3 can not compare dict (Previously worked in Python 2)
        # return OrderedDict( sorted( list(constraint_defs.items()),key=operator.itemgetter(1) ) )
        return OrderedDict(sorted(constraint_defs.items()))

    def sortedTriggersFor(self, schema, table_name):
        """
        Definitions of the triggers of TABLE_NAME (a dict of definitons, keyed by trigger name)

        Each definition is a dict with keys 'type' and 'body'"""

        trigger_defs = self.triggersFor(schema, table_name)

        return OrderedDict(sorted(trigger_defs.items()))

    def inspector(self):
        """
        SQLAlchemy reflection engine for self
        """

        return reflection.Inspector.from_engine(self.session.connection())

    def dataTypeFor(self, sqa_type):
        """
        The myWorld basic data type for SQLAlchemy type SQA_TYPE
        """

        # ENH: Replace by SQL mapping

        sqa_type_str = str(sqa_type)

        if isinstance(sqa_type, Integer):
            return "integer"
        if isinstance(sqa_type, Float):
            return "double"
        if isinstance(sqa_type, Numeric):
            return "numeric({},{})".format(sqa_type.precision, sqa_type.scale)
        if isinstance(sqa_type, Boolean):
            return "boolean"
        if isinstance(sqa_type, Date):
            return "date"

        if isinstance(sqa_type, TEXT):
            return "string()"  # TODO: Could be image
        if sqa_type_str == "CLOB":
            return "string()"
        if sqa_type_str.startswith("VARCHAR"):
            return "string({})".format(sqa_type.length or "")

        if sqa_type_str.startswith("TIMESTAMP WITHOUT TIME ZONE"):
            return "timestamp"
        if sqa_type_str.startswith("TIMESTAMP WITH TIME ZONE"):
            return "timestamp_tz"
        if sqa_type_str.startswith("TIMESTAMP"):
            return "timestamp_xx"

        if sqa_type_str == "BLOB":
            return "image"

        if sqa_type_str == "geometry":
            return "geometry"  # TODO: point, linestring, ...
        if sqa_type_str.startswith("geometry(GEOMETRY"):
            return "geometry"

        self.progress("warning", "Unknown SQA type:", sqa_type_str, sqa_type.__class__)
        return sqa_type_str

    # ==============================================================================
    #                               TABLE CREATION
    # ==============================================================================

    def createTableFrom(self, schema, table_name, *items):
        """
        Create a table from elements of a myw_db_meta description

        Convenience wrapper to createTable() for use in upgrades

        Returns a MywDbTable descriptor"""

        table_desc = MywDbTable(schema, table_name, *items)

        self.createTable(table_desc)

        return table_desc

    def createTable(self, table_desc):
        """
        Create a table from a MywDbTable description
        """

        db_table_name = self.dbNameFor(table_desc.schema, table_desc.name, True)

        # Create sequences
        self.addSequencesFor(table_desc)

        # Create table
        field_sqls = []
        for field_name, column_desc in list(table_desc.columns.items()):
            field_sql = self.quotedColumnName(field_name) + " " + self.sqlColumnDefFor(column_desc)
            field_sqls.append(field_sql)

        sql = "CREATE TABLE {} ({})".format(db_table_name, ",".join(field_sqls))

        self.execute(sql)

        # Add key constraint
        if table_desc.key_column_names:
            self.addConstraint(
                table_desc.schema,
                table_desc.name,
                MywDbConstraint("PRIMARY KEY", table_desc.key_column_names),
            )

        # Add field constraints (foreign key constraints)
        for field_name, column_desc in list(table_desc.columns.items()):
            for constraint_desc in column_desc.constraints:
                self.addConstraint(table_desc.schema, table_desc.name, constraint_desc)

        # Add table constraints (unique fields, etc)
        for constraint_desc in table_desc.constraints:
            self.addConstraint(table_desc.schema, table_desc.name, constraint_desc)

        # Add geometry indexes
        for field_name, column_desc in list(table_desc.columns.items()):
            if column_desc.isGeometry():
                sql = self.addGeomIndexSql(table_desc.schema, table_desc.name, field_name)
                self.execute(sql)

        # Add other indexes
        for index_desc in table_desc.indexes:
            self.addIndex(table_desc.schema, table_desc.name, index_desc)

        return table_desc

    def dropTableIfExists(self, schema, table_name):
        """
        Drop table TABLE_NAME and associated objects, if present

        Table must be empty"""

        if self.tableExists(schema, table_name):
            self.dropTable(schema, table_name)

    def dropTable(self, schema, table_name):
        """
        Drop table TABLE_NAME and associated objects (triggers, indexes, sequences)

        Table must be empty"""
        #
        # Gets subclassed for db-specific cleanup

        db_table_name = self.dbNameFor(schema, table_name, True)
        self.progress(3, "Dropping table:", db_table_name)

        # Get its descriptor
        table_desc = self.tableDescriptorFor(schema, table_name)

        # Drop table
        self.execute("DROP TABLE {}".format(db_table_name))

        # Drop any associated sequences
        self.dropSequencesFor(table_desc)

        # Remove it from self's metadata
        self.metadata.clear()

    def table(self, schema, table_name):
        """
        Load SQLAlchemy definition of TABLE_NAME
        """

        return self.sqaMetadataFor(self.metadata, schema, table_name, True)

    def sqaMetadataFor(self, metadata, schema, table_name, load_if_not_present=False):
        """
        Helper to get definition for TABLE_NAME from SQLAlchemy METADATA (if there is one)
        """

        # ENH: Move to different class?

        # Get database name of table
        db_schema = self.dbNameFor(schema)
        db_table_name = self.dbNameFor(schema, table_name)
        db_full_table_name = self.dbNameFor(schema, table_name, True)

        # Construct key with which it is stored in metadata
        metadata_key = db_full_table_name
        if db_schema == "":
            metadata_key = "." + metadata_key

        # Hack beacuse SQLAlchemy reflection translates table names to lower case
        if not metadata_key in metadata.tables:
            if metadata_key.lower() in metadata.tables:
                metadata_key = metadata_key.lower()

        # Get its definition (if requested)
        if not metadata_key in metadata.tables and load_if_not_present:
            metadata.reflect(only=[db_table_name.lower()], schema=db_schema)
            metadata_key = metadata_key.lower()

        return metadata.tables.get(metadata_key)

    # ==============================================================================
    #                               TABLE MUTATION
    # ==============================================================================

    def alterTable(
        self,
        schema,
        table_name,
        old_table_desc,
        new_table_desc,
        date_format=None,
        timestamp_format=None,
    ):
        """
        Alter shape of a table from OLD_TABLE_DESC to NEW_TABLE_DESC

        OLD_TABLE_DESC and NEW_TABLE_DESC are MywDbTable objects.
        DATE_FORMAT and TIMESTAMP_FORMAT are required for mutations from string format"""

        changed = False

        with self.progress.operation("Mutating table", "{}.{}".format(schema, table_name)):

            # Build sql to make all changes (first, in case something fails)
            sqls = self.alterTableSqls(
                schema,
                table_name,
                old_table_desc,
                new_table_desc,
                date_format=date_format,
                timestamp_format=timestamp_format,
            )

            # Apply changes
            if sqls:
                self.progress(1, "Applying SQL")
                self.execute(sqls)
                changed = True

                self.metadata.clear()  # ENH: Just for this table

        return changed

    def alterTableSqls(
        self,
        schema,
        table_name,
        old_table_desc,
        new_table_desc,
        date_format=None,
        timestamp_format=None,
    ):
        """
        Build SQL statements to alter shape of a table from OLD_TABLE_DESC to NEW_TABLE_DESC

        OLD_TABLE_DESC and NEW_TABLE_DESC are MywDbTable objects.
        DATE_FORMAT and TIMESTAMP_FORMAT are required for mutations from string format"""

        # Note: Gets subclassed in SQLite

        sql_formatter = lambda line: "-> " + line

        db_table_name = self.dbNameFor(schema, table_name, True)

        sqls = []
        for table_change in old_table_desc.mutationsTo(new_table_desc):
            with self.progress.operation("Building SQL for:", table_change.description()):

                tc_sqls = self.sqlsForTableChange(
                    schema, table_name, table_change, date_format, timestamp_format
                )
                if tc_sqls:
                    self.progress(2, "\n".join(map(sql_formatter, tc_sqls)))
                    sqls.extend(tc_sqls)
                else:
                    self.progress(3, "No change required")

        return sqls

    def sqlsForTableChange(
        self, schema, table_name, table_change, date_format=None, timestamp_format=None
    ):
        """
        Returns a list of SQL statements to perform TABLE_CHANGE

        Optional DATE_FORMAT and TIMESTAMP_FORMAT are Python
        data/datetime format specifications used when converting from string format
        """

        tc = table_change

        if table_change.change_type == "add field":
            return self.addColumnSqls(schema, table_name, tc.column_desc)

        elif table_change.change_type == "alter field":
            return self.alterColumnSqls(
                schema,
                table_name,
                tc.old_column_desc,
                tc.new_column_desc,
                date_format,
                timestamp_format,
            )

        elif table_change.change_type == "drop field":
            return self.dropColumnSqls(schema, table_name, tc.column_desc)

        elif table_change.change_type == "add index":
            return self.addIndexSqls(schema, table_name, tc.index_desc)

        elif table_change.change_type == "drop index":
            return self.dropIndexSqls(schema, table_name, tc.index_desc)

        else:
            raise Exception("Bad change type")  # Should never happen

    def sqlColumnDefFor(self, column_desc):
        """
        Returns SQL clause that defines column COLUMN_DESC (a MywDbColumn)
        """

        sql_def = self.sqlTypeFor(column_desc.name, column_desc.type_desc)

        # Add generator/default
        default = self.sqlDefaultFor(column_desc)
        if default != None:
            sql_def += " DEFAULT " + default

        # Add null constraint
        if not column_desc.nullable:
            sql_def += " NOT NULL"

        return sql_def

    def sqlDefaultFor(self, column_desc, quote_string_values=True):
        """
        Return SQL default value for COLUMN_DESC (a string or None)
        """

        # ENH: Check not generator and default
        myw_type = column_desc.type
        base_type = column_desc.type_desc.base
        generator = column_desc.generator
        default_value = column_desc.default

        if generator != None:
            if (base_type == "integer") and (generator == "sequence"):
                return None
            elif (base_type == "timestamp") and (generator == "system_now"):
                return "CURRENT_TIMESTAMP"
            elif (base_type == "string") and (generator == "application"):
                return None
            elif (base_type == "string") and (generator == "user"):
                return None
            else:
                raise MywError(
                    "Field {}: Bad generator for type {}: {}".format(
                        column_desc.name, myw_type, generator
                    )
                )

        if default_value != None:
            type_desc = column_desc.type_desc

            # ENH: Fix reflection of default value and remove this
            if isinstance(default_value, str):
                default_value = type_desc.convert(default_value)

            if type_desc.base == "boolean":
                return "{}".format(self.boolean_sql_strs[default_value])

            elif type_desc.base in ["integer", "double", "numeric"]:
                return "{}".format(default_value)

            elif type_desc.base in ["date", "timestamp"]:
                return "'{}'".format(default_value.isoformat())

            else:
                if quote_string_values:
                    return "'{}'".format(self.sqlEscape(default_value))
                else:
                    return "{}".format(self.sqlEscape(default_value))

        return None

    def sqlTimestampType(self, timezone_opt=None):
        """
        Returns the SQL data type for a timestamp field
        """

        sql_type = "timestamp"

        if timezone_opt == "timezone":
            sql_type += " with time zone"

        # ENH: Report unhandled args

        return sql_type

    def addColumn(self, schema, table_name, column_desc):
        """
        Add a column to TABLE_NAME

        COLUMN_DESC is a MywDbColumn"""

        self.execute(self.addColumnSqls(schema, table_name, column_desc))

    def alterColumn(self, schema, table_name, old_column_desc, new_column_desc, date_format=None):
        """
        Modify a column of TABLE_NAME

        OLD_COLUMN_DESC and NEW_COLUMN_DESC are MywDbColumn objects"""

        self.execute(
            self.alterColumnSqls(
                schema, table_name, old_column_desc, new_column_desc, date_format, None
            )
        )

    def dropColumn(self, schema, table_name, column_desc):
        """
        Drop a column from TABLE_NAME

        COLUMN_DESC is a MywDbColumn object (or the column name)"""

        if not isinstance(column_desc, MywDbColumn):
            column_desc = self.tableDescriptorFor(schema, table_name).columns[column_desc]

        self.execute(self.dropColumnSqls(schema, table_name, column_desc))

    def prepareForInsert(self, feature_type, rec, insert):
        """
        Called before feature record REC is inserted/updated during data load
        """
        # Gets subclassed in sqlite driver

        pass

    # ==============================================================================
    #                               INDEX MANAGEMENT
    # ==============================================================================

    def addIndex(self, schema, table_name, index_desc):
        """
        Create an index on TABLE_NAME
        """

        self.execute(self.addIndexSqls(schema, table_name, index_desc))

    def dropIndex(self, schema, table_name, index_desc):
        """
        Drop index on COLUMN_NAMES (which must exist)
        """

        self.execute(self.dropIndexSqls(schema, table_name, index_desc))

    def addIndexSqls(self, schema, table_name, index_desc):
        """
        Returns SQL statements to create an index on TABLE_NAME
        """
        # Gets subclassed in drivers to handle options
        # ENH: Check type is 'plain'

        self.progress(7, self, "Adding index", schema, table_name, index_desc)

        db_table_name = self.dbNameFor(schema, table_name, True)
        db_index_name = self.dbIndexNameFor(schema, table_name, index_desc.column_names)
        db_column_names = self.quotedColumnNames(index_desc.column_names)

        sql = "CREATE INDEX {} ON {} ({})".format(
            db_index_name, db_table_name, ",".join(db_column_names)
        )
        return [sql]

    def dropIndexSqls(self, schema, table_name, index_desc):
        """
        Returns SQL statements to drop index on COLUMN_NAMES (which must exist)
        """

        db_index_name = self.dbIndexNameFor(schema, table_name, index_desc.column_names, True)

        sql = "DROP INDEX {}".format(db_index_name)
        return [sql]

    # ==============================================================================
    #                             CONSTRAINT MANAGEMENT
    # ==============================================================================

    def addConstraint(self, schema, table_name, constraint_desc):
        """
        Create a constraint on TABLE_NAME

        CONSTRAINT_DESC is a MywDbConstraint descriptor"""

        self.execute(self.addConstraintSqls(schema, table_name, constraint_desc))

    def dropConstraint(self, schema, table_name, constraint_desc):
        """
        Drop a constraint of TABLE_NAME (which must exist)

        CONSTRAINT_DESC is a MywDbConstraint descriptor"""

        self.execute(self.dropConstraintSqls(schema, table_name, constraint_desc))

    def addConstraintSqls(self, schema, table_name, constraint_desc):
        """
        Returns SQL statements a constraint on TABLE_NAME

        CONSTRAINT_DESC is a MywDbConstraint descriptor"""

        if constraint_desc.type in ["PRIMARY KEY", "UNIQUE"]:
            return self.addUniqueConstraintSqls(schema, table_name, constraint_desc)

        elif constraint_desc.type in ["FOREIGN KEY"]:
            return self.addForeignKeyConstraintSqls(schema, table_name, constraint_desc)

        else:
            raise MywInternalError("Bad constraint type: " + constraint_desc.type)

    def addUniqueConstraintSqls(self, schema, table_name, constraint_desc):
        """
        Returns SQL statements a primary key or unique constraint on TABLE_NAME

        CONSTRAINT_DESC is a MywDbConstraint descriptor"""

        db_table_name = self.dbNameFor(schema, table_name, True)
        db_constraint_name = self.dbConstraintNameFor(
            schema, table_name, constraint_desc.type, constraint_desc.column_names
        )
        db_column_names = self.quotedColumnNames(constraint_desc.column_names)

        sql = "ALTER TABLE {} ADD CONSTRAINT {} {} ({})".format(
            db_table_name, db_constraint_name, constraint_desc.type, ",".join(db_column_names)
        )

        return [sql]

    def addForeignKeyConstraintSqls(self, schema, table_name, constraint_desc):
        """
        Returns SQL statements to add a foreign key constraint on TABLE_NAME
        """

        column_name = constraint_desc.column_names[0]

        db_table_name = self.dbNameFor(schema, table_name, True)
        db_constraint_name = self.dbConstraintNameFor(
            schema, table_name, constraint_desc.type, constraint_desc.column_names
        )
        db_column_name = self.quotedColumnName(column_name)

        ref_column_desc = constraint_desc.reference
        ref_db_table_name = self.dbNameFor(
            ref_column_desc.table.schema, ref_column_desc.table.name, True
        )
        ref_db_column_name = self.quotedColumnName(ref_column_desc.name)

        sql = "ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({})".format(
            db_table_name, db_constraint_name, db_column_name, ref_db_table_name, ref_db_column_name
        )
        return [sql]

    def dropConstraintSqls(self, schema, table_name, constraint_desc):
        """
        Returns SQLstatements to drop a constraint of TABLE_NAME (which must exist)
        """

        db_table_name = self.dbNameFor(schema, table_name, True)
        db_constraint_name = self.dbConstraintNameFor(
            schema, table_name, constraint_desc.type, constraint_desc.column_names
        )  # ENH: Add arg exists=true

        sql = "ALTER TABLE {} DROP CONSTRAINT {}".format(db_table_name, db_constraint_name)
        return [sql]

    # ==============================================================================
    #                                SEQUENCE MANAGEMENT
    # ==============================================================================

    def addSequencesFor(self, table_desc):
        """
        Create sequences required by TABLE_DESC (a MywDbTable)
        """
        # Note: Delta tables used sequences from data schema

        if table_desc.schema == "delta":
            return

        for field_name, column_desc in list(table_desc.columns.items()):
            if column_desc.generator == "sequence":
                self.addSequence(table_desc.schema, table_desc.name, field_name)

    def dropSequencesFor(self, table_desc):
        """
        Drop sequences owned by TABLE_DESC (a MywDbTable)
        """
        # Note: Use 'if exists' here because pre-3.0 databases used type 'serial' which dropped it's sequence automatically

        if table_desc.schema == "delta":
            return

        for field_name, column_desc in list(table_desc.columns.items()):
            self.dropSequenceIfExists(table_desc.schema, table_desc.name, field_name)

    def addSequence(self, schema, table_name, field_name):
        """
        Add id generator for FIELD_NAME
        """

        db_seq_name = self.dbSequenceNameFor(schema, table_name, field_name, True)

        self.progress(4, "Creating sequence", db_seq_name)
        sql = "CREATE SEQUENCE " + db_seq_name
        self.execute(sql)

        return db_seq_name

    def listSequences(self, schema):
        """
        Returns names of sequences in SCHEMA
        """

        sql = "select sequence_name from information_schema.sequences where sequence_schema = '{}'".format(
            schema
        )
        for rec in self.session.execute(sql):
            yield rec[0]

    def adjustSequenceRangeFor(self, schema, table, field, min_value, max_value, restart=False):
        """
        Set the range for sequence SEQ_NAME
        """
        # ENH: Support feedback in GUI e.g. raise event

        seq_name = self.dbSequenceNameFor(schema, table, field, True)
        # Note: Attempting to set MINVALUE gives error (PostgreSQL bug?)
        sql = "ALTER SEQUENCE {} NO MINVALUE MAXVALUE {}".format(seq_name, max_value)

        if restart:
            sql += " RESTART WITH {}".format(min_value)

        self.session.execute(sql)

    def sequenceRange(self, schema, table, field):
        """
        Returns min and max of values for generator of TABLE.FIELD (if known)
        """
        # Gets subclassed in Postgres driver

        return None, None

    # ==============================================================================
    #                          FEATURE TABLE TRIGGER GENERATION
    # ==============================================================================

    def featureTriggerSqls(self, feature_schema, feature_rec, trigger_type):
        """
        Returns SQL defining TRIGGER_TYPE trigger for FEATURE_REC

        TRIGGER_TYPE is "insert", "update" or "delete". FEATURE_SCHEMA is 'data' or 'delta'

        String returned consists of a function that maintains
        geometry indexes, search indexes etc plus statement to set
        it as the trigger for FEATURE_REC."""

        # Warning: Cannot use MywDDFeature behaviour on FEATURE_REC as in upgrade will be a raw model

        # Get feature properties
        feature_type = feature_rec.feature_name
        title_expr = feature_rec.title_expr
        short_description_expr = feature_rec.short_description_expr
        filter_ctrl = self.filterCtrlFor(feature_rec)
        db_table_name = self.dbNameFor(feature_schema, feature_type, True, quoted=True)
        trigger_name = self.dbTriggerNameFor(feature_schema, feature_type, trigger_type)

        # Build declaration
        trigger_conditions = "AFTER " + trigger_type.upper() + " ON " + db_table_name

        # Build body
        trigger_body = ""
        trigger_body += self.featureTriggerDeclarationsSql(trigger_type)
        trigger_body += self.acquireVersionStampLockSql()

        if feature_schema in ["data", "delta"]:
            trigger_body += self.featureTriggerSetIdSql(feature_rec, trigger_type)
            trigger_body += self.featureTriggerGeomIndexSql(
                feature_schema, feature_rec, trigger_type, filter_ctrl
            )
            trigger_body += self.featureTriggerSearchIndexesSql(
                feature_schema, feature_rec, trigger_type, filter_ctrl
            )

        trigger_body += self.featureLogChangeSql(feature_schema, feature_rec, trigger_type)

        # Constructk trigger
        return self._createTriggerSqls(
            feature_schema,
            trigger_name,
            feature_type,
            trigger_type,
            trigger_conditions,
            trigger_body,
        )

    def featureTriggerDeclarationsSql(self, trigger_type):
        """
        Returns SQL with section declaring variables that maybe used by other sections of feature trigger code

        TRIGGER_TYPE is "insert", "update" or "delete"."""

        return ""

    def featureTriggerSetIdSql(self, feature_rec, trigger_type):
        """
        Returns sql to allocate a record ID on insert (if record has ID generator)

        TRIGGER_TYPE is "insert", "update" or "delete"."""

        feature_type = feature_rec.feature_name
        key_field_name = feature_rec.key_name

        if trigger_type == "insert" and self._fieldHasKeyGenerator(feature_type, key_field_name):
            return self._featureTriggerSetKeySql(feature_type, key_field_name)
        else:
            return ""

    def featureTriggerGeomIndexSql(self, feature_schema, feature_rec, trigger_type, filter_ctrl):
        """
        Returns SQL for maintaining geometry index tables for FEATURE_REC

        TRIGGER_TYPE is "insert", "update" or "delete".
        """

        feature_type = feature_rec.feature_name
        key_field_name = feature_rec.key_name

        # Build SQL
        sql = ""

        # Delete existing index records
        # ENH: Skip this for geometryless features
        if trigger_type in ["update", "delete"]:
            for world_type, geom_type in self.geom_index_tables():
                sql += self.geomIndexRecDeleteSql(
                    world_type, geom_type, feature_schema, feature_type, key_field_name, True
                )
            sql += "\n"

        # Create new index records
        if trigger_type in ["insert", "update"]:
            for geom_field_name, world_field_name in list(
                self.geomFieldInfoFor(feature_type).items()
            ):
                for world_type, geom_type in self.geom_index_tables():
                    sql += self.geomIndexRecInsertSql(
                        world_type,
                        geom_type,
                        feature_schema,
                        feature_type,
                        filter_ctrl,
                        key_field_name,
                        geom_field_name,
                        world_field_name,
                        True,
                    )
                sql += "\n"

        return sql

    def geomIndexRecInsertSql(
        self,
        world_type,
        geom_type,
        feature_schema,
        feature_type,
        filter_ctrl,
        key_field_name,
        geom_field_name,
        world_field_name,
        for_trigger,
    ):
        """
        Build insert clause for a geometry index record
        """

        # Check for no world_name field on feature
        if world_type == "int" and not world_field_name:
            return ""

        # Determine table to scan
        index_table_name = "{}_world_{}".format(world_type, geom_type)
        if feature_schema == "delta":
            index_table_name = "delta_" + index_table_name

        # Get internal names of tables
        db_index_table_name = self.dbNameFor("myw", index_table_name, True)
        db_feature_table_name = self.dbNameFor(feature_schema, feature_type, True)

        cols = self._getTable("myw", index_table_name).columns
        filter_val_len = cols["filter1_val"].type.length or 50  # OR 50 needed for SQLite db

        # If not trigger, build from select statement
        if for_trigger:
            feature_rec_from = self.from_dual_str
            ftr_rec = self.trigger_new
        else:
            feature_rec_from = "    FROM {} f\n".format(db_feature_table_name)
            ftr_rec = "f"

        # Build list of index rec fields to populate .. and values to use
        index_rec_fields = OrderedDict()
        index_rec_fields["feature_id"] = "{ftr_rec}.{key_field_name}"
        index_rec_fields["feature_table"] = "'{feature_type}'"
        index_rec_fields["myw_world_name"] = "{ftr_rec}.{world_field_name}"
        index_rec_fields["the_geom"] = "{ftr_rec}.{geom_field_name}"
        index_rec_fields["field_name"] = "'{geom_field_name}'"

        for filter_field, feature_field in list(filter_ctrl.items()):
            index_rec_fields[filter_field] = self.trimExpr(
                "{ftr_rec}." + feature_field, filter_val_len
            )  # ENH: Quote name

        if world_type == "geo":
            del index_rec_fields["myw_world_name"]

        if feature_schema == "delta":
            index_rec_fields["delta"] = "{ftr_rec}.myw_delta"
            index_rec_fields["change_type"] = "{ftr_rec}.myw_change_type"

        # Build template
        sql = ""
        sql += "  INSERT INTO {table_name} ( {field_names} ) \n"
        sql += "    SELECT {field_values}\n"
        sql += feature_rec_from
        sql += "    WHERE {geom_type_clause}"

        if world_field_name:
            sql += "\n      AND {ftr_rec}.{world_field_name} {world_type_clause}"

        # Do substitutions
        sql = sql.replace("{field_values}", ", ".join(list(index_rec_fields.values())))

        sql = sql.format(
            table_name=db_index_table_name,
            feature_type=feature_type,
            ftr_rec=ftr_rec,
            field_names=", ".join(list(index_rec_fields.keys())),
            field_values=", ".join(list(index_rec_fields.values())),
            key_field_name=key_field_name,
            geom_field_name=geom_field_name,
            world_field_name=world_field_name,
            geom_type_clause=self._getGeomTypeClause(ftr_rec + "." + geom_field_name, geom_type),
            world_type_clause=self.geomWorldTypeClause(world_type),
        )

        if for_trigger:
            sql += ";"

        return sql + " \n"

    def geomWorldTypeClause(self, world_type):
        """
        SQL test for filtering on world name field
        """

        if world_type == "geo":
            world_sel = "IN ('default','geo')"
        else:
            world_sel = "NOT IN ('default','geo','none')"

        return world_sel

    def geomIndexRecDeleteSql(
        self, world_type, geom_type, feature_schema, feature_type, key_field_name, for_trigger
    ):
        """
        Build delete clause for a geometry index record
        """

        # Determine table to scan
        index_table_name = "{}_world_{}".format(world_type, geom_type)
        if feature_schema == "delta":
            index_table_name = "delta_" + index_table_name

        # Get its internal name
        db_index_table_name = self.dbNameFor("myw", index_table_name, True)

        # Build SQL
        sql = "  DELETE FROM {} \n".format(db_index_table_name)
        sql += "    WHERE feature_table = '{}'".format(feature_type)

        if for_trigger:
            if feature_schema == "delta":
                sql += "    AND delta = {}.{}".format(self.trigger_old, "myw_delta")
            sql += "    AND feature_id = '' || {}.{}".format(self.trigger_old, key_field_name)
            sql += ";"

        return sql + "\n"

    def _getGeomTypeClause(self, geom_exp, geom_type):
        """
        Returns sql clause that tests if GEOM_EXP is a geometry of myWorld geometry type GEOM_TYPE

        GEOM_TYPE should be one of: "point", "linestring", "polygon"
        """
        raise Exception("_getGeomTypeClause not implemented")

    def featureTriggerSearchIndexesSql(
        self, feature_schema, feature_rec, trigger_type, filter_ctrl
    ):
        """
        Returns SQL for maintaining search index table for FEATURE_REC

        TRIGGER_TYPE is "insert", "update" or "delete". FILTER_CTRL
        defines the values for the index record filter_val fields.
        """
        # ENH optimize this for delete trigger - no need for seperate delete statements on search table

        search_rule_recs = self.searchRuleRecsFor(feature_rec)

        sql = ""
        for search_rule_rec in search_rule_recs:
            sql += self._featureTriggerSearchIndexSql(
                feature_schema,
                feature_rec,
                trigger_type,
                filter_ctrl,
                search_rule_rec,
                search_rule_recs,
            )
            sql += "\n"

        return sql

    def _featureTriggerSearchIndexSql(
        self,
        feature_schema,
        feature_rec,
        trigger_type,
        filter_ctrl,
        search_rule_rec,
        search_rule_recs,
    ):
        """
        Returns SQL for maintaining search index table for FEATURE_TYPE and SEARCH_RULE

        TRIGGER_TYPE is "insert", "update" or "delete".
        SEARCH_RULE_RECS is the list of all search rules for FEATURE_TYPE (required to build extra_values)
        """

        table_name = "search_string"
        if feature_schema == "delta":
            table_name = "delta_" + table_name

        db_table_name = self.dbNameFor("myw", table_name, True)
        feature_type = feature_rec.feature_name

        # Get field expressions
        index_rec_fields = self.searchStringFieldExprs(
            feature_schema,
            feature_rec,
            filter_ctrl,
            search_rule_rec,
            search_rule_recs,
            trigger_type,
        )
        feature_id_sql = index_rec_fields["feature_id"]

        sql = ""

        # Delete old record
        if trigger_type in ["update", "delete"]:

            index_rec_key_fields = ["search_rule_id", "feature_id"]
            if feature_schema == "delta":
                index_rec_key_fields.append("delta")

            sql += "  DELETE FROM " + db_table_name + "\n" + "   "
            sep = "WHERE"
            for key in index_rec_key_fields:
                sql += " {} {} = {}".format(sep, key, index_rec_fields[key])
                sep = "AND"
            sql += ";\n"

        # Create new one
        if trigger_type in ["insert", "update"]:
            field_names_str = ", ".join(list(index_rec_fields.keys()))
            field_values_str = ", ".join(list(index_rec_fields.values()))

            sql += "  INSERT INTO {} ( {} ) \n".format(db_table_name, field_names_str)
            sql += "    VALUES ( {} );\n".format(field_values_str)

        return sql

    def searchStringFieldExprs(
        self,
        feature_schema,
        feature_rec,
        filter_ctrl,
        search_rule_rec,
        search_rule_recs,
        trigger_type=None,
    ):
        """
        SQL expressions for populating a search string index record

        Returns an ordered list keyed by field name"""

        trigger = trigger_type != None

        # Work out placeholder to use
        # ENH: Encapsulate in a method
        if trigger_type == "delete":
            rec_placeholder = self.trigger_old + "."
        elif trigger_type in ("insert", "update"):
            rec_placeholder = self.trigger_new + "."
        else:
            rec_placeholder = ""

        feature_type = feature_rec.feature_name
        key_field_name = feature_rec.key_name
        db_table_name = self.dbNameFor("myw", "search_string", True)

        # Get index record column sizes
        # Note: Defaults are for sqlite # ENH: Find a neater way
        cols = self._getTable("myw", "search_string").columns
        search_val_len = cols["search_val"].type.length or 200
        search_desc_len = cols["search_desc"].type.length or 500
        extra_values_len = cols["extra_values"].type.length or 200
        filter_val_len = cols["filter1_val"].type.length or 50

        search_val_expr = self.convertExpressionToSql(
            feature_rec, search_rule_rec.search_val_expr, max_length=search_val_len, trigger=trigger
        )

        search_desc_expr = self.convertExpressionToSql(
            feature_rec,
            search_rule_rec.search_desc_expr,
            max_length=search_desc_len,
            trigger=trigger,
        )

        extra_values_expr = self.searchStringExtraValuesExpr(
            feature_rec, search_rule_recs, extra_values_len, trigger
        )

        # Build expression SQLs
        index_rec_fields = OrderedDict()
        index_rec_fields["search_rule_id"] = str(search_rule_rec.id)
        index_rec_fields["feature_name"] = "'{}'".format(feature_type)
        index_rec_fields["feature_id"] = "'' || {}{}".format(rec_placeholder, key_field_name)
        index_rec_fields["search_val"] = "trim(lower(''|| {} ))".format(search_val_expr)
        index_rec_fields["search_desc"] = "( {} )".format(search_desc_expr)
        index_rec_fields["extra_values"] = extra_values_expr

        if feature_schema == "delta":
            index_rec_fields["delta"] = "{}{}".format(rec_placeholder, "myw_delta")
            index_rec_fields["change_type"] = "{}{}".format(rec_placeholder, "myw_change_type")

        for filter_field, feature_field in list(filter_ctrl.items()):
            index_rec_fields[filter_field] = self.trimExpr(
                rec_placeholder + feature_field, filter_val_len
            )  # TODO: Quote name

        return index_rec_fields

    def searchStringExtraValuesExpr(self, feature_rec, search_rule_recs, max_len, for_trigger):
        """
        Returns an sql expression to be used when updating the search string values
        """

        if for_trigger:
            placeholder = self.trigger_new + "."
        else:
            placeholder = ""

        extra_values = "'" + feature_rec.external_name.lower() + "'"

        for rec in search_rule_recs:
            extra_values += (
                " || '|' || "
                + "lower(''|| "
                + self.convertExpressionToSql(feature_rec, rec.search_val_expr, trigger=for_trigger)
                + " )"
            )

        extra_values = self.trimExpr(extra_values, max_len)

        return extra_values

    def featureLogChangeSql(self, feature_schema, feature_rec, trigger_type):
        """
        Returns SQL for maintaining the transaction log

        TRIGGER_TYPE is "insert", "update" or "delete".
        """

        feature_type = feature_rec.feature_name
        track_changes = feature_rec.track_changes
        key_field_name = feature_rec.key_name

        if not track_changes:
            return ""

        # Determine target table
        table_name = "transaction_log"
        if feature_schema in ["delta", "base"]:
            table_name = feature_schema + "_" + table_name

        # Build field names and values
        feature_rec_ref = self.trigger_old if trigger_type == "delete" else self.trigger_new

        fields = OrderedDict()
        fields["operation"] = "'{}'".format(trigger_type)
        fields["feature_type"] = "'{}'".format(feature_type)
        fields["feature_id"] = "{}.{}".format(feature_rec_ref, key_field_name)

        if feature_schema in ["delta", "base"]:
            fields["delta"] = "{}.{}".format(feature_rec_ref, "myw_delta")

        fields["version"] = "version"

        # Build SQL
        sql = (
            "  INSERT INTO {db_table_name} ( {field_names} ) \n"
            + "    SELECT {field_values} \n"
            + "      FROM {version_stamp_table} WHERE component='data';\n\n"
        )

        sql = sql.format(
            db_table_name=self.dbNameFor("myw", table_name, True),
            field_names=", ".join(list(fields.keys())),
            field_values=", ".join(list(fields.values())),
            version_stamp_table=self.dbNameFor("myw", "version_stamp", True),
        )

        return sql

    def geomFieldInfoFor(self, feature_type):
        """
        The geometry fields and associated world name fields for myWorld feature FEATURE_TYPE

        Returns an ordered list of world field names, keyed by geom field name"""

        MywDDFeature = self.rawModelFor("myw", "dd_feature")
        MywDDField = self.rawModelFor("myw", "dd_field")

        feature_rec = (
            self.session.query(MywDDFeature)
            .filter(
                (MywDDFeature.datasource_name == "myworld")
                & (MywDDFeature.feature_name == feature_type)
            )
            .first()
        )

        field_recs = (
            self.session.query(MywDDField)
            .filter(
                (MywDDField.datasource_name == "myworld") & (MywDDField.table_name == feature_type)
            )
            .order_by(MywDDField.id)
            .all()
        )

        return self.geomFieldInfoFrom(feature_rec, field_recs)

    def geomFieldInfoFrom(self, feature_rec, field_recs):
        """
        The geometry fields and associated world name fields from FIELD_RECS

        FIELD_RECS is a set of field definitions

        Returns an ordered list of mappings from geom field name to
        associated world field name (None if no gwn field)"""

        # Provided to avoid duplication of logic between driver and dd

        geom_field_infos = OrderedDict()

        stored_field_recs = [r for r in field_recs if r.value == None]
        stored_field_names = [r.internal_name for r in stored_field_recs]

        for field_rec in stored_field_recs:
            field_name = field_rec.internal_name

            if not field_rec.type in self.geom_types:
                continue

            # Build name of associated world name field
            if field_name == feature_rec.primary_geom_name:
                world_field_name = "myw_geometry_world_name"
            else:
                world_field_name = "myw_gwn_" + field_name

            # Check for no associated world name field (means geom is always in 'geo')
            if not world_field_name in stored_field_names:
                world_field_name = None

            geom_field_infos[field_name] = world_field_name

        return geom_field_infos

    def filterCtrlFor(self, feature_rec):
        """
        Mapping from index record filter fields to fields on FEATURE_REC e.g.

           filter1_val:  'owner'
           filter2_val:  'status'

        Used in trigger code fro building index records"""

        # Get names of filter map columns
        # ENH: Could derive from dd info in feature_rec.__table__
        filter_map_fields = []
        for field_name in sorted(feature_rec.__table__.columns.keys()):
            if re.match("^filter\d+_field", field_name):
                filter_map_fields.append(field_name)

        # Build mapping
        filter_ctrl = OrderedDict()

        for prop in filter_map_fields:
            field_name = getattr(feature_rec, prop)
            if field_name != None:
                index_rec_prop = prop.replace("_field", "_val")
                filter_ctrl[index_rec_prop] = field_name

        return filter_ctrl

    def geom_index_tables(self):
        """
        The world_type,geom_type pairs for which we maintain index tables
        """

        for world_type in self.world_types:
            for geom_type in self.geom_types:
                yield world_type, geom_type

    # ==============================================================================
    #                              SQL FOR BULK UPDATE
    # ==============================================================================

    def disableTriggersFor(self, feature_type):
        """
        Disables the triggers on the table for FEATURE_TYPE
        """
        self.execute(self.disableTriggersSql(feature_type))

    def enableTriggersFor(self, feature_type):
        """
        Enables the triggers on the table for FEATURE_TYPE
        """
        self.execute(self.enableTriggersSql(feature_type))

    def rebuildGeomIndexesFor(self, feature_schema, feature_rec):
        """
        Recreate geometry index records for FEATURE_REC

        Returns number of rows updated"""

        sqls = self.rebuildGeomIndexesSqls(feature_schema, feature_rec)

        return self.executeCounting(sqls, "INSERT")

    def rebuildGeomIndexesSqls(self, feature_schema, feature_rec):
        """
        Returns a list of SQL statements to update the geometry index records for FEATURE_REC
        """

        feature_type = feature_rec.feature_name
        filter_ctrl = self.filterCtrlFor(feature_rec)
        key_field_name = feature_rec.key_name

        # Build SQL
        sqls = []
        for world_type, geom_type in self.geom_index_tables():

            # Delete old records from the geometry tables
            sql = self.geomIndexRecDeleteSql(
                world_type, geom_type, feature_schema, feature_type, key_field_name, False
            )
            sqls.append(sql)

            # For each geometry field on feature .. build insert statement
            for geom_field_name, world_field_name in list(
                self.geomFieldInfoFor(feature_type).items()
            ):
                sql = self.geomIndexRecInsertSql(
                    world_type,
                    geom_type,
                    feature_schema,
                    feature_type,
                    filter_ctrl,
                    key_field_name,
                    geom_field_name,
                    world_field_name,
                    False,
                )

                if sql:
                    sqls.append(sql)

        return sqls

    def rebuildSearchStringsFor(self, feature_schema, feature_rec, search_rule_rec):
        """
        Rebuild search string records for SEARCH_RULE_REC

        Returns number of records inserted"""

        sqls = self.rebuildSearchStringsSqls(feature_schema, feature_rec, search_rule_rec)

        return self.executeCounting(sqls, "INSERT")

    def rebuildSearchStringsSqls(self, feature_schema, feature_rec, search_rule_rec):
        """
        Returns SQL to rebuild search string records for SEARCH_RULE_REC
        """

        feature_type = search_rule_rec.feature_name

        # Determine index table name
        index_table_name = "search_string"
        if feature_schema == "delta":
            index_table_name = "delta_" + index_table_name

        # Get internal names of tables
        db_table_name = self.dbNameFor("myw", index_table_name, True)
        db_feature_table_name = self.dbNameFor(feature_schema, feature_type, True)

        # Find all configured searches (required for building extra values string)
        search_rule_recs = self.searchRuleRecsFor(feature_rec)
        filter_ctrl = self.filterCtrlFor(feature_rec)

        # Delete old records from the search strings table
        sqls = self.searchStringDeleteSqls(feature_schema, search_rule_rec.id)

        # Add the new ones
        index_rec_fields = self.searchStringFieldExprs(
            feature_schema, feature_rec, filter_ctrl, search_rule_rec, search_rule_recs
        )
        field_names_str = ", ".join(list(index_rec_fields.keys()))
        field_values_str = ", \n         ".join(list(index_rec_fields.values()))

        sql = "INSERT INTO {} ( {} ) \n".format(db_table_name, field_names_str)
        sql += "  SELECT {}\n".format(field_values_str)
        sql += "    FROM {}".format(db_feature_table_name)

        sqls.append(sql)

        return sqls

    def deleteSearchStringsFor(self, feature_schema, search_rule_id):
        """
        Deletes index records for SEARCH_RULE_ID
        """

        sqls = self.searchStringDeleteSqls(feature_schema, search_rule_id)

        self.execute(sqls)

    def searchStringDeleteSqls(self, feature_schema, search_rule_id):
        """
        Returns SQLs for deleting index records for SEARCH_RULE_ID
        """

        # Determine index table name
        index_table_name = "search_string"
        if feature_schema == "delta":
            index_table_name = "delta_" + index_table_name

        db_table_name = self.dbNameFor("myw", index_table_name, True)

        # Build SQL
        sql = "DELETE FROM " + db_table_name
        sql += " WHERE search_rule_id = " + str(search_rule_id)

        return [sql]

    def nextValSql(self, schema, table, field):
        """
        Returns SQL for obtaining the next value of SEQUENCE_NAME
        """
        raise Exception("nextValSql not implemented")

    def withinExpr(self, geometry_column, point, tolerance):
        """
        Returns sqlalchemy predicate that selects geometries within TOLERANCE of POINT

        POINT is a Point in WGS84 long/lat degrees. TOLERANCE is a distance in metres"""

        raise Exception("withinExpr not implemented")

    def convertExpressionToSql(self, feature_rec, expression, max_length=None, trigger=False):
        """
        Convert a myWorld EXPRESSION to SQL

        Substitutes elements of the form [<field_name>] by reference to that field"""

        if expression is None:
            return "''"

        # Build list of pseudo-fields (in substitution order)
        # ENH: Duplicated with feature_descriptor (which is not availble during upgrades)
        pseudo_fields = OrderedDict()
        pseudo_fields["short_description"] = feature_rec.short_description_expr
        pseudo_fields["title"] = feature_rec.title_expr
        pseudo_fields["display_name"] = feature_rec.external_name
        pseudo_fields["external_name"] = feature_rec.external_name  # For pre-4.3 compatibility

        # Parse expression into a list of elements
        els = MywExpressionParser(expression, pseudo_fields).parse()

        # Handle empty string
        if not els:
            els.append(("literal", ""))

        # Construct sql string
        sql_els = []
        for (el_type, value) in els:

            # Case literal: Escape quotes etc
            if el_type == "literal":
                sql_value = "'" + self.sqlEscape(value, trigger) + "'"

            # Case literal: Escape reserved words, handle null values, ...
            elif el_type == "field":
                sql_value = self.quotedColumnName(value)

                if trigger:
                    sql_value = self.trigger_new + "." + sql_value

                sql_value = self.asSqlString(sql_value)

            sql_els.append(sql_value)

        sql = " || ".join(sql_els)

        # Trim value to max_length
        if max_length != None and len(sql) > 2:  # gt 2 because it is at least an empty string: ''
            sql = self.trimExpr(sql, max_length)

        return sql

    def asSqlString(self, sql_expression):
        """
        Casts SQL_EXPRESSION to a string (handling null)

        Null is converted to empty string"""

        return "coalesce(" + sql_expression + " || '', '')"

    def sqlEscape(self, string, trigger=False):
        """
        Escapes a literal string for use in a SQL statement

        TRIGGER is True if the sql is destined for a trigger"""

        string = string.replace("'", "''")  # escape single quote character

        if trigger:
            string = string.replace(
                "%", r"%%"
            )  # Prevent SQLalchemy .execute() interpreting % as parameter substitution

        string = re.sub(
            r"(:\w+)(\s|$)", r"\\\1\2", string
        )  # Prevent SQLalchemy interpreting :name as bind

        return string

    def searchRuleRecsFor(self, feature_rec):
        """
        Returns the search rule records for feature FEATURE_REC
        """
        # Provided because FEATURE_REC may be a raw model (in replication and upgrades)

        MywSearchRule = self.rawModelFor("myw", "search_rule")

        query = self.session.query(MywSearchRule).filter(
            MywSearchRule.feature_name == feature_rec.feature_name
        )

        return query.order_by(MywSearchRule.id).all()

    # ==============================================================================
    #                          SYSTEM TABLE TRIGGER GENERATION
    # ==============================================================================

    def setConfigTriggers(self, table_name, **params):
        """
        Returns SQL defining all triggers for system table TABLE_NAME

         CHANGE_LOG_ID_FROM:       (Mandatory) Field supplying ID for change log record
         SUBSTRUCTURE_OF:          Value for table field in change log (default: TABLE_NAME)
         LOG_ID_UPDATE_AS_NEW:     If set to True, updates to change_log_id_from field will be
                                   registered as a delete and insert instead of an update. Set True
                                   for tables where change_log_id_from field is editable in config GUI
         CHANGE_LOG_ID_FROM_TABLE: Table from which CHANGE_LOG_ID_FROM is taken
         JOIN_CLAUSE:              Clause providing join from TABLE_NAME to CHANGE_LOG_ID_FROM_TABLE
                                     First "{}" will be replaced by reference to CHANGE_LOG_ID_FROM_TABLE
                                     Second "{}" will be replaced by the record from TABLE_NAME
         LOG_DATASOURCE:           Set the datasource_name field on the change log record from self
         VERSION_STAMP:            Servsion stamp to increment on change (Default: None)"""

        self.executeOnConnection(self.configTriggerSql(table_name, "insert", params))
        self.executeOnConnection(self.configTriggerSql(table_name, "update", params))
        self.executeOnConnection(self.configTriggerSql(table_name, "delete", params))

    def configTriggerSql(self, table_name, trigger_type, params):
        """
        Returns SQL defining TRIGGER_TYPE for system TABLE_NAME (for change tracking)

        TRIGGER_TYPE is "insert", "update" or "delete".

        Returns a list of sql strings with the statements to create the trigger"""

        # Get feature properties
        db_table_name = self.dbNameFor("myw", table_name, True, quoted=False)
        trigger_name = self.dbTriggerNameFor("myw", table_name, trigger_type)

        # Build body
        declarations_sql = self.configTriggerDeclarationsSQL(table_name, trigger_type)
        get_lock_sql = (
            self.acquireVersionStampLockSql()
        )  # Note: automatically released at the end of current transaction
        transaction_log_sql = self._logConfigChangeSql(table_name, trigger_type, params)
        inc_version_stamp_sql = self.incConfigVersionStampSql(params)

        trigger_body = declarations_sql + get_lock_sql + transaction_log_sql + inc_version_stamp_sql

        trigger_conditions = "AFTER " + trigger_type.upper() + " ON " + db_table_name
        return self._createTriggerSqls(
            "myw", trigger_name, table_name, trigger_type, trigger_conditions, trigger_body
        )

    def _logConfigChangeSql(self, table_name, trigger_type, params):
        """
        Returns SQL for maintaining the configuration log

        TRIGGER_TYPE is "insert", "update" or "delete".
        See setConfigTriggers() for details on PARAMS
        """

        sql = ""

        log_id_update_as_new = params.get("log_id_update_as_new", False)

        if trigger_type == "update" and log_id_update_as_new:
            sql += (
                "IF "
                + self.trigger_new
                + "."
                + params.get("change_log_id_from")
                + " = "
                + self.trigger_old
                + "."
                + params.get("change_log_id_from")
                + " THEN \n"
            )
            sql += self._logConfigChangeBodySql(table_name, "update", params)
            sql += "ELSE\n"
            sql += self._logConfigChangeBodySql(table_name, "delete", params)
            sql += self._logConfigChangeBodySql(table_name, "insert", params)
            sql += "END IF; \n"
        else:
            sql = self._logConfigChangeBodySql(table_name, trigger_type, params)

        return sql

    def _logConfigChangeBodySql(self, table_name, trigger_type, params):
        """
        Returns body of SQL for maintaining the configuration log

        TRIGGER_TYPE is "insert", "update" or "delete".
        See setConfigTriggers() for details on PARAMS
        """

        rec_placeholder = self.trigger_old if trigger_type == "delete" else self.trigger_new

        # Log change to child as change to parent
        if "substructure_of" in params:
            root_table_name = params["substructure_of"]
            change_type = "update"
        else:
            root_table_name = table_name

            change_type = trigger_type

        # Hack for dd_field_group_item, which is deep substructure of dd_field
        if "change_log_id_from_table" in params:
            root_rec_placeholder = "t"
            change_log_id_from_table = params.get("change_log_id_from_table")
            additional_from = ", {} {} ".format(
                self.dbNameFor("myw", change_log_id_from_table, True), root_rec_placeholder
            )
            join_clause = " AND " + params.get("join_clause").format(
                root_rec_placeholder, rec_placeholder
            )
        else:
            root_rec_placeholder = rec_placeholder
            additional_from = ""
            join_clause = ""

        record_id_expr = root_rec_placeholder + "." + params.get("change_log_id_from")

        # For DD tables, include datasource in record ID
        if params.get("log_datasource"):
            record_id_expr = "{}.datasource_name || '/' || {}".format(
                root_rec_placeholder, record_id_expr
            )

        # Build insert params
        log_rec_props = OrderedDict()
        log_rec_props["id"] = self.nextValSql("myw", "configuration_log", "id")
        log_rec_props["operation"] = self.quoteForSQL(change_type)
        log_rec_props["table_name"] = self.quoteForSQL(root_table_name)
        log_rec_props["record_id"] = record_id_expr
        log_rec_props["version"] = "vs.version"

        field_names = ", ".join(list(log_rec_props.keys()))
        field_values = ", ".join(list(log_rec_props.values()))

        # Build the SQL
        sql = ""
        sql += "  INSERT INTO {} ( {} ) \n".format(
            self.dbNameFor("myw", "configuration_log", True), field_names
        )
        sql += "    SELECT {} \n".format(field_values)
        sql += (
            "      FROM "
            + self.dbNameFor("myw", "version_stamp", True)
            + " vs"
            + additional_from
            + "\n"
        )
        sql += "     WHERE component='data' " + join_clause + ";\n\n"

        return sql

    def incConfigVersionStampSql(self, params):
        """
        Returns SQL to increment the myw_config_cache version stamp

        This is used by the server to determine when a config cache is out of date"""

        version_stamp = params.get("version_stamp")

        sql = ""
        if version_stamp:
            sql += "  UPDATE {} \n".format(self.dbNameFor("myw", "version_stamp", True))
            sql += "    SET version = version+1\n"
            sql += "    WHERE component = '{}';\n\n".format(version_stamp)

        return sql

    def configTriggerDeclarationsSQL(self, table_name, trigger_type):
        """
        Returns SQL with section declaring variables that maybe used by other sections of config trigger code
        """
        return ""

    # ==============================================================================
    #                                  MISC
    # ==============================================================================

    def count(self, schema, table_name):
        """
        Number of records in TABLE_NAME
        """

        db_table_name = self.dbNameFor(schema, table_name, True, quoted=True)
        sql = "select count(*) from " + db_table_name

        return self.session.execute(sql).scalar()

    @contextmanager
    def versionStampLock(self, exclusive=False, release_on_commit=True):
        """
        Returns a context manager for version stamp exclusive session lock
        """
        # Note: The non-optional keyword args are to improve clarity in calling code

        if not exclusive:
            raise MywInternalError("Non-exclusive not supported")

        if release_on_commit:
            raise MywInternalError("Release on commit not supported")

        self.acquireSessionVersionStampLock()
        try:
            yield
        finally:
            self.releaseSessionVersionStampLock()

    def acquireVersionStampLock(self, exclusive=False):
        """
        Obtain the advisory lock on the 'data' version_stamp record

        This lock is used as a semaphore in the replica extract and
        export operations to determine when all transactions using
        the old version stamp value have completed.

        If optional EXCLUSIVE is True, acquire lock in exclusive
        mode

        Blocks indefinitely until lock is acquired"""
        raise Exception("acquireVersionStampLock not implemented")

    def optimizeLargeQuery(self, query):
        """
        Returns version of SQLAlchemy large select QUERY optimised for memory usage
        """

        # Prevent memory exhaustion on very large tables (see SQLAlchemy doc)
        return query.yield_per(10000)

    @contextmanager
    def statementTimeout(self, timeout):
        """
        Returns a context manager for statement TIMEOUT millisec

        Raises MywDbQueryTimeOutError if a timeout occurs

        If TIMEOUT is 0 or None, does nothing"""

        if timeout:
            self.setStatementTimeout(timeout)

        try:
            yield

        except DBAPIError as cond:
            self.session.rollback()  # Prevents Postgres errors on subsequent ops

            if "QueryCanceledError" in cond.message:  # ENH: Find a safer way
                raise MywDbQueryTimeOutError("Query exceeded timed out limit", timeout=timeout)
            raise

        finally:
            if timeout:
                self.setStatementTimeout(0)  # ENH: Should restore to previous value really

    def setStatementTimeout(self, timeout):
        """
        Set or clear timeout for following SQL statements (until end of transaction)

        Statements taking longer than TIMEOUT milliseconds will abort with
        DBAPIError QueryCanceledError. A value of 0 disables timeout
        """
        pass

    # ==============================================================================
    #                                 HELPERS
    # ==============================================================================

    def quotedColumnNames(self, field_names):
        """
        Returns SQL names for FIELD_NAMES (handling reserved words)
        """

        proc = lambda name: self.quotedColumnName(name)

        return list(map(proc, field_names))

    def _fieldHasKeyGenerator(self, feature_type, field_name):
        """
        True if FIELD_NAME of FEATURE_TYPE is populated from a sequence
        """

        MywDDField = self.rawModelFor("myw", "dd_field")

        query = (
            self.session.query(MywDDField)
            .filter(MywDDField.table_name == feature_type)
            .filter(MywDDField.internal_name == field_name)
        )

        return query.first().generator == "sequence"

    def versionStamp(self, component):
        """
        The value of the version stamp for COMPONENT (which must exist)
        """
        # ENH: Use rawModel?

        sql = "SELECT version FROM {} WHERE component='{}'".format(
            self.dbNameFor("myw", "version_stamp", True), component
        )

        return self.session.execute(sql).scalar()

    def rawModelFor(
        self, schema, table_name, id_from_sequence=False, geom_columns=[], metadata=None
    ):
        """
        Returns SQLAlchemy record exemplar for TABLE_NAME

        If optional ID_FROM_SEQUENCE is True, set the model's 'id' field to auto-populate from a a sequence.
        Optional GEOM_COLUMNS is a list of geometry column names.
        Optional METADATA is a SQLAlchemy Metadata table descriptor cache

        Returns a 'raw' model (no field mapping for geometry fields, booleans, etc)"""

        # ENH: Replace id_from_sequence and geom_columns by a dict of column descriptors

        if self.model_builder:
            return self.model_builder.rawModelFor(
                schema,
                table_name,
                id_from_sequence=id_from_sequence,
                geom_columns=geom_columns,
                metadata=metadata,
            )

        if not metadata:
            metadata = self.metadata

        self.progress(10, self, "Building model for", schema, ".", table_name)

        # Set basic properties
        model_props = dict(
            metadata=metadata,
            __tablename__=self.dbNameFor(schema, table_name),
            __table_args__={
                "schema": self.dbNameFor(schema),
                "autoload": True,
                "autoload_with": self.session.connection(),
            },
        )

        # Add field accessors
        if id_from_sequence:
            seq_name = self.dbSequenceNameFor(schema, table_name, "id")
            model_props["id"] = Column(Integer, Sequence(seq_name, optional=True), primary_key=True)

        for geom_column in geom_columns:
            model_props[geom_column] = Column(Geometry(srid=4326))

        # Create class
        base = declarative_base(name="db_driver")

        return type(table_name, (base,), model_props)

    def _getTable(self, schema, table_name, metadata=None):
        """
        Returns SQLAlchemy descriptor for TABLE_NAME
        """

        if self.model_builder:
            return self.model_builder._getTable(schema, table_name, metadata=metadata)

        if not metadata:
            metadata = self.metadata

        self.progress(13, self, "Getting SQLAlchemy dscriptor for {}.{}".format(schema, table_name))

        db_schema = self.dbNameFor(schema)
        db_table_name = self.dbNameFor(schema, table_name)

        return Table(db_table_name, metadata, schema=db_schema, autoload=True)

    def execute_sql_file(self, file_name):
        """
        Load SQL from FILE_NAME and run it
        """

        self.progress(4, "Loading file ", file_name)

        for statement in self.sql_statements_in(file_name):
            self.execute(statement)

    def executeCounting(self, sqls, filter_str=""):
        """
        Executes sql statements SQLS on self's session, returning rowcounts
        """

        n_recs = 0

        for sql in sqls:
            self.progress(10, self, "Running SQL:", sql)

            res = self.session.execute(sql)
            if res.rowcount and filter_str in sql:
                n_recs += res.rowcount

        return n_recs

    def execute(self, sqls, **params):
        """
        Executes sql statements SQLS on self's session

        STATEMENTS is a string or list of strings. Each can include
        format-style placeholders for substitution from PARAMS
        """

        if isinstance(sqls, str):
            return self._execute1(sqls, params)

        else:
            for statement in sqls:
                self._execute1(statement, params)

    def executeOnConnection(self, sqls, **params):
        """
        Executes sql statements SQLS on self's session's connection
        """
        # ENH: Fix 'illegal variable name/number' issue using .execute() in Oracle and remove this

        if isinstance(sqls, str):
            return self._executeOnConnection1(sqls, params)

        else:
            for statement in sqls:
                self._execute1(statement, params, on_connection=True)

    def _execute1(self, statement, params, on_connection=False):
        """
        Executes an SQL string STATEMENT (reporting progress)
        """

        if params:
            statement = statement.format(**params)

        self.progress(10, self, "Running SQL:", statement)

        if on_connection:
            res = self.session.connection().execute(statement)
        else:
            res = self.session.execute(statement)

        return res

    def commit(self):
        """
        Commits pending changes to database
        """

        self.progress(10, self, "Committing changes")
        self.session.flush()
        self.session.commit()

    def sql_statements_in(self, file_name):
        """
        Yields the SQL statements in FILE_NAME

        Yields sqls with newlines but without trailing ';'

        Uses simplistic parsing strategy, won't cope with procs etc"""

        statement = sep = ""

        # For each line in file
        with open(file_name, "r") as file:
            for line in file:
                line = line.strip()

                # Skip comments and black lines
                if not line or line.startswith("--"):
                    continue

                # Extend statement
                statement += sep + line
                sep = "\n"

                # Check for end of statement
                if statement.endswith(";"):
                    statement = statement[:-1]
                    yield statement
                    statement = sep = ""

        # Yield any final unterminated statement
        if statement:
            yield statement

    def _iso_to_sql_timestamp(self, timestamp_format):
        """
        Convert a timestamp format from ISO format to SQL format
        """
        if timestamp_format:
            timestamp_format = timestamp_format.replace("T", '"T"')  #  T is a literal
            timestamp_format = timestamp_format.replace("HH", "HH24")  # HH = 12hour clock in SQL
        return timestamp_format

    def quoteForSQL(self, val, literal=False):
        """
        Returns VAL as a quoted string
        """

        if literal:
            return '"{}"'.format(val)
        else:
            return "'{}'".format(val)
