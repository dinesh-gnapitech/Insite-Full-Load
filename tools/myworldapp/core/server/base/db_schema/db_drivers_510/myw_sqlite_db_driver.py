# Copyright: IQGeo Limited 2010-2023

import fnmatch, re
from sqlalchemy.dialects.sqlite.base import SQLiteIdentifierPreparer

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.utils import NullContextManager

from .myw_db_driver import MywDbDriver

# Local exception for table mutation (see .alterTableSqls())
class MywCannotMutateException(Exception):
    {}


class MywSqliteDbDriver(MywDbDriver):
    """
    Driver for SQLite databases

    Implements SQLite-specific trigger building etc. Maps myWorld concepts as follows:
      <database>        -> SQLite file
      <schema>.<table>  -> __<table>  for data schema
                           <table>    for system schema

    The table name mapping prevents name clashes between system and data tables"""

    """Class Property: Options passed to geometry column when using sqlite (See https://geoalchemy-2.readthedocs.io/en/latest/spatialite_tutorial.html#caveats)"""
    sqa_geometry_opts = {"management": True}

    def __init__(self, session):
        """
        Init slots of self
        """
        MywDbDriver.__init__(self, session)

        self.reserved_words = (
            SQLiteIdentifierPreparer.reserved_words
        )  # Used in trigger building etc
        self.boolean_sql_strs = {False: 0, True: 1}  # SQL representation of False and True
        self.trigger_old = "OLD"  # SQL placeholder for 'new' record in triggers
        self.trigger_new = "NEW"  # SQL placeholder for 'old' record in triggers
        self.from_dual_str = ""  # ???

    def initialiseDatabase(self):
        """
        Install the Spatialite datamodel etc
        """

        # Create the Spatialite tables
        self.execute("select InitSpatialMetaData(1)")

        # Create the NativeApp specific tables
        self.createShardTables()

    # ==============================================================================
    #                               NAME MAPPING
    # ==============================================================================

    def dbNameFor(self, schema, table=None, full=False, quoted=False):
        """
        Returns the database name for SCHEMA.TABLE

        If TABLE is omitted, returns name for database name for
        schema itself. If FULL is TRUE, include schema name in result"""

        if not table:
            return None

        db_name = schema + "$" + table

        if quoted:
            db_name = self.quoteForSQL(db_name, literal=True)

        return db_name

    def dbTriggerNameFor(self, schema, table, trigger_type, full=False):
        """
        Returns the database name for trigger TRIGGER_TYPE on table TABLE
        """

        trigger_name = table + "_" + trigger_type + "_trigger"
        return self.dbNameFor(schema, trigger_name, full)

    def dbSequenceNameFor(self, schema, table, field, full=False):
        """
        Returns the database name for sequence for FIELD of TABLE
        """

        # ENH: Share with myw_feature_descriptor

        if field == "id":
            return "{}.{}_{}_seq".format(schema, table, field)  # TODO: A lie?

        raise Exception("Cannot construct name for sequence: {}.{}".format(table, field))

    def mywNameFor(self, db_name):
        """
        Returns the myworld schema and table name for DB_NAME
        """

        if "$" in db_name:
            return db_name.split("$")
        else:
            return "", db_name

    def tableNamesIn(self, schema):
        """
        Returns myworld names of the tables in SCHEMA
        """

        insp = self.inspector()

        names = []
        for db_name in insp.get_table_names():

            # Get schema for table
            (table_schema, table_name) = self.mywNameFor(db_name)

            # Add it to the list (if appropriate)
            if table_schema == schema:
                names.append(table_name)

        return names

    def _nameMatches(self, name, specs):
        """
        True if NAME matches one of the fnmatch-style specs in SPECS
        """

        for spec in specs:
            if fnmatch.fnmatch(name, spec):
                return True

        return False

    def quotedColumnName(self, field_name):
        """
        Returns SQL name for FIELD_NAME (handling reserved words)
        """

        return '"' + field_name + '"'

    # ==============================================================================
    #                                   DATA TYPES
    # ==============================================================================

    def sqlTypeFor(self, field_name, type_desc):
        """
        Returns the SQL type for myWorld MywDbType TYPE_DESC
        """
        # Maps to SQLite basic types, as expected by Native Apps

        if type_desc.base == "reference":
            return "TEXT"
        if type_desc.base == "reference_set":
            return "TEXT"
        if type_desc.base == "foreign_key":
            return "TEXT"
        if type_desc.base == "link":
            return "TEXT"
        if type_desc.base == "boolean":
            return "INTEGER"
        if type_desc.base == "integer":
            return "INTEGER"
        if type_desc.base == "double":
            return "REAL"
        if type_desc.base == "numeric":
            return "NUMERIC"
        if type_desc.base == "timestamp":
            return "TEXT"
        if type_desc.base == "date":
            return "TEXT"
        if type_desc.base == "string":
            return "TEXT"
        if type_desc.base == "image":
            return "TEXT"
        if type_desc.base == "file":
            return "TEXT"
        if type_desc.base in ["point", "linestring", "polygon"]:
            return "GEOMETRY"

        raise MywInternalError("Bad data type: ", type_desc.str)

    def sqlStringType(self, max_chars=None):
        """
        Returns the SQL data type for a string of length MAX_CHARS

        If MAX_CHARS is None, return type for unbounded strings"""

        return "TEXT"

    # ==============================================================================
    #                                  TABLE MANAGEMENT
    # ==============================================================================

    def createTable(self, table_desc):
        """
        Create a table from a MywDbTable description
        """
        # ENH: Modify super to implement createTableSql and remove this?

        sqls = self.createTableSql(table_desc)

        self.execute(sqls)

        return table_desc

    def createTableSql(self, table_desc):
        """
        Returns SQL statements to create a table (inc indexes)
        """

        db_table_name = self.dbNameFor(table_desc.schema, table_desc.name, True)
        indent = lambda line: "    " + line
        sqls = []

        # Build attribute field clauses
        clauses = []
        for field_name, column_desc in list(table_desc.columns.items()):
            if column_desc.isGeometry():  # geometry fields added later
                continue

            field_sql = "{} {}".format(
                self.quotedColumnName(field_name), self.sqlColumnDefFor(column_desc)
            )
            clauses.append(field_sql)

        # Add primary key constraint clause (if necessary)
        if self.keyTypeFor(table_desc) == "constraint":
            quoted_column_names = self.quotedColumnNames(table_desc.key_column_names)
            sql = "PRIMARY KEY ({})".format(",".join(quoted_column_names))
            clauses.append(sql)

        # Add unique constraint clauses
        for constraint_desc in table_desc.constraints:
            if constraint_desc.type == "UNIQUE":
                quoted_column_names = self.quotedColumnNames(constraint_desc.column_names)
                sql = "UNIQUE ({})".format(",".join(quoted_column_names))
                clauses.append(sql)

        # ENH: Add Foreign key constraint clauses

        # Create table
        sql = 'CREATE TABLE "{}" (\n{}\n)'.format(db_table_name, ",\n".join(map(indent, clauses)))

        sqls.append(sql)

        # Add geometry fields (must be done after creation)
        for field_name, column_desc in list(table_desc.columns.items()):
            if column_desc.isGeometry():
                sql = "SELECT AddGeometryColumn('{}','{}', 4326, 'GEOMETRY', 'XY');\n".format(
                    db_table_name, field_name
                )
                sqls.append(sql)

        # Create geometry indexes
        for field_name, column_desc in list(table_desc.columns.items()):
            if column_desc.isGeometry():
                sql = self.addGeomIndexSql(table_desc.schema, table_desc.name, field_name)
                sqls.append(sql)

        # Create other indexes
        for index_desc in table_desc.indexes:
            if not index_desc.type in ["spatial", "geographic"]:
                sqls += self.addIndexSqls(table_desc.schema, table_desc.name, index_desc)

        return sqls

    def sqlColumnDefFor(self, column_desc):
        """
        Returns sql that defines column COLUMN_DESC (a MywDbColumn)
        """
        # Subclassed to make order consistent with pre-3.0 db_convert
        # ENH: Use super

        sql_def = self.sqlTypeFor(column_desc.name, column_desc.type_desc)

        # Add primary key declaration / nullability
        if column_desc.key and self.keyTypeFor(column_desc.table) == "autoincrement":
            sql_def += " PRIMARY KEY AUTOINCREMENT"

        elif column_desc.key and self.keyTypeFor(column_desc.table) == "inline":
            sql_def += " PRIMARY KEY"

        elif not column_desc.nullable:
            sql_def += " NOT NULL"

        # Add generator/default
        default = self.sqlDefaultFor(column_desc)
        if default != None:
            sql_def += " DEFAULT " + default

        return sql_def

    def keyTypeFor(self, table_desc):
        """
        Key field type for table TABLE_DESC

        Returns one of:
           'autoincrement'
           'inline'
           'constraint'"""

        # Slightly weird algorithm is to match what myw_convert used to do

        key_column_desc = table_desc.columns[table_desc.key_column_names[0]]

        if len(table_desc.key_column_names) != 1 or key_column_desc.type != "integer":
            return "constraint"

        if key_column_desc.generator == "sequence" and table_desc.schema != "data":
            return "autoincrement"

        return "inline"

    def sqlDefaultFor(self, column_desc, quote_string_values=True):
        """
        Return SQL default value for COLUMN_DESC (a string or None)
        """
        # Subclassed to handle different timestamp format in SQLite databases

        myw_type = column_desc.type
        generator = column_desc.generator

        if (myw_type == "timestamp") and (generator == "system_now"):
            return "(strftime('%Y-%m-%dT%H:%M:%S', 'now'))"
        else:
            return super(MywSqliteDbDriver, self).sqlDefaultFor(column_desc, quote_string_values)

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

        # Subclassed to mutate by copy where necessary (SQLite mutation support very limited)

        try:
            sqls = super(MywSqliteDbDriver, self).alterTableSqls(
                schema,
                table_name,
                old_table_desc,
                new_table_desc,
                date_format=date_format,
                timestamp_format=timestamp_format,
            )

        except MywCannotMutateException as cond:
            self.progress(2, str(cond), ":", "Altering via table copy")
            sqls = self.alterTableViaCopySqls(
                schema, table_name, old_table_desc, new_table_desc, date_format, timestamp_format
            )

        return sqls

    def alterTableViaCopySqls(
        self, schema, table_name, old_table_desc, new_table_desc, date_format, timestamp_format
    ):
        """
        Build SQL statements to alter shape of a table by recreating it

        OLD_TABLE_DESC and NEW_TABLE_DESC are MywDbTable objects.
        DATE_FORMAT and TIMESTAMP_FORMAT are required for mutations from string format

        WARNING: Discards table's triggers"""

        # Required because SQLite support for table mutation very limited

        tmp_table_name = "myw_temp"  # ENH: Find a better name?

        db_table_name = self.dbNameFor(schema, table_name)
        db_tmp_table_name = self.dbNameFor(schema, tmp_table_name)
        sqls = []

        # Remove old indexes (to avoid name clash later)
        # ENH: Share with dropTable()
        for index_desc in old_table_desc.indexes:
            sqls += self.dropIndexSqls(schema, table_name, index_desc)

        for col_name, col_desc in list(old_table_desc.columns.items()):
            if col_desc.isGeometry():
                sqls += self.dropGeomIndexSqls(schema, table_name, col_name)

        # Rename table out of way
        sql = "ALTER TABLE {} RENAME TO {}".format(db_table_name, db_tmp_table_name)
        sqls.append(sql)

        # Create table with new shape
        sqls += self.createTableSql(new_table_desc)

        # Copy data into it (transforming if necessary)
        sql = self.copyRecordsSql(
            schema,
            tmp_table_name,
            old_table_desc,
            table_name,
            new_table_desc,
            date_format,
            timestamp_format,
        )
        sqls.append(sql)

        # Drop old table
        sql = "DROP TABLE {}".format(db_tmp_table_name)
        sqls.append(sql)

        return sqls

    def copyRecordsSql(
        self,
        schema,
        src_table_name,
        src_table_desc,
        tgt_table_name,
        tgt_table_desc,
        date_format,
        timestamp_format,
    ):
        """
        Build SQL statements to copy data between tables, transforming if necessary

        Copies data for matching columns
        SRC_TABLE_DESC and TGT_TABLE_DESC are MywDbTable objects.
        DATE_FORMAT and TIMESTAMP_FORMAT are required for mutations from string format"""

        db_src_table_name = self.dbNameFor(schema, src_table_name)
        db_tgt_table_name = self.dbNameFor(schema, tgt_table_name)

        # Find columns to copy
        cols = list(tgt_table_desc.columns.keys())
        for col in cols:
            if not col in list(src_table_desc.columns.keys()):
                cols.remove(col)

        # Build select clauses on source table (including data transformations, where necessary)
        sql_exprs = []
        for col in cols:
            sql_expr = self.copyColumnSqlExpr(
                col, src_table_desc.columns[col], tgt_table_desc.columns[col]
            )
            sql_exprs.append(sql_expr)

        # Build SQL
        sql = "INSERT INTO {} ({}) SELECT {} FROM {}".format(
            db_tgt_table_name,
            ",".join(self.quotedColumnNames(cols)),
            ",".join(sql_exprs),
            db_src_table_name,
        )

        return sql

    def copyColumnSqlExpr(self, column_name, old_column_desc, new_column_desc):
        """
        Returns SQL select clause for copying a COLUMN_NAME during table mutation

        OLD_COLUMN_DESC and NEW_COLUMN_DESC are MywDbColumn descriptors"""

        old_type_desc = old_column_desc.type_desc
        new_type_desc = new_column_desc.type_desc
        new_unit = new_column_desc.unit

        src_expr = self.quotedColumnName(column_name)

        # Add transformation to strip unit when converting string -> number
        if old_type_desc.base == "string":

            if new_type_desc.base in ["integer", "numeric", "double"] and new_unit:
                src_expr = "REPLACE({},'{}','')".format(src_expr, new_unit)

        return src_expr

    def addColumnSqls(self, schema, table_name, column_desc):
        """
        Returns the list of SQL statements to add column COLUMN_DESC to TABLE_NAME

        If column cannot be added, raises MywCannotMutateException (for fallback to mutate via copy)"""

        column_name = column_desc.name
        sqls = []

        if column_desc.isGeometry():
            raise MywCannotMutateException(
                "Cannot add geometry column in-place"
            )  # ENH: We could .. but its hard

        # Add the field
        sql_def = self.sqlColumnDefFor(column_desc)
        db_tablename = self.dbNameFor(schema, table_name, True)
        sqls.append(
            "ALTER TABLE {} ADD COLUMN {} {}".format(
                db_tablename, self.quotedColumnName(column_name), sql_def
            )
        )

        # Add fields constraints (foreign key etc)
        for constraint_desc in column_desc.constraints:
            sqls += self.addConstraintSqls(schema, table_name, constraint_desc)

        return sqls

    def alterColumnSqls(
        self, schema, table_name, old_column_desc, new_column_desc, date_format, timestamp_format
    ):
        """
        Returns list of SQL statements to modify a column of TABLE_NAME

        OLD_COLUMN_DESC and NEW_COLUN_DESC are MywDbColumn objects. DATE_FORMAT and TIMESTAMP_FORMAT
        are for data conversion

        If column cannot be mutated, raises MywCannotMutateException (for fallback to mutate via copy)"""

        if old_column_desc.isGeometry() or new_column_desc.isGeometry():
            MywCannotMutateException(
                "Cannot alter geometry column in-place"
            )  # We could .. but its hard

        if self.sqlColumnDefFor(old_column_desc) == self.sqlColumnDefFor(new_column_desc):
            return []

        raise MywCannotMutateException("Cannot alter column in-place")

    def dropColumnSqls(self, schema, table_name, column_desc):
        """
        Returns a list of SQL statements to drop a COLUMN from TABLE_NAME

        If column cannot be dropped, raises MywCannotMutateException (for fallback to mutate via copy)"""

        # SQLite doesn't support drop column
        raise MywCannotMutateException("Cannot drop column")

    def dropTable(self, schema, table_name):
        """
        Drop table TABLE and associated objects (triggers, indexes, sequences)

        Table must be empty

        Subclassed to remove associated spatial indexes"""

        # Remove spatial indexes
        field_defs = self.columnDefsFor(schema, table_name)  # ENH: Use descriptor
        for field_name, field_def in list(field_defs.items()):
            if field_def["type"] == "geometry":
                sqls = self.dropGeomIndexSqls(schema, table_name, field_name)
                self.execute(sqls)

        # Drop table, indexes and triggers
        super(MywSqliteDbDriver, self).dropTable(schema, table_name)

    # ==============================================================================
    #                                REFLECTION
    # ==============================================================================

    def tableSqlFor(self, schema, table_name, full=False):
        """
        Table creation SQL for TABLE_NAME

        Note: Format is as passed in to the CREATE_TABLE commmand. May not be complete?"""

        db_table_name = self.dbNameFor(schema, table_name, True)

        # Get 'create table' command
        sql = "SELECT sql FROM SQLite_master WHERE type = 'table' AND tbl_name = '{}'".format(
            db_table_name
        )
        table_creation_sql = self.execute(sql).first()[0]

        # Add indexes
        if full:
            sql = "SELECT sql FROM SQLite_master WHERE type = 'index' AND tbl_name = '{}'".format(
                db_table_name
            )
            for index_creation_rec in self.execute(sql):
                if index_creation_rec[0]:
                    table_creation_sql += "\n" + index_creation_rec[0]

        return table_creation_sql

    def columnDefsFor(self, schema, table_name, full=False):
        """
        Definitions of the fields of TABLE

        Returns an ordered list of field definitions, keyed by field name"""

        field_defs = super(MywSqliteDbDriver, self).columnDefsFor(schema, table_name, full)

        if full:
            table_creation_sql = self.tableSqlFor(schema, table_name)

            create_pattern = re.compile("^.*create table [^\(]* \(", re.IGNORECASE)
            field_pattern = re.compile(r"([^,]*).")
            column_pattern = re.compile(r"\s*([\S]+)\s+(\w+)\s*(.*)")
            now_pattern = re.compile(r"\(strftime\('%Y-%m-%dT%H:%M:%S', 'now'\)\)")

            n = now_pattern.sub(
                "system_now", table_creation_sql
            )  # ENH: Fix regex to ignore commas inside parenthisis

            m = create_pattern.sub("", n)
            column_matches = field_pattern.findall(m)

            # For each line in the table definition  ..
            for line in column_matches:

                # Check for not a field definition line
                match = column_pattern.match(line)
                if not match:
                    continue

                if match.groups(0)[0] in ["PRIMARY", "UNIQUE"]:  # Index definition
                    continue

                # Extract field name, type and properties
                (field_name, field_type, opts) = match.groups(0)
                if field_name.startswith('"'):
                    field_name = field_name[1:-1]
                field_def = field_defs[field_name]

                # Handle type
                if field_type == "GEOMETRY":
                    field_def["type"] = "geometry"

                # Handle options
                # ENH: Do neatly using regexps
                opts = opts.strip()
                if opts.endswith(","):
                    opts = opts[:-1]
                opts = opts.strip()

                # Extract nullability
                match = re.match(".*NOT NULL", opts)
                nullable = (match == None) and not field_def["key"]
                field_def["nullable"] = nullable

                # Extract default
                match = re.match(".*\s*DEFAULT\s*(.*)", opts)
                if match:
                    exp = match.groups(0)[0]

                    if exp.startswith("'"):
                        field_def["default"] = exp[1:-1]

                    elif exp == "(strftime('%Y-%m-%dT%H:%M:%S', 'now'))":
                        field_def["default"] = "system_now"

                    else:
                        field_def["default"] = exp

        return field_defs

    # ==============================================================================
    #                                SEQUENCE MANAGEMENT
    # ==============================================================================

    def nextValSql(self, schema, table, field):
        """
        Returns SQL for obtaining the next value of a sequence
        """

        # System tables uses autoincrement, feature tables allocated by code (from shard table)
        return "NULL"

    def createShardTables(self):
        """
        Returns SQL for obtaining the next value of a sequence
        """

        # Create the tables for feature ID generation
        # ENH: Use self.createTable()
        self.execute(
            """CREATE TABLE myw_sqlite$shard_range (
                          id integer primary key autoincrement,
                          min integer,
                          max integer
                     )"""
        )

        self.execute(
            """CREATE TABLE myw_sqlite$sequence_generator (
                          table_name character varying(100),
                          field_name character varying(100),
                          last_id_used integer,
                          shard_range integer,
                          PRIMARY KEY (table_name, field_name)
                     )"""
        )

    def initSequences(self, shard_min_id, shard_max_id, fields):
        """
        Initialise sequences for FIELDS

        FIELDS is a list of (schema,table,field) tuples"""

        # Add shard
        MywSqliteShardRange = self.rawModelFor("myw_sqlite", "shard_range")
        rec = MywSqliteShardRange(min=shard_min_id, max=shard_max_id)
        self.session.add(rec)

        # Note: Sequence generators get init lazily

    def nextSequenceValueFor(self, schema, table, field):
        """
        Allocate the next value from the sequence for FIELD

        Mimics code in Native App.  This implementation is slow and incomplete. Provided to permit sync testing only"""
        # ENH: Check for shard exhausted, cache models, ...

        self.progress(12, "Generating sequence value for", schema, table, field)

        # Get the 'sequence' record for this field
        MywSqliteSequenceGenerator = self.rawModelFor("myw_sqlite", "sequence_generator")
        generator_rec = self.session.query(MywSqliteSequenceGenerator).get([table, field])

        # If not found, create it
        if not generator_rec:
            MywSqliteShardRange = self.rawModelFor("myw_sqlite", "shard_range")
            shard_rec = self.session.query(MywSqliteShardRange).get(1)

            generator_rec = MywSqliteSequenceGenerator(
                table_name=table, field_name=field, last_id_used=shard_rec.min - 1, shard_range=1
            )
            self.session.add(generator_rec)

        # Allocate a value
        generator_rec.last_id_used += 1

        return generator_rec.last_id_used

    def dropSequenceIfExists(self, schema, table_name, field_name):
        """
        Drop id generator for FIELD_NAME
        """

        # ENH: Drop the shard record, if present
        pass

    # ==============================================================================
    #                                  INDEX MANAGEMENT
    # ==============================================================================

    def dbIndexNameFor(self, schema, table, fields, full=False):
        """
        Returns the database name for index on FIELDS of TABLE
        """

        db_table_name = self.dbNameFor(schema, table)

        return db_table_name + "_" + "_".join(fields)

    def indexesFor(self, db_schema, db_table_name):
        """
        Index definitions for DB_TABLE_NAME

        Returns a dict of index definitions, keyed by index name. Each definition has keys:
          field_names  Indexed fields (in order)
          unique       True if index is unique
          options      Other options (a list of strings)"""

        strip_quotes_proc = (
            lambda s: s.strip()[1:-1] if s.strip().startswith('"') else s.strip()
        )  # ENH: Simplify!

        # Get the index creation SQL
        sql = "SELECT name,sql FROM SQLite_master WHERE type = 'index' AND tbl_name = '{}'".format(
            db_table_name
        )
        index_creation_recs = self.execute(sql)

        # For each index creation statement ..
        index_defs = {}
        for index_rec in index_creation_recs:
            index_name = index_rec[0]
            index_creation_sql = index_rec[1]

            # Skip null entries (spatial indexes?)
            if index_creation_sql == None:  # spatial index
                continue

            # Parse it
            match = re.match("CREATE INDEX (.*) (on|ON) (\S+)\s*\((.+)\)", index_creation_sql)
            if match:
                index_name = strip_quotes_proc(match.groups(0)[0])
                index_def_str = match.groups(0)[3]
                index_type = None

                options = ""
                if index_def_str.endswith(" COLLATE NOCASE"):
                    index_type = "like"
                    options = "COLLATE NOCASE"
                    index_def_str = index_def_str[0:-15]

                quoted_field_names = index_def_str.split(",")

                index_defs[index_name] = {
                    "type": index_type,
                    "field_names": list(map(strip_quotes_proc, quoted_field_names)),
                    "unique": "?",
                    "options": [options],
                }

        # Add spatial indexes
        geom_field_names = []
        sql = 'SELECT * FROM geometry_columns WHERE f_table_name="{}"'.format(db_table_name)
        for rec in self.execute(sql):
            geom_field_names.append(rec.f_geometry_column)

        insp = self.inspector()
        spatial_index_regex = "idx_{}_(.*)_node".format(db_table_name)
        spatial_index_regex = spatial_index_regex.replace("$", r"\$")

        for table_name in insp.get_table_names():  # ENH: faster to pass in a filter
            match = re.match(spatial_index_regex, table_name)

            if match:
                field_name = match.groups(0)[0]

                if field_name in geom_field_names:

                    index_name = "{}_{}".format(db_table_name, field_name)

                    index_defs[index_name] = {
                        "type": "spatial",
                        "field_names": [field_name],
                        "unique": False,
                        "options": ["spatial"],
                    }

        return index_defs

    def addIndexSqls(self, schema, table_name, index_desc):
        """
        Returns SQL statements to create an index on TABLE_NAME
        """
        # Subclassed to handle 'like' + add quotes round index name

        self.progress(7, self, "Adding index", schema, table_name, index_desc)

        db_table_name = self.dbNameFor(schema, table_name, True)
        db_index_name = self.dbIndexNameFor(schema, table_name, index_desc.column_names)
        db_column_names = self.quotedColumnNames(index_desc.column_names)

        if index_desc.type == "like":
            opts = " COLLATE NOCASE"
        else:
            opts = ""

        sql = 'CREATE INDEX "{}" ON {} ({}{})'.format(
            db_index_name, db_table_name, ",".join(db_column_names), opts
        )
        return [sql]

    def addGeomIndexSql(self, schema, table_name, column_name):
        """
        Returns an SQL statement to create the spatial index for geometry column COLUMN_NAME
        """

        db_table_name = self.dbNameFor(schema, table_name, True)

        return "SELECT CreateSpatialIndex('{}','{}')".format(db_table_name, column_name)

    def dropGeomIndexSqls(self, schema, table_name, field_name):
        """
        Returns SQL statements to drop the spatial index for geometry field FIELD_NAME

        Also removes the triggers etc added by AddGeometryColumn(). Leaves the field as a
        'plain' column."""

        db_table_name = self.dbNameFor(schema, table_name)
        sqls = []

        # Remove spatial index
        sqls.append("SELECT DisableSpatialIndex('{}','{}')".format(db_table_name, field_name))
        sqls.append("DROP TABLE idx_{}_{}".format(db_table_name, field_name))

        # Discard geom column (removes triggers, tidies up spatialite metadata)
        sqls.append("SELECT DiscardGeometryColumn('{}','{}')".format(db_table_name, field_name))

        return sqls

    # ==============================================================================
    #                              CONSTRAINT MANAGEMENT
    # ==============================================================================

    def dbConstraintNameFor(self, schema, table, type, fields, full=False):
        """
        Returns the database name for constraint on FIELDS of TABLE

        TYPE is one of 'PRIMARY KEY', 'UNIQUE' or 'FOREIGN KEY'"""

        type_exts = {"PRIMARY KEY": "pkey", "UNIQUE": "key", "FOREIGN KEY": "fkey"}

        # Build name
        constraint_name = table
        if type != "PRIMARY KEY":
            constraint_name += "_" + "_".join(fields)
        constraint_name += "_" + type_exts[type]

        # Build full name (if required)
        return self.dbNameFor(schema, constraint_name, full)

    def constraintsFor(self, schema, table_name):
        """
        Definitions of the constraints of TABLE_NAME (a dict of strings)
        """

        strip_quotes_proc = (
            lambda s: s.strip()[1:-1] if s.strip().startswith('"') else s.strip()
        )  # ENH: Simplify!

        db_table_name = self.dbNameFor(schema, table_name)

        # Get the table creation SQL
        sql = "SELECT sql FROM SQLite_master WHERE type = 'table' AND tbl_name = '{}'".format(
            db_table_name
        )
        table_creation_sql = self.execute(sql).first()[0]

        # For each line in the table definition  ..
        constraint_defs = {}
        for line in table_creation_sql.splitlines():

            match = re.match("\s*UNIQUE\s*\((.*)\)", line)
            if match:
                field_names_str = match.groups(0)[0].replace(" ", "")
                field_names = field_names_str.split(",")
                field_names = list(map(strip_quotes_proc, field_names))

                constraint_name = "{}_{}_unique".format(table_name, "_".join(field_names))

                constraint_defs[constraint_name] = {
                    "type": "UNIQUE",
                    "fields": field_names,
                    "defn": "UNIQUE ({})".format(field_names_str),
                }

            match = re.match("\s*CONSTRAINT\s+(\w+)\s+CHECK\s*\((.*)\)", line)
            if match:
                (field_name, cond) = match.groups(0)
                constraint_name = "{}_{}_check".format(table_name, field_name)
                constraint_defs[constraint_name] = {
                    "type": "CHECK",
                    "fields": [field_name],
                    "defn": "CHECK ({})".format(cond),
                }

        return constraint_defs

    # ==============================================================================
    #                                 SCHEMA MANAGEMENT
    # ==============================================================================

    def createSchema(self, name):
        """
        Create database schema NAME (which must not already exist)
        """
        pass

    def dropSchema(self, schema):
        """
        Drop database schema SCHEMA (and any tables it contains)
        """

        table_names = self.tableNamesIn(schema)

        for table_name in table_names:
            self.dropTable(schema, table_name)

    # ==============================================================================
    #                               TRIGGER BUILDING
    # ==============================================================================

    def _createTriggerSqls(
        self, schema, db_trigger_name, feature_type, trigger_type, trigger_conditions, trigger_body
    ):
        """
        Returns SQL to create a trigger of TRIGGER_TYPE triggered on TRIGGER_CONDITIONS with TRIGGER_BODY

        """
        sqls = []

        # Drop any existing trigger
        sql = "DROP TRIGGER IF EXISTS " + self.quoteForSQL(db_trigger_name)
        sqls.append(sql)

        # Set the trigger
        sql = (
            "CREATE TRIGGER " + self.quoteForSQL(db_trigger_name) + " " + trigger_conditions + "\n"
        )
        sql += "BEGIN\n"
        sql += trigger_body
        sql += "END"
        sqls.append(sql)

        return sqls

    def _featureTriggerSetKeySql(self, feature_type, key_field_name):
        """
        Returns sql to allocate an key for NEW

        FEATURE_TYPE is a feature with a sequence generator on KEY_FIELD_NAME"""

        # Key fields populated explicitly in code (from shard)
        return ""

    def _getGeomTypeClause(self, geom_exp, geom_type):
        """
        Returns a string with the sql statement (to use in a trigger) that verify the geometry type of the feature
        GEOM_TYPE should be one of: "point", "linestring", "polygon"
        """

        geom_type_clause = "ST_GeometryType(" + geom_exp + ") IN ({geomtype})"

        if geom_type == "point":
            geom_type_str = "'POINT', 'MULTIPOINT'"
        elif geom_type == "linestring":
            geom_type_str = "'LINESTRING', 'MULTILINESTRING'"
        elif geom_type == "polygon":
            geom_type_str = "'POLYGON', 'MULTIPOLYGON'"
        else:
            raise Exception("invalid geom type:", geom_type)

        return geom_type_clause.format(geomtype=geom_type_str)

    def configTriggerSql(self, table_name, trigger_type, params):
        """
        Returns SQL defining TRIGGER_TYPE trigger for TABLE_NAME

        TRIGGER_TYPE is "insert", "update" or "delete".

        PARAMS is a dictionary with the following keys:
          RECORD_ID_KEY: (Mandatory) name of field that identifies the record to record as having been changed
          CHANGE_TABLE: Name of table to record as having been change. Optional, defaults to TABLE_NAME
          KEY_UPDATES_AS_NEW: If set to True, updates to the field specified in record_id_key will be registered as a delete and insert instead of an update
          RECORD_ID_KEY_TABLE: if RECORD_ID_KEY is from a table other than TABLE_NAME, that table can be specified here
          ADDITIONAL_CLAUSE: If RECORD_ID_KEY_TABLE is provided, then a clause that provides the join between the two tables must be provided.
                         First "{}" will be replaced by reference to RECORD_ID_KEY_TABLE and second "{}" will be replaced by the record being modified in the trigger

        Returns a list of sql strings with the statements to create the trigger"""

        # Config triggers not supported in SQLite
        return []

    def triggersFor(self, schema, table_name):
        """
        Definitions of the triggers of TABLE_NAME (a dict of definitons, keyed by trigger name)

        Each definition is a dict with keys 'type' and 'body'"""

        # These are generated automatically for geometry columns by spatialite
        prefixes_to_skip = [
            "ggi_",  # Maintain spatial index
            "ggu_",
            "gid_",
            "gii_",
            "giu_",
            "tmi_",  # Maintain geometry_columns_time (weird!)
            "tmu_",
            "tmd_",
        ]
        trigger_defs = {}

        db_table_name = self.dbNameFor(schema, table_name)

        # For each trigger definition ..
        sql = (
            "SELECT name,sql FROM SQLite_master WHERE type = 'trigger' AND tbl_name = '{}'".format(
                db_table_name
            )
        )
        for rec in self.execute(sql):
            (trigger_name, trigger_sql) = rec

            # Skip triggers added by Spatialite
            if trigger_name[0:4] in prefixes_to_skip:
                continue

            # Extract type
            match = re.match(".* (BEFORE \w+|AFTER \w+)", trigger_sql)
            trigger_type = match.groups(0)[0].replace(" ", "_")

            # Add definition
            trigger_defs[trigger_name] = {"type": trigger_type, "body": trigger_sql}

        return trigger_defs

    def disableTriggersSql(self, feature_type):
        """
        Disables the triggers on the table for FEATURE_TYPE
        """
        return ""  # Not supported by sqlite

    def enableTriggersSql(self, feature_type):
        """
        Returns the SQL to enable the triggers on the table for FEATURE_TYPE
        """
        return ""  # Not supported by sqlite

    # ==============================================================================
    #                          LOCK AND TRANSACTION MANAGEMENT
    # ==============================================================================

    def acquireVersionStampLock(self, exclusive=False):
        """Obtain the advisory lock on the 'data' version_stamp record

        This lock is used as a semaphore in the replica extract and
        export operations to determine when all transactions using
        the old version stamp value have completed.

        If optional EXCLUSIVE is True, acquire lock in exclusive
        mode

        Blocks indefinitely until lock is acquired"""

        # SQLite doesn't support advisory locks
        # Note: Not a problem since we don't support concurrent access
        pass

    def acquireVersionStampLockSql(self):
        """
        Returns sql to acquire the 'data' version_stamp record lock from within a trigger

        Acquires the lock-non exclusive."""

        return ""

    def nestedTransaction(self):
        """
        Returns context manager for an inner transaction (if supported)
        """

        # Nested transactions not supported
        return NullContextManager()

    # ==============================================================================
    #                             FEATURE DATA DUMP / LOAD
    # ==============================================================================

    def canonicalise_geometry(self, geom):
        """
        Return a version of GEOM suitable for insertion in the database

        GEOM is a a shapely geometry
        """

        # Spatialite doesn't care about loop sense etc
        return geom

    def prepareForInsert(self, feature_type, rec, insert):
        """
        Called before feature record REC is inserted/updated during data load
        """

        key_field_name = rec._descriptor.key_field_name

        # Allocate an id from the table's shard (if necessary)
        if (rec._descriptor.fields[key_field_name].generator == "sequence") and (
            rec[key_field_name] == None
        ):
            rec[key_field_name] = self.nextSequenceValueFor("data", feature_type, "id")

    # ==============================================================================
    #                                MAINTANENCE
    # ==============================================================================

    def updateStatistics(self):
        """
        Update database statistics (to improve query performance)
        """

        self.execute("ANALYZE")

    def vacuum(self, schema=None, table=None):
        """
        Compact disk
        """

        # ENH: Group schema,table in a table spec object?

        sql = "vacuum"

        if schema:
            sql += " " + self.dbNameFor(schema, table, True)

        self.executeWithoutTransaction(sql)

    # ==============================================================================
    #                                      OTHER
    # ==============================================================================

    def trimExpr(self, sql_expression, max_length):
        """
        SQL expression that returns SQL_EXPRESSION truncated to MAX_LENGTH chars
        """

        s = "(" + sql_expression + ")"
        s = "substr(" + s + ", 1, " + str(max_length) + ")"

        return s

    def tableExists(self, schema, table):
        """
        True if table exists in database
        """

        db_table_name = self.dbNameFor(schema, table)

        sql = "SELECT 1 FROM SQLite_master WHERE type = 'table' AND tbl_name = '{}'".format(
            db_table_name
        )

        row = self.execute(sql).first()

        return row is not None

    def sizeOf(self, schema, table):
        """
        Size of TABLE on disk (in bytes)
        """

        raise MywError("Database type does not support table size queries")

    def executeWithoutTransaction(self, sqls, **params):
        if isinstance(sqls, str):
            return self._execute2(sqls, params)
        else:
            for statement in sqls:
                self._execute2(statement, params)

    def _execute2(self, statement, params):
        import sqlite3

        db_file = self.metadata._bind.url.database
        if params:
            statement = statement.format(**params)

        self.progress(10, self, "Running sqlite3 isolation_level=None SQL:", statement)

        conn = sqlite3.connect(db_file, isolation_level=None)
        conn.execute(statement)
        conn.close()
