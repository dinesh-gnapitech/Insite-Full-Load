# Copyright: IQGeo Limited 2010-2023

import re, os
from sqlalchemy import func, cast
from sqlalchemy.dialects.postgresql.base import RESERVED_WORDS
from geoalchemy2 import Geography

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.geom.myw_geo_utils import degrees_to_metres
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine

from .myw_db_meta import MywDbTable, MywDbColumn
from .myw_db_driver import MywDbDriver

# Note: this file is frozen and should not have anything other than bugfixes backported to it.
# pylint: disable=no-member


class MywPostgresDbDriver(MywDbDriver):
    """
    Driver for Postgres databases

    Implements Postgres-specific trigger building etc. Maps myWorld concepts as follows:
      <database>        -> Postgres database
      <schema>.<table>  -> Postgres schema.table
    """

    sql_geometry_opts = {}

    def __init__(self, session):
        """
        Init slots of self
        """
        MywDbDriver.__init__(self, session)

        self.reserved_words = RESERVED_WORDS  # Used in trigger building etc
        self.supports_data_model_rollback = True  # Rollback discards data model changes
        self.null_geometry = None  # Backstop value for geom fields when inserting
        self.boolean_sql_strs = {
            False: "FALSE",  # SQL string representation of False and True
            True: "TRUE",
        }
        self.trigger_old = "OLD"  # SQL placeholder for 'new' record in triggers
        self.trigger_new = "NEW"  # SQL placeholder for 'old' record in triggers
        self.from_dual_str = ""  # ???

    # ==============================================================================
    #                                 NAME MAPPING
    # ==============================================================================

    def dbNameFor(self, schema, table=None, full=False, quoted=False):
        """
        Returns the database name for SCHEMA.TABLE

        If TABLE is omitted, returns name for database name for
        schema itself. If FULL is TRUE, include schema name in result"""

        if not table:
            return schema

        if quoted:
            table = self.quoteForSQL(table, literal=True)

        if not full:
            return table

        return schema + "." + table

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
        # Must match algorithm used by type Serial

        # Delta schema uses sequences from 'data'
        if schema == "delta":
            schema = "data"

        # Build name
        seq_name = "{}_{}_seq".format(table, field)

        return self.dbNameFor(schema, seq_name, full)

    # ==============================================================================
    #                                REFLECTION
    # ==============================================================================

    def mywNameFor(self, abs_name):
        """
        Returns the myworld schema and table name for ABS_NAME
        """

        parts = abs_name.split(".")

        return parts[0], parts[1]

    def tableNamesIn(self, schema):
        """
        Returns myworld names of the tables in SCHEMA
        """

        insp = self.inspector()

        return insp.get_table_names(schema=schema)

    def tableSqlFor(self, schema, table_name, full=False):
        """
        Table creation SQL for TABLE_NAME
        """

        # Get description
        db_table_name = self.dbNameFor(schema, table_name, True)
        sql = self.run_postgres_command("pg_dump", "-t", db_table_name, "--schema-only")

        # Filter out comments etc
        lines = sql.splitlines()
        sql_lines = []
        for line in lines:
            if line.strip() == "" or line.startswith("--") or line.startswith("SET "):
                continue
            sql_lines.append(line)

        return "\n".join(sql_lines)

    def columnDefsFor(self, schema, table_name, full=False):
        """
        Definitions of the fields of TABLE

        Returns an ordered list of field definitions, keyed by field name"""

        field_defs = super(MywPostgresDbDriver, self).columnDefsFor(schema, table_name, full)

        if full:
            sql = "select column_name,udt_name,column_default,is_nullable from information_schema.columns where table_schema='{}' and table_name='{}'".format(
                schema, table_name
            )

            for rec in self.execute(sql):
                name = rec[0]
                type = rec[1]
                default = rec[2] or ""
                nullable = rec[3]

                # Workaround for strange brackets on some m/cs
                default = re.sub("^\((\d+)\)::", "\\1::", default)

                field_def = field_defs[name]

                field_def["nullable"] = nullable == "YES"

                if default.startswith("nextval("):
                    field_def["generator"] = "sequence"
                else:
                    field_def["default"] = default

        return field_defs

    def quotedColumnName(self, field_name):
        """
        Returns SQL name for FIELD_NAME (handling reserved words)
        """

        if field_name in self.reserved_words:
            return '"' + field_name + '"'

        return field_name

    # ==============================================================================
    #                                SEQUENCE MANAGEMENT
    # ==============================================================================

    def dropSequenceIfExists(self, schema, table_name, field_name):
        """
        Drop id generator for FIELD_NAME
        """

        db_seq_name = self.dbSequenceNameFor(schema, table_name, field_name, True)
        self.progress(4, "Dropping sequence", db_seq_name)
        sql = "DROP SEQUENCE IF EXISTS " + db_seq_name
        self.execute(sql)

    def setSequenceRange(self, schema, table, field, min_value, max_value, restart=False):
        """
        Set the range for generator of TABLE.FIELD

        If RESTART is True, also set the next value to MIN_VALUE"""

        db_seq_name = self.dbSequenceNameFor(schema, table, field, True)

        sql = "ALTER SEQUENCE {} MINVALUE {} MAXVALUE {} START {}".format(
            db_seq_name, min_value, max_value, min_value
        )

        if restart:
            sql += " RESTART"

        self.execute(sql)

    def setSequenceValue(self, schema, table, field, next_value):
        """
        Set the next value generator of TABLE.FIELD with yield
        """

        seq_name = self.dbSequenceNameFor(schema, table, field, True)

        # Set current value
        sql = "ALTER SEQUENCE {} RESTART WITH {}".format(seq_name, next_value - 1)
        self.execute(sql)

        # Set next value (hack because restart leaves current_value = next_value)
        # ENH: Neater to use setval() with is_called=false
        sql = "select nextval('{}')".format(seq_name)
        self.execute(sql)

    def sequenceValue(self, schema, table, field):
        """
        Returns the next value generator of TABLE.FIELD will yield (without incrementing it)
        """

        seq_name = self.dbSequenceNameFor(schema, table, field, True)

        sql = "SELECT is_called,last_value FROM {}".format(seq_name)
        rec = self.execute(sql).first()

        if rec[0]:
            return rec[1] + 1
        else:
            return rec[1]

    def sequenceRange(self, schema, table, field):
        """
        Returns min and max of values for generator of TABLE.FIELD
        """

        seq_name = self.dbSequenceNameFor(schema, table, field, False)

        sql = "SELECT minimum_value,maximum_value FROM information_schema.sequences where sequence_schema ='{}' and sequence_name = '{}'".format(
            schema, seq_name
        )
        rec = self.execute(sql).first()

        return rec[0], rec[1]

    def nextValSql(self, schema, table, field):
        """
        Returns SQL for obtaining the next value of a sequence
        """

        return "nextval('{}')".format(self.dbSequenceNameFor(schema, table, field, True))

    # ==============================================================================
    #                                  INDEX MANAGEMENT
    # ==============================================================================

    def dbIndexNameFor(self, schema, table, fields, full=False):
        """
        Returns the database name for index on FIELDS of TABLE
        """

        # These names were specified explicity in installs up to 230
        predefined_names = {
            "configuration_log_idx1": ("myw", "configuration_log", ["table_name", "version"]),
            "idx_bookmark_myw_search_val1": ("myw", "bookmark", ["myw_search_val1"]),
            "idx_query_myw_search_val1": ("myw", "query", ["myw_search_val1"]),
            "idx_search_string_feature_link": ("myw", "search_string", ["feature_link"]),
            "idx_search_string_search_val": ("myw", "search_string", ["search_val"]),
            "transaction_log_idx1": ("myw", "transaction_log", ["version", "feature_type"]),
        }

        # Build default name
        index_name = table + "_" + "_".join(fields)

        # Apply 'hard-coded names'
        for name, defn in list(predefined_names.items()):
            if defn == (schema, table, fields):
                index_name = name

        # Build full name (if required)
        return self.dbNameFor(schema, index_name, full)

    def indexesFor(self, db_schema, db_table_name):
        """
        Index definitions for DB_TABLE_NAME

        Returns a dict of index definitions, keyed by index name. Each definition has keys:
          field_names   Indexed fields (in order)
          unique        True if index is unique
          options       Other options (a list of strings)"""

        table_oid_sql = """
          SELECT cls.oid from pg_class cls
            JOIN pg_catalog.pg_namespace nsp ON nsp.oid = cls.relnamespace
            WHERE cls.relname='{table_name}' AND nsp.nspname='{schema}'
        """
        table_oid = (
            self.execute(table_oid_sql.format(schema=db_schema, table_name=db_table_name))
            .first()
            .oid
        )

        select_sql = """
          SELECT
              i.relname as relname, ix.indisunique, ix.indexprs, ix.indpred,
              a.attname, (SELECT temp.index 
                          FROM (SELECT generate_series(array_lower(ix.indkey,1),array_upper(ix.indkey,1)) as index) temp
                          WHERE ix.indkey[index]=a.attnum
                         ) as index_index
          FROM
              pg_class t
                    join pg_index ix on t.oid = ix.indrelid
                    join pg_class i on i.oid=ix.indexrelid
                    left outer join
                        pg_attribute a
                        on t.oid=a.attrelid and a.attnum=ANY(ix.indkey)
          WHERE
              t.relkind = 'r'
              and t.oid = '{table_oid}'
              and ix.indisprimary = 'f'
          ORDER BY
              t.relname,
              index_index
        """
        result = self.execute(select_sql.format(table_oid=table_oid))

        # Build results
        index_defs = {}
        for index in result:

            name = index["relname"]
            if name not in index_defs:
                (options, index_type) = self.indexOptionsFor(db_schema, name)
                index_defs[name] = {
                    "type": index_type,
                    "field_names": [],
                    "unique": index["indisunique"],
                    "options": options,
                }

            col_name = index["attname"]
            if col_name:
                index_defs[name]["field_names"].append(col_name)

        return index_defs

    def indexOptionsFor(self, schema, index_name):
        """
        Returns the operator classes of index INDEX_NAME (a list of strings)
        """

        # Get options
        sql = (
            "SELECT o.opcname  "
            + "FROM  ("
            + "  SELECT unnest(indclass) AS ind_op "
            + "     FROM   pg_index "
            + "     WHERE  indexrelid = '{}.{}'::regclass "
            + "     ) i  "
            + "JOIN   pg_opclass o ON o.oid = i.ind_op;"
        ).format(schema, index_name)

        options = [row.opcname for row in self.execute(sql)]

        # Determine MywDbIndex type
        if options == ["text_ops"]:
            index_type = "plain"
        elif options == ["varchar_pattern_ops"]:
            index_type = "like"
        elif options == ["gist_geometry_ops_2d"]:
            index_type = "spatial"
        elif options == ["gist_geography_ops"]:
            index_type = "geographic"
        else:
            index_type = None

        return options, index_type

    def addIndexSqls(self, schema, table_name, index_desc):
        """
        Returns SQL statements to create an index on TABLE_NAME
        """

        if index_desc.type == "like":

            # ENH: Reduce duplication with super
            db_table_name = self.dbNameFor(schema, table_name, True)
            db_index_name = self.dbIndexNameFor(schema, table_name, index_desc.column_names)
            db_column_names = self.quotedColumnNames(index_desc.column_names)

            mapping_proc = lambda column_name: column_name + " varchar_pattern_ops"
            db_column_exprs = list(map(mapping_proc, db_column_names))

            sql = "CREATE INDEX {} ON {} USING btree ({})".format(
                db_index_name, db_table_name, ",".join(db_column_exprs)
            )
            return [sql]

        else:
            return super(MywPostgresDbDriver, self).addIndexSqls(schema, table_name, index_desc)

    def addGeomIndexSql(self, schema, table_name, column_name):
        """
        Returns an SQL statement to create the spatial index for geometry column COLUMN_NAME
        """

        db_tablename = self.dbNameFor(schema, table_name, True)

        return 'CREATE INDEX "idx_{table_name}_{column_name}" ON {db_tablename} USING GIST ( {column_name} )'.format(
            schema=schema, table_name=table_name, db_tablename=db_tablename, column_name=column_name
        )

    def addGeographyIndex(self, schema, table_name, column_name):
        """
        Create a geography index on COLUMN_NAME
        """

        db_table_name = self.dbNameFor(schema, table_name, True)
        db_index_name = self.dbIndexNameFor(schema, table_name, ["geography"])

        sql = "CREATE INDEX {} ON {} USING gist (CAST({} AS geography))".format(
            db_index_name, db_table_name, self.quotedColumnName(column_name)
        )
        self.execute(sql)

    # ==============================================================================
    #                              CONSTRAINT MANAGEMENT
    # ==============================================================================

    def dbConstraintNameFor(self, schema, table, type, fields, full=False):
        """
        Returns the database name for constraint on FIELDS of TABLE

        TYPE is one of 'PRIMARY KEY', 'UNIQUE' or 'FOREIGN KEY'"""

        type_exts = {"PRIMARY KEY": "pkey", "UNIQUE": "key", "FOREIGN KEY": "fkey"}

        # If constrait already exists, return its name (workaround because old DBs used hand crafted names)
        constraint_name = self._findConstraint(schema, table, type, fields)

        # Build name (matching SQLAlchemy algorithm, to keep tests clean)
        if not constraint_name:
            constraint_name = table
            if type != "PRIMARY KEY":
                constraint_name += "_" + "_".join(fields)
            constraint_name += "_" + type_exts[type]

        # Build full name (if required)
        return self.dbNameFor(schema, constraint_name, full)

    def _findConstraint(self, schema, table, type, fields):
        """
        Returns name for constraint on FIELDS of TABLE (if it exists)
        """

        # Codes used in the pg_constraint table
        type_codes = {"PRIMARY KEY": "p", "UNIQUE": "u", "FOREIGN KEY": "f"}

        con_type = type_codes[type]

        # Find table oid
        sql = "SELECT oid FROM pg_namespace WHERE nspname='{}'".format(schema)
        schema_oid = self.execute(sql).first()[0]
        sql = "SELECT oid FROM pg_class WHERE relname='{}' AND relnamespace={}".format(
            table, schema_oid
        )
        tab_oid = self.execute(sql).first()[0]

        # For each constraint on table ...
        sql = "SELECT conname FROM pg_constraint WHERE conrelid={} and contype = '{}'".format(
            tab_oid, con_type
        )
        for rec in self.execute(sql):
            constraint_name = rec[0]

            # Find its fields
            constraint_fields = self._constraintFields(schema, table, constraint_name)

            # Check for match
            if sorted(constraint_fields) == sorted(fields):
                return constraint_name

        return None

    def _constraintFields(self, schema, table, constraint_name):
        """
        Returns names of fields in unique constraint CONSTRAINT_NAME
        """

        # Find table oid
        # ENH: Replace by join
        sql = "SELECT oid FROM pg_namespace WHERE nspname='{}'".format(schema)
        schema_oid = self.execute(sql).first()[0]
        sql = "SELECT oid FROM pg_class WHERE relname='{}' AND relnamespace={}".format(
            table, schema_oid
        )
        tab_oid = self.execute(sql).first()[0]

        # Get constrait fields
        sql = "SELECT conkey FROM pg_constraint WHERE conrelid={} and conname='{}'".format(
            tab_oid, constraint_name
        )
        attnums = self.execute(sql).first()[0]

        field_names = []
        for attnum in attnums:
            sql = "select attname from pg_attribute where attrelid={} and attnum={}".format(
                tab_oid, attnum
            )
            field_name = self.execute(sql).first()[0]
            field_names.append(field_name)

        return field_names

    def constraintsFor(self, schema, table_name):
        """
        Definitions of the constraints of TABLE_NAME (a dict of dicts)
        """

        # ENH: Share code with findConstraint() etc

        constraint_defs = {}

        sql = "SELECT oid FROM pg_namespace WHERE nspname='{}'".format(schema)
        schema_oid = self.execute(sql).first()[0]

        sql = "SELECT oid FROM pg_class WHERE relname='{}' AND relnamespace={}".format(
            table_name, schema_oid
        )
        tab_oid = self.execute(sql).first()[0]

        sql = "SELECT conname,oid FROM pg_constraint WHERE conrelid={}".format(tab_oid)
        for rec in self.execute(sql):
            sql = "select pg_get_constraintdef({})".format(rec[1])
            name = rec[0]
            defn = self.execute(sql).first()[0]

            if defn.startswith("PRIMARY KEY"):
                type = "PRIMARY KEY"
            elif defn.startswith("UNIQUE"):
                type = "UNIQUE"
            elif defn.startswith("FOREIGN KEY"):
                type = "FOREIGN KEY"
            else:
                type = defn

            constraint_defs[name] = {
                "type": type,
                "fields": self._constraintFields(schema, table_name, name),
                "defn": defn,
            }

        return constraint_defs

    # ==============================================================================
    #                                 SCHEMA MANAGEMENT
    # ==============================================================================

    def createSchema(self, name):
        """
        Create database schema NAME (which must not already exist)
        """
        self.execute("CREATE SCHEMA " + name)

    def dropSchema(self, name):
        """
        Drop database schema NAME (and any tables it contains)
        """

        sql = "DROP SCHEMA IF EXISTS {} CASCADE".format(name)

        self.execute(sql)

    # ==============================================================================
    #                                   DATA TYPES
    # ==============================================================================

    def sqlTypeFor(self, field_name, type_desc):
        """
        Returns the SQL type for myWorld MywDbType TYPE_DESC
        """

        if type_desc.base == "reference":
            return self.sqlStringType(1000)
        elif type_desc.base == "reference_set":
            return self.sqlStringType()
        elif type_desc.base == "foreign_key":
            return self.sqlStringType(1000)
        elif type_desc.base == "link":
            return self.sqlStringType(5000)
        elif type_desc.base == "boolean":
            return "boolean"
        elif type_desc.base == "integer":
            return "integer"
        elif type_desc.base == "double":
            return "double precision"
        elif type_desc.base == "numeric":
            return type_desc.str
        elif type_desc.base == "timestamp":
            return self.sqlTimestampType(*type_desc.args)  # ENH: Use named arg
        elif type_desc.base == "date":
            return "date"
        elif type_desc.base == "string":
            return self.sqlStringType(*type_desc.args)  # ENH: Use named arg
        elif type_desc.base == "image":
            return "character varying"
        elif type_desc.base == "file":
            return "character varying"  # ENH: Could be 'bytea'
        elif type_desc.base in ["point", "linestring", "polygon"]:
            return "GEOMETRY"

        raise MywInternalError("Bad data type:", type_desc.str)

    def sqlStringType(self, max_chars=None):
        """
        Returns the SQL data type for a string of length MAX_CHARS

        If MAX_CHARS is None, return type for unbounded strings"""

        if max_chars == None:
            return "text"

        return "character varying({})".format(max_chars)

    # ==============================================================================
    #                                   TABLE MANAGEMENT
    # ==============================================================================

    def sqlDefaultFor(self, column_desc, quote_string_values=True):
        """
        Return SQL default value for field_def (a string or None)
        """
        # Subclassed to handle sequence generator

        myw_type = column_desc.type
        generator = column_desc.generator

        if generator == "sequence":
            db_seq_name = self.dbSequenceNameFor(
                column_desc.table.schema, column_desc.table.name, column_desc.name, True
            )
            return "nextval('{}'::regclass)".format(db_seq_name)
        elif (generator == "system_now") and (myw_type == "timestamp"):
            return "now()"

        return super(MywPostgresDbDriver, self).sqlDefaultFor(column_desc, quote_string_values)

    def sqlReferenceClauseFor(self, reference_info):
        """
        Returns foreign key 'references' clause in a SQL field definition

        REFERENCE_INFO is a dict with elements:
          'field'       Descriptor of referenced field
          'onupdate'    Action on update (optional)
          'ondelete'    Action on delete (optional)"""

        # Subclassed to add onupdate and ondelete actions

        sql_def = super(MywPostgresDbDriver, self).sqlReferenceClauseFor(reference_info)

        action = reference_info.get("onupdate")
        if action == "CASCADE":
            sql_def += " ON UPDATE " + action
        # TODO: Report other actions ignored

        action = reference_info.get("ondelete")
        if action == "CASCADE":
            sql_def += " ON DELETE " + action

        return sql_def

    def addColumnSqls(self, schema, table_name, column_desc):
        """
        Returns the list of SQL statements to add column COLUMN_DESC to TABLE_NAME

        If column is a geometry column then includes statement to create spatial index."""

        column_name = column_desc.name

        sqls = []

        # Add field
        sql_def = self.sqlColumnDefFor(column_desc)
        db_tablename = self.dbNameFor(schema, table_name, True)
        sqls.append(
            "ALTER TABLE {} ADD COLUMN {} {}".format(
                db_tablename, self.quotedColumnName(column_name), sql_def
            )
        )

        # Add foreign key constraint (if there is one)
        for constraint_desc in column_desc.constraints:
            sqls += self.addConstraintSqls(schema, table_name, constraint_desc)

        # Add geometry index (if necessary)
        if column_desc.isGeometry():
            sqls.append(self.addGeomIndexSql(schema, table_name, column_name))

        return sqls

    def alterColumnSqls(
        self, schema, table_name, old_column_desc, new_column_desc, date_format, timestamp_format
    ):
        """
        Returns list of SQL statements to modify a column of TABLE_NAME

        OLD_COLUMN_DESC and NEW_COLUN_DESC are MywDbColumn objects. DATE_FORMAT and TIMESTAMP_FORMAT
        are for data conversion"""

        db_tablename = self.dbNameFor(schema, table_name, True)
        column_name = old_column_desc.name

        sqls = []

        # Check for things we can't handle
        if old_column_desc.name != new_column_desc.name:
            raise MywError("{}.{}: Rename not supported".format(table_name, column_name))

        if old_column_desc.key != new_column_desc.key:
            raise MywError(
                "{}.{}: Change of key status not supported".format(table_name, column_name)
            )

        # Ensure column has a table descriptor (hack to support sequence name generation)
        if not hasattr(old_column_desc, "table"):
            MywDbTable(schema, table_name, old_column_desc)
        if not hasattr(new_column_desc, "table"):
            MywDbTable(schema, table_name, new_column_desc)

        # Get SQL types
        old_sql_type = self.sqlTypeFor(old_column_desc.name, old_column_desc.type_desc)
        new_sql_type = self.sqlTypeFor(new_column_desc.name, new_column_desc.type_desc)

        # Build SQL to convert type
        if old_sql_type != new_sql_type:
            sql = self.fieldTypeConversionSqlFor(
                schema,
                table_name,
                column_name,
                old_column_desc,
                new_column_desc,
                date_format,
                timestamp_format,
            )
            sqls.append(sql)

        # Update generator/default
        old_sql_default = self.sqlDefaultFor(old_column_desc)
        new_sql_default = self.sqlDefaultFor(new_column_desc)

        if old_sql_default != new_sql_default:
            if old_sql_default != None:
                sql = "ALTER TABLE {} ALTER COLUMN {} DROP DEFAULT".format(
                    db_tablename, self.quotedColumnName(column_name)
                )

            if new_sql_default != None:
                sql = "ALTER TABLE {} ALTER COLUMN {} SET DEFAULT {}".format(
                    db_tablename, self.quotedColumnName(column_name), new_sql_default
                )

            sqls.append(sql)

        # Update field constraints
        if old_column_desc.constraints != new_column_desc.constraints:

            for constraint_desc in old_column_desc.constraints:
                sqls += self.dropConstraintSqls(schema, table_name, constraint_desc)

            for constraint_desc in new_column_desc.constraints:
                sqls += self.addConstraintSqls(schema, table_name, constraint_desc)

        return sqls

    def fieldTypeConversionSqlFor(
        self,
        schema,
        table_name,
        field_name,
        old_column_desc,
        new_column_desc,
        date_format=None,
        timestamp_format=None,
    ):
        """
        Returns SQL statement to convert SQL data type of FIELD_NAME
        """

        db_table_name = self.dbNameFor(schema, table_name, True)
        old_type_desc = old_column_desc.type_desc
        new_type_desc = new_column_desc.type_desc
        new_sql_type = self.sqlTypeFor(field_name, new_type_desc)

        # Check for things we can't handle
        # ENH: Support creation and init of sequence
        if (
            old_column_desc.generator != new_column_desc.generator
            and new_column_desc.generator == "sequence"
        ):
            raise MywError(
                "{}.{}: Change to generator 'sequence' not supported".format(table_name, field_name)
            )

        # Build basic statement
        sql = "ALTER TABLE {} ALTER COLUMN {} TYPE {}".format(
            db_table_name, self.quotedColumnName(field_name), new_sql_type
        )

        # Add specialised conversion function (if we know how to do it)
        if old_type_desc.base == "string":

            # Convert empty strings to null
            old_value = "NULLIF(" + field_name + ", '')"

            # Case: string -> number
            if new_type_desc.base in ["integer", "numeric", "double"]:

                # Strip unit from end of string value
                if new_column_desc.unit:
                    old_value = (
                        "replace("
                        + old_value
                        + ", '"
                        + self.sqlEscape(new_column_desc.unit)
                        + "', '')"
                    )

                sql += " USING " + old_value + "::" + new_sql_type

            # Case: string -> boolean
            elif new_type_desc.base in ["boolean"]:
                sql += " USING " + old_value + "::" + new_sql_type

            # Case: string -> date
            elif new_type_desc.base in ["date"]:

                if not date_format:
                    raise MywError(
                        "Cannot convert field {}.{}: No date format specified".format(
                            table_name, field_name
                        )
                    )

                sql += " USING " + "to_date(" + old_value + ", '" + date_format + "')"

            elif new_type_desc.base in ["timestamp"]:

                if not timestamp_format:
                    raise MywError(
                        "Cannot convert field {}.{}: No timestamp format specified".format(
                            table_name, field_name
                        )
                    )

                sql += (
                    " USING "
                    + "to_timestamp("
                    + old_value
                    + ", '"
                    + self._iso_to_sql_timestamp(timestamp_format)
                    + "')"
                )

        return sql

    def dropColumnSqls(self, schema, table_name, column_desc):
        """
        Returns a list of SQL statements to drop a COLUMN from TABLE_NAME
        """
        # Note: Do not need to add SQL to drop spatial index as Postgres will do this automatically

        db_tablename = self.dbNameFor(schema, table_name, True)
        column_name = column_desc.name

        sql = "ALTER TABLE {} DROP COLUMN {}".format(
            db_tablename, self.quotedColumnName(column_name)
        )

        return [sql]

    def dropTable(self, schema, table):
        """
        Drop table TABLE and associated objects (triggers, indexes, sequences)

        Table must be empty

        Subclassed to remove trigger functions"""

        # Drop table, indexes, sequences and triggers
        super(MywPostgresDbDriver, self).dropTable(schema, table)

        # Drop trigger functions
        for trigger_type in ["insert", "update", "delete"]:
            db_trigger_name = self.dbTriggerNameFor(schema, table, trigger_type, True)
            self.execute("DROP FUNCTION IF EXISTS {}()".format(db_trigger_name))

    # ==============================================================================
    #                               TRIGGER BUILDING
    # ==============================================================================

    def _createTriggerSqls(
        self, schema, trigger_name, table_name, trigger_type, trigger_conditions, trigger_body
    ):
        """
        Returns SQL to create a trigger of TRIGGER_TYPE triggered on TRIGGER_CONDITIONS with TRIGGER_BODY
        """

        sqls = []
        qualified_feature_name = self.dbNameFor(schema, table_name, True)
        db_trigger_name = self.dbNameFor(schema, trigger_name, True)

        old_new = self.trigger_old if trigger_type == "delete" else self.trigger_new

        # Drop any existing trigger
        sql = "DROP TRIGGER IF EXISTS " + trigger_name + " ON " + qualified_feature_name + ";\n"
        sqls.append(sql)

        sql = "CREATE OR REPLACE FUNCTION " + db_trigger_name + "() RETURNS TRIGGER AS " + "\n"
        sql += "$BODY$" + "\n"
        sql += trigger_body
        sql += "\n"
        sql += "  RETURN " + old_new + ";" + "\n"

        sql += "END;" + "\n"
        sql += "$BODY$ LANGUAGE 'plpgsql';" + "\n\n"

        sql += "CREATE TRIGGER " + trigger_name + " " + trigger_conditions + "\n"
        sql += "FOR EACH ROW EXECUTE PROCEDURE " + db_trigger_name + "();\n\n"

        sqls.append(sql)

        return sqls

    def featureTriggerDeclarationsSql(self, trigger_type):
        """
        Returns SQL with section declaring variables that maybe used by other sections of feature trigger code

        TRIGGER_TYPE is "insert", "update" or "delete".
        """

        sql = "BEGIN" + "\n"

        return sql

    def _featureTriggerSetKeySql(self, feature_type, key_field_name):
        """
        Returns sql to allocate an key for NEW

        FEATURE_TYPE is a feature with a sequence generator on KEY_FIELD_NAME"""

        return ""

    def _getGeomTypeClause(self, geom_exp, geom_type, geom_type_exp=None):
        """
        Returns sql clause that tests if GEOM_EXP is a geometry of myworld type GEOM_TYPE

        GEOM_TYPE should be one of: "point", "linestring", "polygon"
        """

        # Get Postgres names for the myworld geometry type
        if geom_type == "point":
            geom_type_str = "'ST_Point', 'ST_MultiPoint'"
        elif geom_type == "linestring":
            geom_type_str = "'ST_LineString', 'ST_MultiLineString'"
        elif geom_type == "polygon":
            geom_type_str = "'ST_Polygon', 'ST_MultiPolygon'"
        else:
            raise Exception("invalid geom type:", geom_type)

        # Build clause
        if geom_exp is None:
            geom_type_clause = geom_type_exp + " IN ({geomtype})"
        else:
            geom_type_clause = "ST_GeometryType(" + geom_exp + ") IN ({geomtype})"

        return geom_type_clause.format(geomtype=geom_type_str)

    def configTriggerDeclarationsSQL(self, table_name, trigger_type):
        """
        Returns SQL with section declaring variables that maybe used by other sections of config trigger code
        """
        return "BEGIN\n"

    def disableTriggersSql(self, feature_type):
        """
        Disables the triggers on the table for FEATURE_TYPE
        """
        return "ALTER TABLE " + self.dbNameFor("data", feature_type, True) + " DISABLE TRIGGER ALL"

    def enableTriggersSql(self, feature_type):
        """
        Returns the SQL to enable the triggers on the table for FEATURE_TYPE
        """
        return "ALTER TABLE " + self.dbNameFor("data", feature_type, True) + " ENABLE TRIGGER ALL"

    def triggersFor(self, schema, table_name):
        """
        Definitions of the triggers of TABLE_NAME (a dict of definitons, keyed by trigger name)

        Each definition is a dict with keys 'type' and 'body'"""

        trigger_defs = {}

        sql = "SELECT trigger_name,event_manipulation,action_statement,action_timing FROM information_schema.triggers WHERE trigger_schema='{}' AND event_object_table='{}'".format(
            schema, table_name
        )
        for rec in self.execute(sql):
            trigger_name = rec[0]
            trigger_type = rec[1]

            sql = "select pg_get_functiondef('{}.{}'::regproc)".format(schema, trigger_name)
            trigger_body = self.execute(sql).first()[0]

            trigger_defs[trigger_name] = {"type": trigger_type, "body": trigger_body}

        return trigger_defs

    # ==============================================================================
    #                                  MISC
    # ==============================================================================

    def setStatementTimeout(self, timeout):
        """
        Set or clear timeout for following SQL statements (until end of transaction)

        Statements taking longer than TIMEOUT milliseconds will abort with
        DBAPIError QueryCanceledError. A value of 0 disables timeout
        """

        self.execute("SET LOCAL statement_timeout TO %d;" % int(timeout))

    # ==============================================================================
    #                         LOCK AND TRANSACTION MANAGEMENT
    # ==============================================================================

    def acquireVersionStampLock(self, exclusive=False):
        """
        Obtain advisory lock on the 'data' version_stamp record (a transaction lock)

        This lock is used as a semaphore in the replica extract and
        export operations to determine when all transactions using
        the old version stamp value have completed.

        If optional EXCLUSIVE is True, acquire lock in exclusive mode

        Blocks indefinitely until lock is acquired. Lock is released on commit/rollback."""

        if exclusive:
            sql = "SELECT pg_advisory_xact_lock(1)"
        else:
            sql = "SELECT pg_advisory_xact_lock_shared(1)"

        self.progress(3, "Acquiring version stamp lock:", "exclusive=", exclusive)
        self.execute(sql)
        self.progress(3, "Acquired version stamp lock")

    def acquireVersionStampLockSql(self):
        """
        Returns sql to acquire the 'data' version_stamp record lock from within a trigger

        Acquires the lock-non exclusive. Lock is released on commit/rollback."""

        return "  PERFORM pg_advisory_xact_lock_shared(1);\n\n"

    def acquireSessionVersionStampLock(self):
        """
        Obtain advisory lock for database extract operations (an exclusive session lock)

        This lock is used as a semaphore to prevent concurrent
        updates to the 'data' version stamp during parallel extract
        operations.

        Blocks indefinitely until lock is acquired. Lock must be release explicitly."""

        self.progress(8, "Acquiring version stamp lock: session")
        self.execute("SELECT pg_advisory_lock(1)")
        self.progress(8, "Acquired version stamp lock")

    def releaseSessionVersionStampLock(self):
        """
        Release the extract operation lock (if owned)

        Must be called once for each time lock was acquired"""

        self.execute("SELECT pg_advisory_unlock(1)")
        self.progress(8, "Released version stamp lock")

    def acquireShardLock(self):
        """
        Obtain advisory lock on the 'replication.replica_shard_lwm' setting record (an exclusive transaction lock)

        This lock is used as a semaphore to prevent the same shard
        being allocated to more than one replica

        Blocks indefinitely until lock is acquired. Lock is released on commit/rollback."""

        self.progress(8, "Acquiring shard lock...")
        self.execute("SELECT pg_advisory_xact_lock(2)")
        self.progress(8, "Acquired sShards lock")

    def nestedTransaction(self):
        """
        Returns context manager for an inner transaction (if supported)
        """

        # Nested transactions fully supported .. so just use SQLAlchemy
        return self.session.begin_nested()

    # ==============================================================================
    #                             FEATURE DATA DUMP / LOAD
    # ==============================================================================

    def loadFeaturesFrom(
        self, table_desc, filepath, file_encoding=None, date_format=None, timestamp_format=None
    ):
        """
        Load features from FILEPATH using native import facilities

        TABLE_DESC is a MywDbTable descriptor

        Uses Postgres COPY utility. Assumes file is EWKT-encoded CSV

        Returns vector:
          [0] number of records inserted
          [1] number of records updated
          [2] number of records skipped due to errors"""

        import codecs, csv

        # Get key field name
        key_field_name = table_desc.key_column_names[0]

        # Get names of columns in input file
        with codecs.open(filepath, "r", encoding=file_encoding) as strm:
            reader = csv.DictReader(strm)
            tmp_col_names = reader.fieldnames

        # Get timestamp format
        timestamp_format = self._iso_to_sql_timestamp(timestamp_format)

        # Create temporary table to hold input data
        tmp_table_name = "myw_tmp_" + str(os.getpid())
        tmp_table_desc = MywDbTable("data", tmp_table_name)

        for col_name in tmp_col_names:
            tmp_table_desc.add(MywDbColumn(col_name, "string()"))

        self.createTable(tmp_table_desc)

        tmp_db_table_name = self.dbNameFor("data", tmp_table_name, True)

        # Build mapping to target columns
        col_names = []
        for col_name in tmp_col_names:

            if col_name in table_desc.columns:
                col_names.append(col_name)
            else:
                self.progress("warning", "Skipping column:", col_name)

        safe_col_names = []
        for col_name in col_names:
            safe_col_name = '"' + col_name + '"'
            safe_col_names.append(safe_col_name)

        # Construct SQL to cast input values to expected type
        col_sql_vals = []
        for col_name in col_names:

            sql_type = self.sqlTypeFor(col_name, table_desc.columns[col_name].type_desc)
            if sql_type == "date" and date_format != None:
                col_sql_vals.append("TO_DATE(\"{}\",'{}')".format(col_name, date_format))
            elif sql_type[:9] == "timestamp" and timestamp_format != None:
                col_sql_vals.append("TO_TIMESTAMP(\"{}\",'{}')".format(col_name, timestamp_format))
            else:
                col_sql_vals.append('"{}"::{}'.format(col_name, sql_type))

            if col_name == key_field_name:
                key_field_sql_type = sql_type

        # Construct SQL to set feature fields from temp fields
        col_sql_assigns = []
        for col_name in col_names:
            if col_name != "id":
                sql_type = self.sqlTypeFor(col_name, table_desc.columns[col_name].type_desc)
                if sql_type == "date" and date_format != None:
                    col_copy_sql = "\"{0}\" = TO_DATE({1}.{0},'{2}')".format(
                        col_name, tmp_db_table_name, date_format
                    )
                elif sql_type[:9] == "timestamp" and timestamp_format != None:
                    col_copy_sql = "\"{0}\" = TO_TIMESTAMP({1}.{0},'{2}')".format(
                        col_name, tmp_db_table_name, timestamp_format
                    )
                else:
                    col_copy_sql = '"{0}" = {1}.{0}::{2}'.format(
                        col_name, tmp_db_table_name, sql_type
                    )
                col_sql_assigns.append(col_copy_sql)

        sql_params = {
            "ftr_tab": self.dbNameFor("data", table_desc.name, True),
            "tmp_tab": self.dbNameFor("data", tmp_table_name, True),
            "col_names": ",".join(safe_col_names),
            "col_vals": ",".join(col_sql_vals),
            "col_assigns": ",".join(col_sql_assigns),
            "ftr_key": key_field_name,
            "ftr_key_type": key_field_sql_type,
        }

        self.session.commit()  # So psql \copy can 'see' temporary table

        ok = False
        try:
            # Load data into temp table
            self._load_data(tmp_db_table_name, filepath)

            # Update existing records
            sql = "UPDATE {ftr_tab} SET {col_assigns} FROM {tmp_tab} WHERE {ftr_tab}.{ftr_key} = {tmp_tab}.{ftr_key}::{ftr_key_type}".format(
                **sql_params
            )
            n_updated = self.execute(sql).rowcount

            # Insert new records
            sql = "INSERT INTO {ftr_tab} ({col_names}) SELECT {col_vals} FROM {tmp_tab} WHERE NOT EXISTS (SELECT 1 FROM {ftr_tab} WHERE {ftr_key} = {tmp_tab}.{ftr_key}::{ftr_key_type})".format(
                **sql_params
            )

            n_inserted = self.execute(sql).rowcount

            ok = True

        finally:

            # Tidy up
            if not ok:
                self.session.rollback()
            self.dropTable(tmp_table_desc.schema, tmp_table_desc.name)
            self.session.commit()

        return n_inserted, n_updated, 0

    def _load_data(self, db_table_name, filepath):
        """
        Loadds CSV data from FILEPATH into DB_TABLE_NAME using the psql \copy command
        """

        # Build command
        sql = "\copy {} FROM {} WITH (FORMAT CSV, HEADER);".format(db_table_name, filepath)

        self.run_postgres_command("psql", "-c", sql)

    def canonicalise_geometry(self, geom):
        """
        Return a version of GEOM suitable for insertion in the database

        GEOM is a a shapely geometry
        """

        # Postgres doesn't care about loop sense etc
        return geom

    # ==============================================================================
    #                                MAINTANENCE
    # ==============================================================================

    def updateStatistics(self):
        """
        Update database statistics (to improve query performance)
        """

        self.execute("ANALYSE")

    def vacuum(self, schema=None, table=None):
        """
        Compact disk
        """
        # Subclassed as cannot vacuum in transaction

        sql = "vacuum"

        if schema:
            sql += " " + self.dbNameFor(schema, table, True)

        self.run_postgres_command("psql", "-c", sql)

    # ==============================================================================
    #                                      OTHER
    # ==============================================================================

    def withinExpr(self, geometry_column, wkb_geometry, tolerance, geographic=False):
        """
        Returns sqlalchemy predicate that selects geometries within TOLERANCE of WKB_GEOMETRY

        WKB_GEOMETRY is a WKBElement.
        TOLERANCE is a distance in metres
        GEOGRAPHIC If true, perform calculations in geodetic space, otherwise in cartesian space
        Note: for geodetic space calculations to be efficient, there needs to be a geography index on GEOMETRY_COLUMN
        """

        geography = Geography(None)  # Geography(None) matches type used when we addGeographyIndex

        if geographic:
            return func.ST_DWithin(
                cast(wkb_geometry, geography), cast(geometry_column, geography), tolerance
            )
        else:
            # convert tolerance from projected meters to degrees
            tolerance = tolerance / degrees_to_metres
            return func.ST_DWithin(wkb_geometry, geometry_column, tolerance)

    def trimExpr(self, sql_expression, max_length):
        """
        SQL expression that returns SQL_EXPRESSION truncated to MAX_LENGTH chars
        """

        s = "(" + sql_expression + ")"
        s = s + "::varchar(" + str(max_length) + ")"

        return s

    def tableExists(self, schema, table):
        """
        True if table exists in database
        """

        sql = (
            "SELECT  1 FROM pg_catalog.pg_class c, pg_catalog.pg_namespace n "
            + "WHERE c.relnamespace = n.oid AND n.nspname = '{}' AND c.relname = '{}'".format(
                schema, table
            )
        )

        row = self.execute(sql).first()

        return row is not None

    def sizeOf(self, schema, table):
        """
        Size of TABLE on disk (in bytes)
        """

        sql = "select pg_total_relation_size('{}.{}')".format(schema, table)
        return self.execute(sql).scalar()

    # ==============================================================================
    #                                 HELPERS
    # ==============================================================================

    def run_postgres_command(self, *cmd):
        """
        Helper to run PostgreSQL utility on self's database
        """

        # TODO: Duplicated with MywPostgresDbServer.run_psql_command()

        os_engine = MywOsEngine(self.progress)
        db_url = self.session.bind.engine.url

        # Build command to run
        cmd = list(cmd)
        cmd += [
            "--username",
            db_url.username,
            "--dbname",
            db_url.database,
            "--host",
            db_url.host,
            "--port",
            str(db_url.port),
            "--no-password",
        ]

        # Build environment to run it in
        env_vars = {}
        if db_url.password:
            env_vars["PGPASSWORD"] = str(db_url.password)

        # Say what we are about to do
        self.progress(6, "Running postgres command:", *cmd)

        # Run it
        try:
            output = os_engine.run(*cmd, env=env_vars, log_output_level=1000)

        except MywError as cond:
            raise MywError(str(cond))

        return output

    def _iso_to_sql_timestamp(self, timestamp_format):
        """
        Convert TIMESTAMP_FORMAT to SQL form
        """

        timestamp_format = super(MywPostgresDbDriver, self)._iso_to_sql_timestamp(timestamp_format)
        if timestamp_format:
            timestamp_format = timestamp_format.replace(
                "FF", "US"
            )  # Microseconds are a good approximation to Fractional seconds

        return timestamp_format
