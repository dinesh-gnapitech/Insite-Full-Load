# Copyright: IQGeo Limited 2010-2023

import os, sys, argparse, glob, re, warnings, json, code, random, string
from collections import OrderedDict
from datetime import datetime, timedelta
from fnmatch import fnmatch
from myworldapp.core.server.replication.myw_replication_engine import (
    MywReplicationEngine,
    databaseType,
)

from sqlalchemy import exc

from myworldapp.core.server.base.core.myw_error import (
    MywError,
    MywCoordSystemError,
    MywProjFileMissingError,
)
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.core.myw_tabulation import MywTableFormatter
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from myworldapp.core.server.base.geom.myw_coord_transform import MywCoordTransform
from myworldapp.core.server.database.myw_upgrade_manager import MywUpgradeManager
from myworldapp.core.server.database.myw_database_server import MywDatabaseServer

from .myw_command import MywCommand
from .myw_argparse_help_formatter import MywArgparseHelpFormatter


def _define_operation(arg_subparsers, operation, help):
    """
    Helper to add definition for an operation
    """
    op_def = arg_subparsers.add_parser(
        operation, help=help, formatter_class=MywArgparseHelpFormatter
    )
    op_def.set_defaults(operation=operation)
    return op_def


def _add_standard_args(op_def):
    """
    Define the 'standard' arguments
    """
    # Note: Done with separate proc to get the standard args at end
    op_def.add_argument("--verbosity", type=int, metavar="LEVEL", default=2, help="Witterage level")
    op_def.add_argument(
        "--summary", type=int, metavar="LEVEL", default=0, help="Summary output level"
    )
    grp = op_def.add_argument_group("connect spec")
    grp.add_argument(
        "--host", type=str, help="Server on which Postgres is running (default: localhost)"
    )
    grp.add_argument("--port", type=int, help="Port on which server listens (default: from pg_env)")
    grp.add_argument(
        "--username", "-U", type=str, help="Postgres user to connect as (default: from pg_env)"
    )  # ENH: Find a way to support unicode
    grp.add_argument(
        "--password", "-P", type=str, help="Password for Postgres user"
    )  # ENH: Find a way to support unicode
    grp.add_argument("--password_stdin", action="store_true", help="Take the password from stdin")


class EncryptionKeyAction(argparse.Action):
    """
    Action class that sets the following args for --encryption_key:
    - If not defined, set no encryption key
    - If set without a value, will generate a random 32-character key
    - If set with a value, sets it to that value
    """

    def __init__(self, option_strings, dest, nargs=None, **kwargs):
        if nargs is not None:
            raise ValueError("nargs not allowed")

        super().__init__(option_strings, dest, nargs="?", **kwargs)

    def __call__(self, parser, namespace, values, option_string=None):
        if values == None or values == "":
            values = "".join(
                random.SystemRandom().choice(string.ascii_uppercase + string.digits)
                for _ in range(32)
            )
        setattr(namespace, self.dest, values)


class MywDbCommand(MywCommand):
    """
    Engine implementing the database management command line utility

    Example of use:
      MywDbCommand().run('myw_dev','list','--since','base')"""

    # ==============================================================================
    #                                  SHARED ARGS
    # ==============================================================================

    # Definition of command syntax (gets extended in operation clauses below)
    arg_parser = argparse.ArgumentParser(prog="myw_db", formatter_class=MywArgparseHelpFormatter)
    arg_parser.add_argument(
        "--version", action="version", version="%(prog)s " + MywCommand.version()
    )
    arg_parser.epilog = "Utility for managing myWorld databases."

    arg_parser.add_argument("db_name", type=str, help="Name of PostgreSQL database")
    arg_subparsers = arg_parser.add_subparsers(
        dest="operation", help="Operation to perform", required=True
    )

    # ==============================================================================
    #                                  RUNNING
    # ==============================================================================

    def run_method(self, meth):
        """
        Execute method METH

        Subclassed to report database errors neatly"""

        self.progress = MywSimpleProgressHandler(self.args.verbosity)

        # Autodetect sqlite database type
        if self.args.db_name.endswith(".db"):
            db_type = "sqlite"
        else:
            db_type = None

        # ENH: Find a better place for this
        self.db_server = MywDatabaseServer(
            db_type=db_type,
            host=self.args.host,
            port=self.args.port,
            username=self.args.username,
            password=self.parsePassword(),
            progress=self.progress,
        )

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=exc.SAWarning)
            warnings.simplefilter("error", category=UnicodeWarning)

            try:
                super(MywDbCommand, self).run_method(meth)

            except IOError as cond:
                if self.args.verbosity > 10:
                    raise
                raise MywError("I/O error:", cond)

            except exc.OperationalError as cond:
                if self.args.verbosity > 10:
                    raise
                msg_encoding = (
                    os.getenv("MYW_POSTGRES_MSG_ENCODING") or sys.getdefaultencoding()
                )  # Work-around for encoding issue with sqlalchemy when connecting to database
                raise MywError("Database error:", cond)

        if self.args.summary:
            self.progress.print_statistics(self.args.summary)

    def replication_engine(
        self, db, db_type=None, remote_username=None, remote_password=None, ignore_sync_url=False
    ) -> MywReplicationEngine:
        """
        Returns engine for performing replication operations on DB

        Optional DB_TYPE defines the expected database type
        Optional ignore_sync_url is a hack until engines are reworked for 3.0 changes"""

        # Imported lazily for speed
        from myworldapp.core.server.replication.myw_master_replication_engine import (
            MywMasterReplicationEngine,
        )
        from myworldapp.core.server.replication.myw_extract_replication_engine import (
            MywExtractReplicationEngine,
        )

        # Determine type of engine to create
        if not db_type:
            db_type = databaseType(db)

        if db_type == "non-initialised":
            engine_exemplar = MywMasterReplicationEngine
        elif db_type == "master":
            engine_exemplar = MywMasterReplicationEngine
        elif db_type == "extract":
            engine_exemplar = MywExtractReplicationEngine

        # Set options
        # ENH: Refactor engines for 3.0 changes and get rid of this
        extras = {}

        if engine_exemplar != MywMasterReplicationEngine:
            if remote_username:
                extras["remote_username"] = remote_username
            if remote_password:
                extras["remote_password"] = remote_password
            if ignore_sync_url:
                extras["ignore_sync_url"] = ignore_sync_url

        # Create it
        return engine_exemplar(db, db_type=db_type, progress=self.progress, **extras)

    # ==============================================================================
    #                                     HELPERS
    # ==============================================================================

    def tableSpecsMatching(self, db, name_spec):
        """
        Names of tables matching NAME_SPEC (sorted)

        NAME_SPEC is a string of the form:
         [ <schema> .] <table_name>

        Returns a list of (<schema>,<table_name>) tuples"""

        # Deal with default schema
        schema, name_spec = self.parseTableNameSpec(name_spec, "data")

        # ENH: For data schema, safer to get names from DD (avoids truncation problems on Oracle)
        specs = []
        for table_name in db.db_driver.tableNamesIn(schema):
            if fnmatch(table_name, name_spec):
                specs.append((schema, table_name))

        return sorted(specs)

    def parseTableNameSpec(self, name_spec, default_schema):
        """
        Parse a table specifier

        NAME_SPEC is a string of the form:
         [ <schema> ] <table_name>"""

        # Deal with default schema
        if "." in name_spec:
            (schema, name_spec) = name_spec.split(".", 1)
        else:
            schema = default_schema

        return schema, name_spec

    def parseFieldNameSpec(self, name_spec):
        """
        Parse a field specifier

        NAME_SPEC is a string of the form:
         [ <datasource> /] <feature_type> [. <field_name> ]"""

        (datasource, name_spec) = self.parseFeatureNameSpec(name_spec)

        if "." in name_spec:
            (feature_type, field_name) = name_spec.split(".", 1)
            if feature_type == "":
                feature_type = "*"
            if field_name == "":
                field_name = "*"
        else:
            feature_type = name_spec
            field_name = "*"

        return datasource, feature_type, field_name

    def parseFeatureNameSpec(self, name_spec):
        """
        Parse a feature type specifier

        NAME_SPEC is a string of the form:
         [ <datasource> /] <feature_type>"""

        if "/" in name_spec:
            (datasource, feature_type) = name_spec.split("/", 1)
            if feature_type == "":
                feature_type = "*"
        else:
            datasource = "myworld"
            feature_type = name_spec

        return datasource, feature_type

    def parsePassword(self):
        """
        uses password from argument or stdin depending on command arguments used.

        Returns String password
        """

        """ENH: Duplicate parsePassword in myw_eds_command"""

        from myworldapp.core.server.base.core.utils import read_password_from_stdin

        password = self.args.password

        # Warn about using --password
        if self.args.password is not None:
            self.progress(
                "warning", "Using --password via the CLI is insecure. Use --password_stdin"
            )

        if self.args.password_stdin:
            password_as_read = read_password_from_stdin()
            password = password if password_as_read is None else password_as_read
        return password

    def geomFilterFor(self, db, feature_type, region_geom):
        """
        Returns MywDbPredicate selecting records of feature_type that intersect REGION_GEOM

        If REGION_GEOM is None, returns None
        If feature type has no geom fields, returns predicate false"""

        if not region_geom:
            return None

        table = db.tables[feature_type]

        return table.geomFilter(region_geom)

    def _dict_from_rec(self, rec, geom_as_str=False):
        """
        Returns database record REC as a dict

        If GEOM_AS_STR is true, use short textual description for geometry fields"""

        # NOTE: geom_as_str completely unused at present.
        # ENH: Map images to strings too

        props = {}

        for col in rec.__table__.columns:
            val = rec[col.name]

            # Skip delta-specific fields
            if hasattr(rec, "_descriptor") and not col.name in rec._descriptor.fields:
                continue

            # Convert geoms to strings
            if hasattr(val, "geom_from"):
                geom = rec._field(col.name).geom()
                val = geom.geom_type.lower()

                if val == "linestring":
                    val += "({})".format(len(geom.coords))

                elif val == "polygon":
                    n_vertices = [str(len(geom.exterior.coords))]
                    for interior in geom.interiors:
                        n_vertices.append(str(len(interior.coords)))
                    val += "({})".format(",".join(n_vertices))

            # Convert feature binary fields to strings
            if val is not None and hasattr(rec, "_descriptor"):
                field = rec._field(col.name)
                base_type = field.desc.type_desc.base

                if base_type == "image":
                    val = "image({}KB)".format(field.displayValue())  # ENH: Encapsulate on model
                elif base_type == "file":
                    val = field.displayValue()

            props[col.name] = val

        return props

    def format_json(self, data):
        """
        Formats DATA as a JSON string (in repeatable order)
        """
        # This is mainly to prevent test jitter

        from simplejson import encoder as json_encoder

        # Proc to round to N significant digits
        round_to_sf = lambda o: float("{:.15g}".format(o))

        # Check for nothing to do
        if not data:
            return ""

        # Sort data (for repeatability)
        sorted_data = self.sort_collection(data)

        # Show it, hiding numeric jitter
        orig_float_repr = json_encoder.FLOAT_REPR
        try:
            json_encoder.FLOAT_REPR = lambda o: str(round_to_sf(o))
            json_str = json.dumps(sorted_data)
        finally:
            json_encoder.FLOAT_REPR = orig_float_repr

        return json_str

    def sort_collection(self, data):
        """
        Returns a copy of structure DATA with dict elements sorted by key (recursive)
        """

        if isinstance(data, dict):

            res = OrderedDict()

            for key in sorted(data.keys()):
                res[key] = self.sort_collection(data[key])

            return res

        elif isinstance(data, list):

            res = []

            for value in data:
                res.append(self.sort_collection(value))

            return res

        else:
            return data

    # ==============================================================================
    #                               OPERATION CREATE
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "create", help="Create new database")
    op_def.add_argument("--template", type=str, help="Database to copy")
    op_def.add_argument(
        "--overwrite", action="store_true", help="If database already exists, overwrite it"
    )
    op_def.add_argument(
        "--tilestore",
        type=str,
        help="Used to adjust tilestore paths when template is existing database",
    )
    _add_standard_args(op_def)

    def operation_create(self):
        """
        Create a database instance
        """

        # Drop existing instance (if necesary)
        if self.args.overwrite and self.db_server.exists(self.args.db_name):
            self.progress(1, "Dropping database:", self.args.db_name, "...")
            self.db_server.drop(self.args.db_name)

        # Create new instance
        self.progress(1, "Creating database:", self.args.db_name, "...")
        self.db_server.create(self.args.db_name, self.args.template)

        # Apply tilestore mapping (used when copying a populated database)
        if self.args.tilestore:
            db = self.db_server.open(self.args.db_name)
            tilestore_spec = db.tilestore().mapped_spec(self.args.tilestore)
            db.setTileFiles(tilestore_spec)
            db.commit()

    # ==============================================================================
    #                                OPERATION INSTALL
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "install", help="Install myWorld tables")
    op_def.add_argument("module", type=str, default=None, help="Module to install")
    op_def.add_argument("--stop_before", type=int, default=999999, help="Stop before this update")
    op_def.add_argument(
        "--lang",
        type=str,
        help="Language pack to take external names from (default: system language)",
    )
    op_def.add_argument("--encoding", type=str, default="utf-8", help="Language pack encoding")

    _add_standard_args(op_def)

    def operation_install(self):
        """
        Install data model
        """
        session = self.db_server.openSession(self.args.db_name)
        upgrade_mgr = MywUpgradeManager(self.progress)

        if self.args.module == "core":
            upgrade_mgr.installCore(
                session, self.args.stop_before, self.args.lang, self.args.encoding
            )

        else:
            upgrade_mgr.installModule(
                self.args.module, session, self.args.stop_before, self.args.lang, self.args.encoding
            )

    # ==============================================================================
    #                                OPERATION UPGRADE
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "upgrade", help="Upgrade database from an earlier release"
    )
    op_def.add_argument("module", type=str, help="Module to upgrade")
    op_def.add_argument("upgrade_id", type=str, nargs="+", help="Upgrade to run")
    op_def.add_argument("--stop_before", type=int, default=999999, help="Stop before this update")
    op_def.add_argument(
        "--lang",
        type=str,
        help="Language pack to take external names from (default: system language)",
    )
    op_def.add_argument("--encoding", type=str, default="utf-8", help="Language pack encoding")
    op_def.add_argument(
        "--test_run", action="store_true", default=False, help="Just show show would be done"
    )
    _add_standard_args(op_def)

    def operation_upgrade(self):
        """
        Upgrade data model
        """

        # Open the database
        session = self.db_server.openSession(self.args.db_name)

        upgrade_mgr = MywUpgradeManager(self.progress)

        # For each upgrade ..
        for upgrade_id in self.args.upgrade_id:

            # Find upgrade engine
            upgrade_engine = upgrade_mgr.engineFor(self.args.module, upgrade_id)

            if upgrade_engine == None:
                raise MywError("No such upgrade:", self.args.module, upgrade_id)

            # Run it
            with self.progress.operation("Running upgrade", upgrade_id):
                up = upgrade_engine(session, self.progress, self.args.lang, self.args.encoding)
                up.run(stop_before=self.args.stop_before, dry_run=self.args.test_run)

    # ==============================================================================
    #                                OPERATION LIST
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "list", help="Show summary of database contents")
    op_def.add_argument(
        "what",
        choices=[
            "data",
            "records",
            "datasources",
            "features",
            "fields",
            "field_groups",
            "queries",
            "searches",
            "filters",
            "enums",
            "layers",
            "layer_groups",
            "private_layers",
            "networks",
            "applications",
            "application_layers",
            "roles",
            "users",
            "bookmarks",
            "groups",
            "settings",
            "notifications",
            "rights",
            "versions",
            "checkpoints",
            "table_sets",
            "extracts",
            "extract_roles",
            "replicas",
            "usage",
            "sequences",
            "schema",
            "schema_sql",
            "system_tables",
            "deltas",
            "conflicts",
        ],
        nargs="?",
        default="data",
        help="Type of information to list",
    )
    op_def.add_argument("names", type=str, nargs="?", default="*", help="Item to list")
    op_def.add_argument(
        "--full", action="store_true", help="Long listing (shows additional details)"
    )
    op_def.add_argument(
        "--since", type=str, metavar="CHECKPOINT", help="Show changes since this checkpoint"
    )
    op_def.add_argument(
        "--delta", type=str, default="", help="Show records in this database version"
    )
    op_def.add_argument("--start", type=str, metavar="DATE", help="Start date for usage statistics")
    op_def.add_argument("--end", type=str, metavar="DATE", help="End date for usage statistics")
    op_def.add_argument(
        "--by",
        type=str,
        choices=[
            "licence",
            "application",
            "layer",
            "user",
            "session",
            "action",
            "month",
            "week",
            "day",
            "hour",
        ],
        default="licence",
        help="Aggregation for usage statistics",
    )
    op_def.add_argument("--limit", type=int, help="Maximum number of records to display")
    op_def.add_argument(
        "--layout",
        type=str,
        choices=MywTableFormatter.layouts,
        default="columns",
        help="Format for ouput",
    )
    _add_standard_args(op_def)

    def operation_list(self):
        """
        Show summary of database content
        """

        db = self.db_server.open(self.args.db_name)

        if self.args.what == "data":
            self.list_counts(
                db, self.args.names, self.args.layout, self.args.full, self.args.since, "data"
            )
        elif self.args.what == "system_tables":
            self.list_counts(
                db, self.args.names, self.args.layout, self.args.full, self.args.since, "myw"
            )
        elif self.args.what == "records":
            self.list_records(
                db,
                self.args.names,
                self.args.layout,
                self.args.full,
                self.args.since,
                self.args.delta,
                self.args.limit,
            )
        elif self.args.what == "deltas":
            self.list_deltas(db, self.args.names, self.args.layout, self.args.full, self.args.since)
        elif self.args.what == "conflicts":
            self.list_conflicts(
                db, self.args.names, self.args.layout, self.args.full, self.args.delta
            )
        elif self.args.what == "datasources":
            self.list_datasources(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "features":
            self.list_features(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "fields":
            self.list_fields(db, self.args.names, self.args.layout, self.args.full, self.args.since)
        elif self.args.what == "field_groups":
            self.list_field_groups(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "queries":
            self.list_queries(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "searches":
            self.list_searches(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "filters":
            self.list_filters(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "enums":
            self.list_enums(db, self.args.names, self.args.layout, self.args.full, self.args.since)
        elif self.args.what == "layers":
            self.list_layers(db, self.args.names, self.args.layout, self.args.full, self.args.since)
        elif self.args.what == "layer_groups":
            self.list_layer_groups(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "private_layers":
            self.list_private_layers(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "networks":
            self.list_networks(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "applications":
            self.list_applications(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "application_layers":
            self.list_application_layers(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "roles":
            self.list_roles(db, self.args.names, self.args.layout, self.args.full, self.args.since)
        elif self.args.what == "users":
            self.list_users(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "bookmarks":
            self.list_bookmarks(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "groups":
            self.list_groups(db, self.args.names, self.args.layout, self.args.full, self.args.since)
        elif self.args.what == "settings":
            self.list_settings(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "notifications":
            self.list_notifications(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "rights":
            self.list_rights(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "versions":
            self.list_versions(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "checkpoints":
            self.list_checkpoints(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "table_sets":
            self.list_table_sets(
                db, self.args.names, self.args.layout, self.args.full, self.args.since
            )
        elif self.args.what == "extracts":
            self.list_extracts(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "extract_roles":
            self.list_extract_roles(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "replicas":
            self.list_replicas(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "sequences":
            self.list_sequences(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "schema":
            self.list_schema(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "schema_sql":
            self.list_schema_sql(db, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "usage":
            self.list_usage(
                db,
                self.args.names,
                self.args.layout,
                self.args.by,
                self.args.start,
                self.args.end,
                self.args.full,
            )
        else:
            raise Exception("Bad option: " + self.args.what)

    def list_counts(self, db, name_spec, layout, full, since, default_schema):
        """
        Helper to list table info
        """

        # Get schema
        (schema, name_spec) = self.parseTableNameSpec(name_spec, default_schema)

        # Find tables to list
        if schema == "myw":
            table_names = sorted(db.tableNames(schema, name_spec))
        else:
            table_names = db.dd.featureTypes(
                "myworld",
                name_spec,
                versioned_only=(schema != "data"),
                sort=True,
                warn_if_no_match=True,
            )

        # List them
        if since == None:
            self.list_counts_full(db, schema, table_names, layout, full)
        else:
            self.list_counts_since(db, schema, table_names, layout, since)

    def list_counts_full(self, db, schema, table_names, layout, full):
        """
        Helper to list full table counts
        """

        # Get data to display
        rows = []
        for name in sorted(table_names):
            count = db.db_driver.count(schema, name)

            row = {"table": name, "count": count}

            if full:
                size = db.db_driver.sizeOf(schema, name) / (1024 * 1024.0)
                row["size"] = "{:.3f}MB".format(size)

            rows.append(row)

        # Display it
        tab_fmtr = MywTableFormatter("table", "count")
        if full:
            tab_fmtr.addColumn("size")

        self.print_lines(tab_fmtr.format(rows, layout))

    def list_counts_since(self, db, schema, table_names, layout, checkpoint):
        """
        Helper to list table changes since CHECKPOINT
        """

        # Find version to start from
        since_version = db.dataVersionFor(checkpoint)

        # Get data to display
        rows = []
        for tab_name in table_names:

            if schema == "myw":
                changes = db.configChanges(tab_name, since_version)
            elif schema == "data":
                changes = db.featureChanges(tab_name, since_version)
            else:
                changes = db.deltaChanges(tab_name, since_version, schema)

            n_recs = len(changes)
            if n_recs > 0:

                row = {
                    "table": tab_name,
                    "count": n_recs,
                    "inserts": list(changes.values()).count("insert"),
                    "updates": list(changes.values()).count("update"),
                    "deletes": list(changes.values()).count("delete"),
                }

                rows.append(row)

        # Display it
        tab_fmtr = MywTableFormatter("table", "count", "inserts", "updates", "deletes")
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_records(self, db, name_spec, layout, full, since, delta, limit):
        """
        Helper to list records for feature types matching string NAME_SPEC
        """

        feature_types = db.dd.featureTypes(
            "myworld", name_spec, versioned_only=bool(delta), sort=True, warn_if_no_match=True
        )

        # Determine database version
        since_version = None
        if since:
            since_version = db.dataVersionFor(since)

        # Determine ident columns
        base_cols = []
        if delta:
            base_cols.append("delta")
        if delta or since:
            base_cols.append("change")
        base_cols.append("record")

        # Case: Separate table for each feature type
        if full:
            for feature_type in feature_types:

                # Get data to display
                rows = self._get_record_rows(db, [feature_type], delta, since_version, limit, True)
                if not rows:
                    continue

                # Get columns to display
                feature_rec = db.dd.featureTypeRec("myworld", feature_type)
                field_names = list(feature_rec.fieldRecs(stored_only=True).keys())
                field_names.remove(feature_rec.key_name)
                cols = base_cols + field_names

                # Display data
                tab_fmtr = MywTableFormatter(*cols)
                print()
                self.print_lines(tab_fmtr.format(rows, layout))

        # Case: Single table for all feature types
        else:
            rows = self._get_record_rows(db, feature_types, delta, since_version, limit)
            cols = base_cols + ["myw_title"]

            tab_fmtr = MywTableFormatter(*cols)
            self.print_lines(tab_fmtr.format(rows, layout))

    def _get_record_rows(
        self, db, feature_types, delta="", since_version=None, limit=None, geom_as_str=False
    ):
        """
        Helper to get rows for FEATURE_TYPES

        If optional SINCE is provided, return only the records that changed since that checkpoint.
        If optional GEOM_AS_STR is True, return string representation of geometry fields"""

        rows = []

        for feature_type in feature_types:
            table = db.view(delta).table(feature_type)
            model = table.model
            key_field_name = model._descriptor.key_field_name

            # Case: Delta only
            # ENH: Remove this duplication
            if delta:

                for rec in db._deltaRecsFor(feature_type, delta, ordered=True):

                    row = {
                        "delta": rec.myw_delta,
                        "record": "{}({})".format(feature_type, rec._id),
                        "change": rec.myw_change_type,
                    }

                    row.update(self._dict_from_rec(rec, geom_as_str))
                    row["myw_title"] = rec._title()
                    row["myw_short_description"] = rec._shortDescription()

                    rows.append(row)

                    if limit and len(rows) == limit:
                        rows.append({"delta": "...", "change": "...", "record": "..."})
                        break

            # Case: Changes only
            elif since_version != None:

                for key_val, change in list(db.featureChanges(feature_type, since_version).items()):

                    row = {"record": "{}({})".format(feature_type, key_val), "change": change}

                    if change != "delete":
                        rec = db.session.query(model).get(key_val)
                        row.update(self._dict_from_rec(rec, geom_as_str))
                        row[
                            "myw_title"
                        ] = rec._title()  # ENH: Extend table formatter to support computed columns
                        row["myw_short_description"] = rec._shortDescription()

                    rows.append(row)

                    if limit and len(rows) == limit:
                        rows.append({"change": "...", "record": "..."})
                        break

            # Case: All records
            else:
                query = db.session.query(model).order_by(key_field_name)
                if limit:
                    query = query.limit(limit)

                for rec in query:
                    row = self._dict_from_rec(rec)
                    row["record"] = rec.__ident__()
                    row.update(self._dict_from_rec(rec, geom_as_str))
                    row["myw_title"] = rec._title()
                    row["myw_short_description"] = rec._shortDescription()

                    rows.append(row)

                    if limit and len(rows) == limit:
                        rows.append({"record": "..."})
                        break

        return rows

    def list_deltas(self, db, name_spec, layout, full, since):
        """
        Helper to list deltas known to the system that match NAME_SPEC
        """

        if since:
            self._list_deltas_since(db, name_spec, layout, since, full)
        else:
            self._list_deltas_full(db, name_spec, layout, full)

    def _list_deltas_since(self, db, name_spec, layout, since, full):
        """
        Helper to list deltas that have changed since checkpoint SINCE

        Lists database-level changes (not the user-level changes, as per list_deltas)"""

        # ENH: If full is set, show per-feature type changes

        # Determine database version
        since_version = db.dataVersionFor(since)

        # Get data to display
        stats = {}

        for feature_type in db.dd.featureTypes("myworld", versioned_only=True, sort=True):
            changes = db.deltaChanges(feature_type, since_version)

            for (delta, id), change_type in list(changes.items()):
                stat = stats.get(delta)

                if not stat:
                    stat = stats[delta] = {
                        "delta": delta,
                        "insert": 0,
                        "update": 0,
                        "delete": 0,
                        "count": 0,
                    }

                stat[change_type] += 1
                stat["count"] += 1

        rows = []
        for delta in sorted(stats.keys()):
            rows.append(stats[delta])

        # Display it
        cols = [
            "delta",
            "count",
            ["insert", "inserts"],
            ["update", "updates"],
            ["delete", "deletes"],
        ]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def _list_deltas_full(self, db, name_spec, layout, full):
        """
        Helper to list deltas known to the system that match NAME_SPEC
        """

        # Get basic data
        stats = db.deltaStats(name_spec)
        feature_types = set()

        # Build summary stats
        rows = []
        for delta in sorted(stats):
            stat = stats[delta]
            row = {"delta": delta, "insert": 0, "update": 0, "delete": 0, "count": 0}

            for ft_name, ft_stat in list(stat.items()):
                row[ft_name] = ft_stat

                for change_type, n_recs in list(ft_stat.items()):
                    if change_type not in row:
                        row[
                            change_type
                        ] = 0  # unexpected but protects so the command still runs with bad data
                    row[change_type] += n_recs
                    row["count"] += n_recs

                feature_types.add(ft_name)

            rows.append(row)

        feature_types = sorted(feature_types)

        # Add per-table stats
        # ENH: Would fail if there was a feature type 'insert' etc
        for row in rows:
            for ft_name in feature_types:
                ft_stat = row.get(ft_name)
                if ft_stat:
                    row[ft_name] = "{}:{}:{}".format(
                        ft_stat["insert"], ft_stat["update"], ft_stat["delete"]
                    )

        # Display it
        cols = [
            "delta",
            "count",
            ["insert", "inserts"],
            ["update", "updates"],
            ["delete", "deletes"],
        ]
        if full:
            cols += sorted(feature_types)

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_conflicts(self, db, name_spec, layout, full, delta_spec):
        """
        Helper to list conflicts for feature types matching string NAME_SPEC
        """

        # ENH: If full, show more info

        feature_types = db.dd.featureTypes(
            "myworld", name_spec, versioned_only=True, sort=True, warn_if_no_match=True
        )

        # Get data to display
        rows = []

        for feature_type in feature_types:
            for delta_rec in db._deltaRecsFor(feature_type, delta_spec):

                table = db.view(delta_rec.myw_delta).table(feature_type)
                conflict = table.conflictFor(delta_rec)

                if conflict:
                    row = {
                        "delta": delta_rec.myw_delta,
                        "record": delta_rec.__ident__(False),
                        "master_change": conflict.changeStr(conflict.base_rec, conflict.master_rec),
                        "delta_change": conflict.changeStr(conflict.base_rec, conflict.delta_rec),
                    }

                    rows.append(row)

        # Display it
        cols = ["delta", "record", "master_change", "delta_change"]
        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_features(self, db, name_spec, layout, full, since):
        """
        Helper to list features matching string NAME_SPEC
        """

        # Helper to build dat for a table row
        # ENH: Support column value from function in table formatter
        def rowFrom(rec):
            row = self._dict_from_rec(rec)
            row["name"] = str(rec)
            row["layers"] = rec.layers_str()
            row["searches"] = rec.search_rule_recs.count()
            row["queries"] = rec.query_recs.count()
            row["filters"] = rec.filter_recs.count()
            row["groups"] = rec.field_group_recs.count()
            row["filter_fields"] = ",".join(list(rec.filter_map().values()))
            row["remote_spec"] = self.format_json(rec.get_property("remote_spec"))
            return row

        # Get data to display
        rows = []

        base_cols = [["name", "feature_name"]]

        if since == None:

            # Get data to display
            # ENH: EXTDD: Provide way to see changes over all datasources
            (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

            for rec in db.dd.featureTypeRecs(
                datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
            ):
                row = rowFrom(rec)
                rows.append(row)

        else:
            base_cols.insert(0, "change")
            since_version = db.dataVersionFor(since)

            for (feature_name, change) in list(
                db.configChanges("dd_feature", since_version, name_spec).items()
            ):
                (datasource, feature_type) = feature_name.split("/")

                row = {"change": change, "name": feature_name}

                if change != "delete":
                    rec = db.dd.featureTypeRec(datasource, feature_type)
                    row.update(rowFrom(rec))

                rows.append(row)

        # Build table formatter
        cols = base_cols + ["external_name", "geometry_type", "layers"]
        if full:
            cols[-2:-2] = (["key_name", "key"],)
            cols[-2:-2] = (["primary_geom_name", "primary_geom"],)
            cols += [
                ["track_changes", "tracked"],
                "versioned",
                "geom_indexed",
                "editable",
                ["insert_from_gui", "insert"],
                ["update_from_gui", "update"],
                ["delete_from_gui", "delete"],
                "editor_options",
                "groups",
                "searches",
                "queries",
                "filters",
                "filter_fields",
                ["title_expr", "title"],
                ["short_description_expr", "short_description"],
                "remote_spec",
            ]
        tab_fmtr = MywTableFormatter(*cols)

        # Display it
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_fields(self, db, name_spec, layout, full, since):
        """
        Helper to list fields matching NAME_SPEC
        """

        # Get data to display
        (datasource_spec, feature_type_spec, field_name_spec) = self.parseFieldNameSpec(name_spec)

        rows = []
        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):

            for field_rec in feature_rec.dd_field_recs:
                if not fnmatch(field_rec.internal_name, field_name_spec):
                    continue

                # Construct derived fields
                field_rec.full_name = "{}.{}".format(field_rec.table_name, field_rec.internal_name)

                if field_rec.min_value != None:
                    field_rec.range = "{}:{}".format(field_rec.min_value, field_rec.max_value)
                else:
                    field_rec.range = None

                # Add to list (if apropriate)
                rows.append(field_rec)

        # Build table formatter
        cols = ["full_name", "external_name", "type", "value"]
        if full:
            cols += [
                "enum",
                "generator",
                "unit",
                "display_unit",
                "unit_scale",
                "display_format",
                "range",
                "mandatory",
                "default",
                "indexed",
                "read_only",
                "visible",
                "viewer_class",
                "editor_class",
                "new_row",
                "validators",
                "creates_world_type",
            ]
        tab_fmtr = MywTableFormatter(*cols)

        # Display data
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_field_groups(self, db, name_spec, layout, full, since):
        """
        Helper to list field groups for features matching string NAME_SPEC
        """

        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

        # Get data to display
        rows = []

        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):
            for group_rec in feature_rec.field_group_recs:

                if not full:
                    row = self._dict_from_rec(group_rec)
                    row["fields"] = len(list(group_rec.items()))
                    rows.append(row)
                else:
                    for item_rec in list(group_rec.items()):
                        row = self._dict_from_rec(group_rec)
                        row["field_name"] = item_rec.field_name
                        rows.append(row)

        # Build table formatter
        cols = [["feature_name", "feature"], ["display_name", "group"], ["is_expanded", "expanded"]]
        if full:
            cols += [["field_name", "field"]]
        else:
            cols += ["fields"]

        tab_fmtr = MywTableFormatter(*cols)

        # Display it
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_queries(self, db, name_spec, layout, full, since):
        """
        Helper to list queries for features matching string NAME_SPEC
        """

        # ENH: EXTDD: Provide way to see changes over all datasources
        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

        # Get data to display
        rows = []

        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):
            for rec in feature_rec.query_recs:
                rows.append(rec)

        # Build table formatter
        cols = [
            ["myw_object_type", "feature"],
            ["myw_search_val1", "matched_value"],
            ["myw_search_desc1", "display_value"],
            ["attrib_query", "filter"],
            ["lang", "language"],
        ]
        if full:
            cols[1:1] = ["id"]

        tab_fmtr = MywTableFormatter(*cols)

        # Display it
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_searches(self, db, name_spec, layout, full, since):
        """
        Helper to list searches for features matching string NAME_SPEC
        """

        # ENH: EXTDD: Provide way to see changes over all datasources
        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

        # Get data to display
        rows = []

        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):
            for rec in feature_rec.search_rule_recs:
                rows.append(rec)

        # Build table formatter
        cols = [
            ["feature_name", "feature"],
            ["search_val_expr", "matched_value"],
            ["search_desc_expr", "display_value"],
            ["lang", "language"],
        ]
        if full:
            cols[1:1] = ["id"]

        tab_fmtr = MywTableFormatter(*cols)

        # Display it
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_filters(self, db, name_spec, layout, full, since):
        """
        Helper to list filters for features matching string NAME_SPEC
        """

        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

        # Get data to display
        rows = []

        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):

            for rec in feature_rec.filter_recs:
                rows.append(rec)

        # Build table formatter
        tab_fmtr = MywTableFormatter(["feature_name", "feature"], ["name", "filter"], "value")

        # Display it
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_enums(self, db, name_spec, layout, full, since):
        """
        Helper to list enumerator values matching string NAME_SPEC
        """

        if not full:
            self._list_enum_counts(db, name_spec, layout, since)
        else:
            self._list_enum_values(db, name_spec, layout, since)

    def _list_enum_counts(self, db, name_spec, layout, since):
        """
        Helper to list enumerator matching string NAME_SPEC
        """

        # Get data to display
        rows = []

        if since == None:

            # Case: Show all
            cols = ["enum", "count"]

            for enum_name in db.dd.enumeratorNames(name_spec, sort=True, warn_if_no_match=True):
                enum_rec = db.dd.enumeratorRec(enum_name)

                row = {"enum": enum_name, "count": len(enum_rec.value_recs.all())}

                rows.append(row)

        else:

            # Case: Show changes
            since_version = db.dataVersionFor(since)
            cols = ["change", "enum", "count"]

            for enum_name, change in list(
                db.configChanges("dd_enum", since_version, name_spec).items()
            ):

                row = {"change": change, "enum": enum_name}

                if change != "delete":
                    row["count"] = len(db.dd.enumeratorRec(enum_name).value_recs.all())

                rows.append(row)

        # Display it
        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def _list_enum_values(self, db, name_spec, layout, since):
        """
        Helper to list enumerator values matching string NAME_SPEC
        """

        # Get data to display
        rows = []
        for enum_name in db.dd.enumeratorNames(name_spec, sort=True, warn_if_no_match=True):
            enum_rec = db.dd.enumeratorRec(enum_name)

            for enum_value_rec in enum_rec.value_recs:
                rows.append(
                    {
                        "enum": enum_name,
                        "value": enum_value_rec.value,
                        "display_value": enum_value_rec.display_value,
                    }
                )

        # Display it
        tab_fmtr = MywTableFormatter("enum", "value", "display_value")
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_applications(self, db, name_spec, layout, full, since):
        """
        Helper to list applications matching string NAME_SPEC
        """

        # Get data to display
        rows = []

        if since == None:

            # Show all records
            for app_name in db.config_manager.applicationNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                rec = db.config_manager.applicationRec(app_name)
                rec.layers = len(rec.layer_recs())
                rows.append(rec)

            cols = ["name", "external_name", "layers"]
        else:

            # Show changes
            since_version = db.dataVersionFor(since)

            for app_name, change in list(
                db.configChanges("application", since_version, name_spec).items()
            ):
                row = {"change": change, "name": app_name}
                if change != "delete":
                    rec = db.config_manager.applicationRec(app_name)

                    row.update(self._dict_from_rec(rec))
                    row["layers"] = len(rec.layer_recs())
                rows.append(row)

            cols = ["change", "name", "external_name", "layers"]

        # Display it

        if full:
            cols += [
                "description",
                "javascript_file",
                "image_url",
                ["for_online_app", "online"],
                ["for_native_app", "native"],
            ]

        tab_fmtr = MywTableFormatter(*cols)

        self.print_lines(tab_fmtr.format(rows, layout))

    def list_application_layers(self, db, name_spec, layout, full, since):
        """
        Helper to list application layers in application matching string NAME_SPEC
        """

        # Get data to display
        rows = []

        if since == None:

            # Show all records
            for app_name in db.config_manager.applicationNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                rec = db.config_manager.applicationRec(app_name)
                for layer in rec.layer_items():
                    row = {}
                    row["app_name"] = rec["name"]
                    row["layer_name"] = layer["name"]
                    row["read_only"] = layer["read_only"]
                    row["snap"] = layer["snap"]
                    rows.append(row)

            cols = ["app_name", "layer_name", "read_only", "snap"]
        else:

            # Show changes
            since_version = db.dataVersionFor(since)

            for app_name, change in list(
                db.configChanges("application", since_version, name_spec).items()
            ):
                row = {"change": change, "app_name": app_name}
                if change != "delete":
                    rec = db.config_manager.applicationRec(app_name)
                    for layer in rec.layer_items():
                        row["layer_name"] = layer["name"]
                        row["read_only"] = layer["read_only"]
                        row["snap"] = layer["snap"]
                        rows.append(row)

            cols = ["app_name", "change", "layer_name", "read_only", "snap"]

        # Display it
        tab_fmtr = MywTableFormatter(*cols)

        self.print_lines(tab_fmtr.format(rows, layout))

    def list_roles(self, db, name_spec, layout, full, since):
        """
        Helper to list roles values matching string NAME_SPEC
        """

        # Get data to display
        rows = []

        if since is None:

            # Show all records
            for layer_name in db.config_manager.roleNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                rows.append(db.config_manager.roleRec(layer_name))
            cols = ["name"]

        else:
            # Show changes
            since_version = db.dataVersionFor(since)

            for role_name, change in list(
                db.configChanges("role", since_version, name_spec).items()
            ):
                row = {"change": change, "name": role_name}
                if change != "delete":
                    rec = db.config_manager.roleRec(role_name)

                    row.update(self._dict_from_rec(rec))

                rows.append(row)
            cols = ["change", "name"]

        # Display it
        if full:
            cols += ["description"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_datasources(self, db, name_spec, layout, full, since):
        """
        Helper to list datasources matching string NAME_SPEC
        """

        # Get data to display
        rows = []
        if since == None:
            base_cols = []

            for datasource_name in db.dd.datasourceNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                rows.append(db.dd.datasourceDef(datasource_name))

        else:
            base_cols = ["change"]
            since_version = db.dataVersionFor(since)

            for (datasource_name, change) in list(
                db.configChanges("datasource", since_version, name_spec).items()
            ):
                row = {"change": change, "name": datasource_name}

                if change != "delete":
                    row.update(db.dd.datasourceDef(datasource_name))

                rows.append(row)

        # Add computed fields
        for datasource_def in rows:
            if datasource_def.get("spec"):
                datasource_def["spec"] = self.format_json(datasource_def.get("spec"))

        # Display it
        cols = base_cols + ["name", "external_name", "type"]
        if full:
            cols += ["description", ["spec", "spec", 100]]

        tab_fmtr = MywTableFormatter(*cols)

        self.print_lines(tab_fmtr.format(rows, layout))

    def list_layers(self, db, name_spec, layout, full, since):
        """
        Helper to list layers matching string NAME_SPEC
        """

        # Get data to display
        rows = []
        if since == None:
            base_cols = ["name"]

            for layer_name in db.config_manager.layerNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                rows.append(db.config_manager.layerDef(layer_name))

        else:
            base_cols = ["change", "name", "display_name"]
            since_version = db.dataVersionFor(since)

            for (layer_name, change) in list(
                db.configChanges("layer", since_version, name_spec).items()
            ):
                row = {"change": change, "name": layer_name}

                if change != "delete":
                    row.update(db.config_manager.layerDef(layer_name))

                rows.append(row)

        # Add computed fields
        for layer_def in rows:

            layer_rec = db.config_manager.layerRec(layer_def["name"])
            if layer_rec:
                layer_def["type"] = layer_rec.type()  # ENH: As opt to get in layerDef()

            if layer_def.get("spec"):
                layer_def["spec"] = self.format_json(layer_def.get("spec"))

            if "feature_types" in layer_def:
                layer_def["features"] = len(layer_def["feature_types"])

            layer_def["scales"] = "{}:{}".format(
                layer_def.get("min_scale", "-"), layer_def.get("max_scale", "-")
            )

        # Display it
        cols = base_cols + ["display_name", "category", "datasource", "type", "code"]
        if full:
            cols += [
                "scales",
                "description",
                ["spec", "spec", 100],
                "transparency",
                ["control_item_class", "class"],
                "features",
            ]

        tab_fmtr = MywTableFormatter(*cols)

        self.print_lines(tab_fmtr.format(rows, layout))  # Wide columns to see more of spec

    def list_layer_groups(self, db, name_spec, layout, full, since):
        """
        Helper to list layer groups values matching string NAME_SPEC
        """

        # Get data to display
        rows = []
        if since == None:
            base_cols = ["name"]

            for name in db.config_manager.layerGroupNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                rec = db.config_manager.layerGroupRec(name)
                rec.layers = len(rec.layerRecs())
                rows.append(db.config_manager.layerGroupRec(name))

        else:
            base_cols = ["change", "name"]
            since_version = db.dataVersionFor(since)

            for (name, change) in list(
                db.configChanges("layer_group", since_version, name_spec).items()
            ):
                row = {"change": change, "name": name}

                if change != "delete":
                    rec = db.config_manager.layerGroupRec(name)
                    row.update(rec.serialise())
                    row["layers"] = len(rec.layerRecs())

                rows.append(row)

        # Display it
        cols = base_cols + ["display_name"]
        if full:
            cols += ["description"]
        cols += ["exclusive", "layers"]

        tab_fmtr = MywTableFormatter(*cols)

        self.print_lines(tab_fmtr.format(rows, layout))

    def list_private_layers(self, db, name_spec, layout, full, since):
        """
        Helper to list private layers with full names matching string FULL_NAME_SPEC

        NAME_SPEC is of the form <owner>:<name>"""

        # Get data to display
        rows = []

        if since == None:
            base_cols = []

            for rec in db.config_manager.privateLayerRecs(
                name_spec, sort=True, warn_if_no_match=True
            ):
                rows.append(self._private_layer_def_for(rec))

        else:
            base_cols = ["change"]
            since_version = db.dataVersionFor(since)

            for (rec_id, change) in list(
                db.configChanges("private_layer", since_version, name_spec).items()
            ):
                (owner, name) = rec_id.split(":")
                row = {"change": change, "owner": owner, "name": name}

                if change != "delete":
                    rec = db.config_manager.privateLayerRec(rec_id)
                    row.update(self._private_layer_def_for(rec))

                rows.append(row)

        # Display it
        cols = base_cols + ["owner", "name", "category", "type", "sharing"]
        if full:
            cols += [
                "scales",
                "description",
                ["spec", "spec", 100],
                ["datasource_spec", "datasource", 100],
                "transparency",
                ["control_item_class", "class"],
            ]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def _private_layer_def_for(self, rec):
        """
        Properties of private layer REC (including computed)
        """
        # ENH: Better on model?

        layer_def = rec.definition()

        layer_def["type"] = rec.type()

        if rec.spec:
            layer_def["spec"] = self.format_json(rec.json_from_db("spec"))

        if rec.datasource_spec:
            layer_def["datasource_spec"] = self.format_json(rec.json_from_db("datasource_spec"))

        layer_def["scales"] = "{}:{}".format(
            layer_def.get("min_scale", "-"), layer_def.get("max_scale", "-")
        )

        return layer_def

    def list_networks(self, db, name_spec, layout, full, since):
        """
        Helper to list networks matching string NAME_SPEC
        """

        # Get data to display
        rows = []
        if since == None:
            base_cols = ["name"]

            for name in db.config_manager.networkNames(name_spec, sort=True, warn_if_no_match=True):
                rows.append(db.config_manager.networkDef(name))

        else:
            base_cols = ["change", "name"]
            since_version = db.dataVersionFor(since)

            for (name, change) in list(
                db.configChanges("network", since_version, name_spec).items()
            ):
                row = {"change": change, "name": name}

                if change != "delete":
                    row.update(db.config_manager.networkDef(name))

                rows.append(row)

        # Add computed fields
        for network_def in rows:

            network_rec = db.config_manager.networkRec(network_def["name"])

            if "feature_types" in network_def:
                network_def["features"] = len(network_def["feature_types"])

        # Display it
        cols = base_cols + ["topology", "directed", "engine", "features"]
        if full:
            cols += ["external_name", "description"]

        tab_fmtr = MywTableFormatter(*cols)

        self.print_lines(tab_fmtr.format(rows, layout))

    def list_users(self, db, name_spec, layout, full):
        """
        Helper to list users with names matching string NAME_SPEC
        """

        # Get data to display
        rows = []
        for name in db.config_manager.userNames(name_spec, sort=True, warn_if_no_match=True):
            rec = db.config_manager.userRec(name)
            rec.n_roles = len(rec.role_names())
            rec.n_bookmarks = rec.bookmark_recs.count()
            rows.append(rec)

        # Display it
        cols = ["username", "email"]
        if full:
            cols += [["n_roles", "roles"], ["n_bookmarks", "bookmarks"], "locked_out"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_bookmarks(self, db, name_spec, layout, full):
        """
        Helper to list bookmarks for users with names matching string NAME_SPEC
        """

        # Get data to display
        rows = []
        for name in db.config_manager.userNames(name_spec, sort=True, warn_if_no_match=True):
            user_rec = db.config_manager.userRec(name)

            for rec in user_rec.bookmark_recs:
                rows.append(rec)

        # Display it
        cols = ["username", ["myw_search_val1", "name"]]
        if full:
            cols += [
                ["lat", "latitude", "{:f}"],
                ["lng", "longitude", "{:f}"],
                "zoom",
                ["map_display", "layers"],
                ["is_private", "private"],
            ]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_groups(self, db, name_spec, layout, full, since):
        """
        Helper to list groups with full names matching string FULL_NAME_SPEC

        NAME_SPEC is of the form <owner>:<group>"""

        # Get data to display
        rows = []

        if since == None:
            base_cols = []

            for group_rec in db.config_manager.groupRecs(
                name_spec, sort=True, warn_if_no_match=True
            ):
                members = group_rec.members  # ENH: Only if full

                row = {
                    "group": group_rec.id,
                    "owner": group_rec.owner,
                    "name": group_rec.name,
                    "description": group_rec.description,
                    "size": len(members),
                    "members": ":".join(sorted(list(members.keys()))),
                }
                rows.append(row)

        else:
            base_cols = ["change"]
            since_version = db.dataVersionFor(since)

            for (rec_id, change) in list(
                db.configChanges("group", since_version, name_spec).items()
            ):
                row = {"change": change, "group": rec_id}

                if change != "delete":
                    group_rec = db.config_manager.groupRec(rec_id)
                    members = group_rec.members

                    row["owner"] = group_rec.owner
                    row["name"] = group_rec.name
                    row["description"] = group_rec.description
                    row["size"] = len(members)
                    row["members"] = ":".join(list(members.keys()))

                rows.append(row)

        # Display it
        cols = base_cols + ["owner", "name", "description", "size"]
        if full:
            cols += ["members"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_settings(self, db, name_spec, layout, full, since):
        """
        Helper to list system settings with names matching string NAME_SPEC
        """

        # Get data to display
        rows = []

        if since == None:
            base_cols = []

            for name in db.settings(name_spec):
                rows.append({"setting": name, "value": db.setting(name)})

        else:
            base_cols = ["change"]
            since_version = db.dataVersionFor(since)

            for (name, change) in list(
                db.configChanges("setting", since_version, name_spec).items()
            ):
                row = {"change": change, "setting": name}

                if change != "delete":
                    row["value"] = db.setting(name)

                rows.append(row)

        rows = sorted(
            rows, key=lambda s: s["setting"]
        )  # should already be sorted but there is a different between OS on lower/uppercase sorting

        # Display it
        cols = base_cols + ["setting", "value"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_notifications(self, db, text_spec, layout, full):
        """
        Helper to list administrator notifications with text matching TEXT_SPEC
        """

        # Get data to display
        rows = []
        for rec in db.config_manager.notifications(text_spec):
            rows.append(rec)

        # Display it
        cols = ["id", "type", "subject"]
        if full:
            cols += ["details", "for_online_app", "for_native_app", "created"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_rights(self, db, name_spec, layout, full):
        """
        Helper to list rights with names matching string NAME_SPEC
        """

        rows = []
        for name in db.rights(name_spec):
            rows.append(db.rightRec(name))

        cols = [["name", "right"], "config"]
        if full:
            cols += ["description"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_versions(self, db, name_spec, layout, full):
        """
        Helper to list versions stamps for components matching string NAME_SPEC
        """

        # Get data to display
        rows = []
        for name in db.versionStamps(name_spec):
            rows.append(db.versionStampRec(name))

        # Display it
        cols = ["component", "version"]
        if full:
            cols += ["date"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_checkpoints(self, db, name_spec, layout, full):
        """
        Helper to list checkpoints with name matching string NAME_SPEC
        """

        # Get data to display
        rows = []
        for name in db.checkpoints(name_spec):
            rows.append(db.checkpointRec(name))

        # Display it
        cols = [["name", "checkpoint"], "version"]
        if full:
            cols += ["date"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_table_sets(self, db, name_spec, layout, full, since):
        """
        Helper to list table sets with name matching string NAME_SPEC
        """

        # Get data to display
        rows = []
        if since == None:
            base_cols = []

            for name in db.config_manager.tableSetNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                rec = db.config_manager.tableSetRec(name)
                rec.name = rec.id
                rec.layers = len(rec.layer_item_recs.all())
                rec.tile_files = len(rec.tile_file_item_recs.all())
                rows.append(rec)

        else:
            base_cols = ["change"]
            since_version = db.dataVersionFor(since)

            for (name, change) in list(
                db.configChanges("table_set", since_version, name_spec).items()
            ):
                row = {"change": change, "name": name}

                if change != "delete":
                    ts_def = db.config_manager.tableSetDef(name)
                    row.update(ts_def)
                    row["layers"] = len(ts_def["layers"])
                    row["tile_files"] = len(ts_def["tile_files"])

                rows.append(row)

        # Display it
        cols = base_cols + ["name", "layers", "tile_files"]
        if full:
            cols += ["description"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_extracts(self, db, name_spec, layout, full):
        """
        Helper to list extract types with name matching string NAME_SPEC
        """

        rep_engine = self.replication_engine(db, "master")

        # Get data to display
        rows = []
        for name in rep_engine.extractTypes(name_spec):
            row = rep_engine.extractDef(name)
            row["hours_ago"] = self.format_time_interval(row["last_export_time"], datetime.utcnow())
            rows.append(row)

        # Display it
        cols = ["name", "region", "table_set", "last_export", "include_deltas"]
        if full:
            cols += ["hours_ago"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_extract_roles(self, db, name_spec, layout, full):
        """
        Helper to list extract types with name matching string NAME_SPEC
        """

        rep_engine = self.replication_engine(db, "master")

        # Get data to display
        rows = []
        for name in rep_engine.extractTypes(name_spec):
            roles = db.extractRoles(name)
            add_me = {"name": name, "roles": ", ".join(roles)}
            rows.append(add_me)

        # Display it
        cols = ["name", "roles"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_replicas(self, db, name_spec, layout, full):
        """
        Helper to list replicas with name matching string NAME_SPEC
        """

        # Assert DB is master
        self.replication_engine(db, "master")

        # Get data to display
        # ENH Warn if none
        time_now = datetime.utcnow()
        rows = []
        for name in db.replicaNames(name_spec):
            rec = db.replicaRec(name)

            rec.last_import_version = rec.last_import()
            rec.last_import_hours_ago = self.format_time_interval(rec.last_import_time(), time_now)
            rec.last_update_hours_ago = self.format_time_interval(rec.last_updated, time_now)

            if rec.last_import_version == 0:
                rec.last_import_version = None

            rows.append(rec)

        # Display it
        # ENH: Show pending updates
        cols = [
            ["id", "replica"],
            "type",
            "status",
            "owner",
            "location",
            ["n_shards", "shards"],
            ["master_update", "last_download"],
            ["last_import_version", "last_upload"],
        ]

        if full:
            cols[-2:2] = [["allocated_ids", "ids"], "registered"]

            cols[-1:-1] = [["last_update_hours_ago", "hours_ago", "{:.1f}"]]

            cols += [["last_import_hours_ago", "hours_ago", "{:.1f}"]]

            cols += ["dropped"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def format_time_interval(self, from_time, to_time):
        """
        Formats a time interval for display
        """

        if (from_time) == None or (to_time == None):
            return None

        interval = to_time - from_time

        hours = interval.total_seconds() / 3600

        return round(hours, 2)

    def list_sequences(self, db, name_spec, layout, full):
        """
        Helper to list sequences for tables matching NAME_SPEC
        """

        # ENH: Expose reflection on DB via schema object?
        db_driver = db.session.myw_db_driver

        # Get data to display
        rows = []
        for (schema, table_name) in self.tableSpecsMatching(db, name_spec):

            table_desc = db_driver.tableDescriptorFor(schema, table_name)

            for column_name, column_desc in list(table_desc.columns.items()):
                if column_desc.generator == "sequence":
                    seq_name = "{}.{}".format(table_name, column_name)
                    seq_next = db_driver.sequenceValue(schema, table_name, column_name)
                    seq_range = db_driver.sequenceRange(schema, table_name, column_name)

                    row = {
                        "name": seq_name,
                        "next": seq_next,
                        "min": seq_range[0],
                        "max": seq_range[1],
                    }

                    rows.append(row)

        # Display it
        cols = ["name", "next"]
        if full:
            cols += ["min", "max"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_schema(self, db, name_spec, layout, full):
        """
        Helper to list schema of tables matching NAME_SPEC
        """

        # ENH: Expose reflection on DB via schema object?
        db_driver = db.session.myw_db_driver

        # Show tables
        for (schema, table_name) in self.tableSpecsMatching(db, name_spec):
            print()

            table_desc = db_driver.tableDescriptorFor(schema, table_name)

            # Show fields
            rows = list(table_desc.columns.values())
            tab_fmtr = MywTableFormatter(
                ["table_name", "table"],
                ["name", "field"],
                ["db_type", "type"],
                "key",
                "default",
                "generator",
                "nullable",
            )

            self.print_lines(tab_fmtr.format(rows, layout))

            # Leave a gap, if necessary # ENH: Find a neater way
            if layout == "columns":
                print()

            # Show indexes
            rows = table_desc.indexes
            tab_fmtr = MywTableFormatter(
                ["table_name", "table"],
                ["db_name", "index"],
                ["column_names_str", "fields"],
                "unique",
                "type",
                ["db_options", "options"],
            )

            self.print_lines(tab_fmtr.format(rows, layout))

            # Leave a gap, if necessary # ENH: Find a neater way
            if layout == "columns":
                print()

            # Show constraints
            rows = table_desc.constraints
            tab_fmtr = MywTableFormatter(
                ["table_name", "table"],
                ["db_name", "constraint"],
                "type",
                ["field_names", "fields"],
                ["db_defn", "description"],
            )

            self.print_lines(tab_fmtr.format(rows, layout))

            if not full:
                continue

            # Leave a gap, if necessary # ENH: Find a neater way
            if layout == "columns":
                print()

            # Show triggers
            rows = []
            for trigger_name, defn in list(db_driver.sortedTriggersFor(schema, table_name).items()):
                for line in defn[
                    "body"
                ].splitlines():  # ENH: Support multiline values in MywTableFormatter
                    row = {
                        "table": table_name,
                        "trigger": trigger_name,
                        "type": defn["type"],
                        "body": line + " ",
                    }

                    rows.append(row)

            tab_fmtr = MywTableFormatter("table", "trigger", "type", "body")
            self.print_lines(tab_fmtr.format(rows, layout, max_val_len=500))
            print()

    def list_schema_sql(self, db, name_spec, layout, full):
        """
        Helper to list creation SQL of tables matching NAME_SPEC
        """

        # ENH: Expose reflection on DB via schema object?
        db_driver = db.session.myw_db_driver

        # Show tables
        for (schema, table_name) in self.tableSpecsMatching(db, name_spec):

            sql = db_driver.tableSqlFor(schema, table_name, full)
            rows = []
            for line in sql.splitlines():
                row = {"table": table_name, "sql": line}
                rows.append(row)

            tab_fmtr = MywTableFormatter("table", "sql")
            self.print_lines(tab_fmtr.format(rows, layout, max_val_len=500))
            print()

    def list_usage(self, db, name_spec, layout, by, start, end, full):
        """
        Helper to list usage statistics
        """
        # ENH: Provide an easy way to see last 7 days etc

        from myworldapp.core.server.database.myw_usage_stats_manager import MywUsageStatsManager

        # Set time format of output
        datetime_format = "%Y-%m-%d %H:%M" if by == "hour" else "%Y-%m-%d"

        # Parse string args
        start = self.as_datetime(start)
        end = self.as_datetime(end)

        # Get data to display
        stats_manager = MywUsageStatsManager()

        if by == "session":
            rows = stats_manager.usageBySession(name_spec, start, end)
            columns = ["user", "start_time", "end_time"]

        elif by == "licence":
            rows = []
            for licence, users in list(stats_manager.usageByLicence(name_spec, start, end).items()):

                row = {
                    "licence": licence,
                    "users": len(users),
                    "usernames": ":".join(sorted(users)),
                }

                rows.append(row)

            columns = ["licence", "users"]
            if full:
                columns += ["usernames"]

        elif by == "action":
            rows = []
            stats = stats_manager.usageByAction(name_spec, start, end)
            for action in sorted(stats):
                stat = stats[action]
                users = stat["users"]

                row = {
                    "action": action,
                    "count": stat["count"],
                    "users": len(users),
                    "usernames": ":".join(sorted(users)),
                }

                rows.append(row)

            columns = ["action", "count", "users"]
            if full:
                columns += ["usernames"]

        elif by == "application":
            applications = db.config_manager.applicationNames(name_spec, include_config=False)

            rows = []
            stats = stats_manager.usageByApplication(applications, start, end)
            for application in sorted(stats):
                users = stats[application]

                row = {
                    "application": application,
                    "users": len(users),
                    "usernames": ":".join(sorted(users)),
                }

                rows.append(row)

            columns = ["application", "users"]
            if full:
                columns += ["usernames"]

        elif by == "layer":
            layers = db.config_manager.layerNames(name_spec)

            rows = []
            stats = stats_manager.usageByLayer(layers, start, end)
            for layer in sorted(stats):
                users = stats[layer]

                row = {"layer": layer, "users": len(users), "usernames": ":".join(sorted(users))}

                rows.append(row)

            columns = ["layer", "users"]
            if full:
                columns += ["usernames"]

        elif by == "user":
            rows = []
            stats = stats_manager.usageByUser(name_spec, start, end)
            for user in sorted(stats):
                row = {"user": user, "sessions": stats[user]}
                rows.append(row)

            columns = ["user", "sessions"]

        else:  # by time period
            rows = []
            for row in stats_manager.usageProfile(by, start=start, end=end):
                row["start"] = datetime.strftime(row["period_start"], datetime_format)
                row["end"] = datetime.strftime(
                    row["period_end"] - timedelta(seconds=1), datetime_format
                )
                row["usernames"] = ":".join(sorted(row["users"]))
                row["users"] = len(row["users"])
                rows.append(row)

            columns = ["start", "end", "users"]
            if full:
                columns += ["sessions", "usernames"]

        # Display it
        tab_fmtr = MywTableFormatter(*columns)

        self.print_lines(tab_fmtr.format(rows, layout, max_val_len=500))

    def as_datetime(self, value_str):
        """
        Convert string STR to a datetime value (raising conversion errors as MywError)

        FORMAT is a datetime format"""

        # ENH: Accept more formats

        if not value_str:
            return None

        if ":" in value_str:
            format = "%Y-%m-%d %H:%M"
        else:
            format = "%Y-%m-%d"

        try:
            return datetime.strptime(value_str, format)
        except ValueError as cond:
            raise MywError(str(cond))

    # ==============================================================================
    #                                 OPERATION LOAD
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "load", help="Load enumerators, feature definitions and data"
    )
    op_def.add_argument(
        "files", type=str, nargs="+", help="Data or configuration file to load (can be wildcard)"
    )
    op_def.add_argument(
        "--as",
        type=str,
        dest="load_as",
        metavar="NAME",
        help="New name to be used when loading data",
    )
    op_def.add_argument("--encoding", type=str, default="utf-8", help="File encoding")
    op_def.add_argument("--reload", action="store_true", help="Drop existing data before loading")
    op_def.add_argument(
        "--update", action="store_true", help="Update existing data with changes in loaded file"
    )
    op_def.add_argument("--force", action="store_true", help="Reload even if in use")
    op_def.add_argument(
        "--date_format",
        type=str,
        metavar="FORMAT",
        default="YYYY-MM-DD",
        help="Date format in file",
    )
    op_def.add_argument(
        "--time_format",
        type=str,
        metavar="FORMAT",
        default="HH:MI:SS.FF",
        help="Time format in file",
    )
    op_def.add_argument(
        "--coord_system",
        type=str,
        metavar="NAME",
        help="Coordinate system of file (epsg name, or proj pipeline transform string)",
    )
    op_def.add_argument(
        "--autocreate",
        action="store_true",
        help="Create feature definitions based on data shape (if necessary)",
    )
    op_def.add_argument(
        "--key", type=str, metavar="FIELD", help="Field to use as key (when autocreating)"
    )
    op_def.add_argument(
        "--build_geoms",
        action="store_true",
        help="Use heuristics to build geometries from record attributes",
    )
    op_def.add_argument(
        "--delta", type=str, default="", help="Load data into this database version"
    )
    op_def.add_argument(
        "--update_sequence", action="store_true", help="Update feature ID generator high-water-mark"
    )
    op_def.add_argument(
        "--direct", action="store_true", help="Use native database feature loader (for speed)"
    )
    _add_standard_args(op_def)

    def operation_load(self):
        """
        Load feature definition, features etc from file
        """

        # Open database
        db = self.db_server.open(self.args.db_name)

        # For each file spec ...
        for file_spec in self.args.files:

            # Find files to process
            file_spec = str(file_spec)  # Forces glob to return unicode names # ENH: Use os_engine
            file_paths = sorted(glob.glob(file_spec))

            # Check for nothing matched
            if not file_paths:
                self.progress("warning", "File not found:", file_spec)

            # For each file .. load it
            n_files = 0
            for file_path in file_paths:
                self.load_file(db, file_path)

        # ENH: Return a status code

    def load_file(self, db, file_path):
        """
        Helper to load a file (handling errors)

        Returns True if file loaded"""

        msg = ""
        n_processed = None
        ok = False

        # Unpick args
        coord_sys = None
        try:
            if self.args.coord_system:
                try:
                    coord_sys = MywCoordSystem(self.args.coord_system)
                except MywCoordSystemError:
                    coord_sys = MywCoordTransform(self.args.coord_system)

        except MywProjFileMissingError as e:
            raise MywError(
                f"Pyproj couldn't find the projection file you requested. Try installing it at {e.path}"
            )

        # Load file
        self.progress("starting", "Loading file", file_path, "...")
        try:
            (n_processed, msg) = db.data_loader.loadFile(
                file_path,
                reload=self.args.reload,
                rename=self.args.load_as,
                update=self.args.update,
                force=self.args.force,
                file_encoding=self.args.encoding,
                date_format=self.args.date_format,
                timestamp_format=self.args.date_format + "T" + self.args.time_format,
                coord_sys=coord_sys,
                autocreate=self.args.autocreate,
                key_field=self.args.key,
                geom_heuristics=self.args.build_geoms,
                delta=self.args.delta,
                update_sequence=self.args.update_sequence,
                direct=self.args.direct,
            )

            ok = True

        except MywError as cond:
            self.progress("error", str(cond))

        finally:
            db.commit(ok)
            self.progress("finished", msg, records=n_processed)

        return ok

    # ==============================================================================
    #                              OPERATION IMPORT
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "import", help="Import information from an external datasource"
    )
    op_def.add_argument(
        "what", type=str, choices=["features"], help="Type of information to import"
    )
    op_def.add_argument(
        "feature_type", type=str, help="Feature type to import data for (can be wildcard)"
    )
    _add_standard_args(op_def)

    def operation_import(self):
        """
        Set feature properties
        """

        db = self.db_server.open(self.args.db_name)

        # Handle defaults
        name_spec = self.args.feature_type
        if not "/" in name_spec:
            name_spec += "/*"

        # Split args
        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

        # For each datasource ..
        for datasource in db.dd.datasourceNames(datasource_spec, sort=True, warn_if_no_match=True):

            # Get import engine
            ds_rec = db.dd.datasourceRec(datasource, error_if_none=True)
            ds_engine = ds_rec.engine(progress=self.progress)

            if not ds_engine:
                self.progress(3, "Datasource does not support import:", ds_rec.name)
                continue

            with self.progress.operation("Importing features for:", ds_rec.name):
                try:
                    self.import_features(db, ds_rec, ds_engine, feature_type_spec)
                except MywError as cond:
                    self.progress("error", cond)

    def import_features(self, db, ds_rec, ds_engine, feature_type_spec):
        """
        Import features from datasource DS_REC (handling errors
        """

        # For each matching feature type on remote server .. import it
        for feature_type in ds_engine.feature_types(feature_type_spec):

            with self.progress.operation(
                "Importing feature definition:", ds_rec.name + "/" + feature_type
            ):

                try:
                    ds_rec.importFeatureType(db.dd, feature_type, ds_engine)
                    db.commit()

                except MywError as cond:
                    self.progress("error", cond)

    # ==============================================================================
    #                              OPERATION CONFIGURE
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "configure", help="Configure feature properties")
    op_def.add_argument("feature_type", type=str, help="Feature type to modify (can be wildcard)")
    op_def.add_argument(
        "--external_name", type=str, help="String used to identify feature type in GUI"
    )
    op_def.add_argument("--title", type=str, help="Expression used to build myw_title field")
    op_def.add_argument(
        "--short_description", type=str, help="Expression used to build myw_short_description field"
    )
    op_def.add_argument(
        "--track_changes",
        type=str,
        choices=["true", "false"],
        help="Determines if updates are tracked",
    )
    op_def.add_argument(
        "--versioned",
        type=str,
        choices=["true", "false"],
        help="Determines if deltas are supported",
    )
    op_def.add_argument(
        "--editable",
        type=str,
        choices=["true", "false"],
        help="Determines if object can be modified",
    )
    op_def.add_argument(
        "--geom_indexed",
        type=str,
        choices=["true", "false"],
        help="Determines if geometry indexes are created",
    )
    _add_standard_args(op_def)

    def operation_configure(self):
        """
        Set feature properties
        """

        db = self.db_server.open(self.args.db_name)

        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(self.args.feature_type)

        # Build config options
        props = {}
        if self.args.external_name != None:
            props["external_name"] = self.args.external_name
        if self.args.title != None:
            props["title"] = self.args.title
        if self.args.short_description != None:
            props["short_description"] = self.args.short_description
        if self.args.track_changes != None:
            props["track_changes"] = self.args.track_changes == "true"
        if self.args.versioned != None:
            props["versioned"] = self.args.versioned == "true"
        if self.args.editable != None:
            props["editable"] = self.args.editable == "true"
        if self.args.geom_indexed != None:
            props["geom_indexed"] = self.args.geom_indexed == "true"

        # Apply them
        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):

            with self.progress.operation("Configuring", feature_rec):
                feature_desc = db.dd.featureTypeDescriptor(feature_rec)
                feature_desc.update(props)
                db.dd.alterFeatureType(feature_rec, feature_desc)

        db.commit()

    # ==============================================================================
    #                                OPERATION ADD
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "add", help="Add a search or query")
    op_def.add_argument(
        "what",
        type=str,
        choices=["search", "query", "application_layer", "notification"],
        help="Type of item to add",
    )
    op_def.add_argument("args", type=str, nargs="*", help="Definition of item (depends on type)")
    op_def.add_argument(
        "--lang", type=str, help="Set language of search or query"
    )  # ENH: Move this to search,query args defn
    op_def.add_argument(
        "--read_only", action="store_true", help="Set application_layer to read only"
    )  # ENH: Move this to application_layer args defn
    op_def.add_argument(
        "--snap", action="store_true", help="Set application_layer to snap"
    )  # ENH: Move this to application_layer args defn
    _add_standard_args(op_def)

    add_op_defs = {}

    add_op_defs["search"] = op_def = argparse.ArgumentParser(
        prog="add search", formatter_class=MywArgparseHelpFormatter
    )
    op_def.add_argument(
        "feature_type", type=str, help="Feature type to add item too (can be wildcard)"
    )
    op_def.add_argument("value", type=str, help="Matched value (myWorld expression)")
    op_def.add_argument("description", type=str, help="Dsiplay value (myWorld expression)")

    add_op_defs["query"] = op_def = argparse.ArgumentParser(
        prog="add query", formatter_class=MywArgparseHelpFormatter
    )
    op_def.add_argument(
        "feature_type", type=str, help="Feature type to add item too (can be wildcard)"
    )
    op_def.add_argument("value", type=str, help="Matched value (myWorld expression)")
    op_def.add_argument("description", type=str, help="Display value (myWorld expression)")
    op_def.add_argument("filter", type=str, nargs="?", default="", help="Filter (myWorld filter)")

    add_op_defs["application_layer"] = op_def = argparse.ArgumentParser(
        prog="add application_layer", formatter_class=MywArgparseHelpFormatter
    )
    op_def.add_argument(
        "application", type=str, help="Application to add layer too (can be wildcard)"
    )
    op_def.add_argument("layer", type=str, help="Layer to add (can be wildcard)")

    add_op_defs["notification"] = op_def = argparse.ArgumentParser(
        prog="add notification", formatter_class=MywArgparseHelpFormatter
    )
    op_def.add_argument("type", type=str, choices=["alert", "info", "tip"], help="Message type")
    op_def.add_argument("subject", type=str, help="Message subject")
    op_def.add_argument("details", type=str, nargs="?", default="", help="Message body")
    op_def.add_argument(
        "users",
        type=str,
        choices=["all", "online", "native"],
        nargs="?",
        default="all",
        help="Target user group",
    )

    def operation_add(self):
        """
        Add a search rule, query, etc
        """

        # Parse sub-op args
        # ENH: Find a way to do include sub-ops in primary arg def
        arg_parser = self.add_op_defs[self.args.what]
        op_args = arg_parser.parse_args(self.args.args)

        # Open database
        db = self.db_server.open(self.args.db_name)

        # Do operation
        if self.args.what == "search":
            self.add_search(
                db, op_args.feature_type, op_args.value, op_args.description, self.args.lang
            )
        elif self.args.what == "query":
            self.add_query(
                db,
                op_args.feature_type,
                op_args.value,
                op_args.description,
                op_args.filter,
                self.args.lang,
            )
        elif self.args.what == "application_layer":
            self.add_application_layer(
                db, op_args.application, op_args.layer, self.args.read_only, self.args.snap
            )
        elif self.args.what == "notification":
            self.add_notification(db, op_args.type, op_args.subject, op_args.details, op_args.users)

        db.commit()

    def add_search(self, db, name_spec, value, description, lang=None):
        """
        Add a search rule to NAME_SPEC
        """

        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):

            with self.progress.operation("Adding search to", feature_rec):
                feature_desc = db.dd.featureTypeDescriptor(feature_rec)
                feature_desc.addSearch(value, description, lang)
                db.dd.alterFeatureType(feature_rec, feature_desc)

    def add_query(self, db, name_spec, value, description, filter, lang=None):
        """
        Add a query to NAME_SPEC
        """

        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):

            with self.progress.operation("Adding query to", feature_rec):
                feature_desc = db.dd.featureTypeDescriptor(feature_rec)
                feature_desc.addQuery(value, description, filter, lang)
                db.dd.alterFeatureType(feature_rec, feature_desc)

    def add_application_layer(
        self, db, application_name_spec, layer_name_spec, read_only=False, snap=False
    ):
        """
        Add layer to application (if not already present)
        """

        application_names = db.config_manager.applicationNames(
            application_name_spec, include_config=False, sort=True, warn_if_no_match=True
        )
        layer_names = db.config_manager.layerNames(
            layer_name_spec, sort=True, warn_if_no_match=True
        )

        for application_name in application_names:
            application_rec = db.config_manager.applicationRec(application_name)

            layer_items = application_rec.layer_items()
            original_app_layer_names = [layer_item["name"] for layer_item in layer_items]

            for layer_name in layer_names:
                if not layer_name in original_app_layer_names:
                    self.progress(
                        1,
                        "Adding layer to application:",
                        application_name,
                        ":",
                        layer_name,
                        "with read_only:",
                        read_only,
                        "and snap:",
                        snap,
                    )
                    # Add app layer, respecting formatting
                    to_add = {"name": layer_name}
                    if read_only == True or snap == True:
                        if read_only == True:
                            to_add["read_only"] = True
                        if snap == True:
                            to_add["snap"] = True
                        layer_items.append(to_add)
                    else:
                        layer_items.append(layer_name)
                else:
                    self.progress(
                        1,
                        "Warning: application layer:",
                        layer_name,
                        "already exists on",
                        application_name,
                    )

            application_rec.set_layers(layer_items)

    def add_notification(self, db, type, subject, details, user_group):
        """
        Add an administrator notification
        """

        for_online_app = user_group in ["online", "all"]
        for_native_app = user_group in ["native", "all"]

        db.config_manager.createNotification(type, subject, details, for_online_app, for_native_app)

    # ==============================================================================
    #                                 OPERATION DUMP
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "dump", help="Output data or metadata to file")
    op_def.add_argument("output_dir", type=str, help="Directory to create files in")
    op_def.add_argument(
        "what",
        type=str,
        choices=[
            "data",
            "deltas",
            "features",
            "enums",
            "layers",
            "layer_groups",
            "localisation",
            "private_layers",
            "networks",
            "datasources",
            "applications",
            "roles",
            "users",
            "groups",
            "table_sets",
            "settings",
        ],
        help="Type of information to dump",
    )
    op_def.add_argument("names", type=str, nargs="?", default="*", help="Name of item(s) to dump")
    op_def.add_argument(
        "--since",
        type=str,
        metavar="CHECKPOINT",
        help="Output only those items changed since this checkpoint",
    )
    op_def.add_argument(
        "--delta", type=str, default="", help="Show records in this database version"
    )
    op_def.add_argument("--encoding", type=str, default="utf-8", help="File encoding")
    op_def.add_argument(
        "--format",
        type=str,
        default="csv(ewkb)",
        help="Format for 'data' files, with optional modifiers",
    )
    op_def.add_argument(
        "--fields", type=str, nargs="+", metavar="NAME", help="Fields to include in data"
    )
    op_def.add_argument(
        "--exclude_fields", type=str, nargs="+", metavar="NAME", help="Fields to exclude from data"
    )
    op_def.add_argument(
        "--area", type=str, help="Geographic region to dump (lon1,lat1):(lon2,lat2)"
    )
    op_def.add_argument(
        "--coord_system",
        type=str,
        metavar="NAME",
        default="epsg:4326",
        help="Coordinate system to output data in",
    )
    op_def.add_argument(
        "--date_format",
        type=str,
        metavar="FORMAT",
        default="YYYY-MM-DD",
        help="Output format for date values",
    )
    op_def.add_argument(
        "--time_format",
        type=str,
        metavar="FORMAT",
        default="HH:MI:SS.FF",
        help="Output format for time values",
    )
    op_def.add_argument(
        "--records_per_file",
        type=int,
        default=10000,
        metavar="N",
        help="Start new output file after N records",
    )
    op_def.add_argument(
        "--checkpoint", type=str, metavar="NAME", help="Checkpoint to create in database (atomic)"
    )
    op_def.add_argument("--lang", type=str, help="Language to dump")

    _add_standard_args(op_def)

    def operation_dump(self):
        """
        Dump feature data to file
        """
        # Assumes no other 'large' transactions (dumps or loads) are taking place.
        # ENH: Start a PostgreSQL transaction (to freeze DB view)

        db = self.db_server.open(self.args.db_name)

        # Get location to dump them
        output_dir = self.args.output_dir

        # Get requested output coordinate system
        coord_sys = MywCoordSystem(self.args.coord_system)

        # Determine what to export
        region_geom = self.parse_polygon_arg("area", self.args.area)

        if self.args.since:
            since_version = db.dataVersionFor(self.args.since)
            self.progress(1, "Dumping changes since data version", since_version, "...")
        else:
            since_version = None

        # Output requested info
        if self.args.what == "data":
            self.dump_data(
                output_dir,
                db,
                self.args.names,
                self.args.encoding,
                self.args.format,
                self.args.date_format,
                self.args.time_format,
                coord_sys,
                since_version,
                self.args.delta,
                region_geom,
                self.args.records_per_file,
                self.args.fields,
                self.args.exclude_fields,
            )

        elif self.args.what == "deltas":
            self.dump_deltas(
                output_dir, db, self.args.names, region_geom, self.args.encoding, since_version
            )
        elif self.args.what == "features":
            self.dump_feature_types(
                output_dir, db, self.args.names, self.args.encoding, since_version
            )
        elif self.args.what == "enums":
            self.dump_enums(output_dir, db, self.args.names, self.args.encoding, since_version)
        elif self.args.what == "layers":
            self.dump_layers(output_dir, db, self.args.names, self.args.encoding, since_version)
        elif self.args.what == "layer_groups":
            self.dump_layer_groups(
                output_dir, db, self.args.names, self.args.encoding, since_version
            )
        elif self.args.what == "localisation":
            self.dump_localisation(output_dir, db, self.args.encoding, self.args.lang)
        elif self.args.what == "private_layers":
            self.dump_private_layers(
                output_dir, db, self.args.names, self.args.encoding, since_version
            )
        elif self.args.what == "networks":
            self.dump_networks(output_dir, db, self.args.names, self.args.encoding, since_version)
        elif self.args.what == "datasources":
            self.dump_datasources(
                output_dir, db, self.args.names, self.args.encoding, since_version
            )
        elif self.args.what == "applications":
            self.dump_applications(
                output_dir, db, self.args.names, self.args.encoding, since_version
            )
        elif self.args.what == "roles":
            self.dump_roles(output_dir, db, self.args.names, self.args.encoding, since_version)
        elif self.args.what == "users":
            self.dump_users(output_dir, db, self.args.names, self.args.encoding, since_version)
        elif self.args.what == "groups":
            self.dump_groups(output_dir, db, self.args.names, self.args.encoding, since_version)
        elif self.args.what == "table_sets":
            self.dump_table_sets(output_dir, db, self.args.names, self.args.encoding, since_version)
        elif self.args.what == "settings":
            self.dump_settings(output_dir, db, self.args.names, self.args.encoding, since_version)

        else:
            raise Exception("Bad choice: " + self.args.what)  # Should never happen

        # Mark the dumped version (for use as a baseline later)
        if self.args.checkpoint:
            version = db.setCheckpoint(self.args.checkpoint)
            self.progress(1, "Set checkpoint", self.args.checkpoint, "at version", version)
            db.commit()

    def dump_data(
        self,
        output_dir,
        db,
        feature_type_spec,
        file_encoding,
        file_format,
        date_format,
        time_format,
        coord_sys,
        since_version,
        delta,
        region_geom,
        max_recs_per_file,
        fields,
        exclude_fields,
    ):
        """
        Output data for FEATURE_TYPE_SPEC to OUTPUT_DIR
        """

        # Strip options from file_format arg
        # ENH: Push this down into stream classes
        match = re.match(r"(\w+)\((\w+)\)$", file_format)
        if match:
            file_format = match.group(1)
            options = match.group(2).split(",")
        else:
            options = []

        # Build options specifier
        file_options = {}
        if "compact" in options:
            file_options["compact"] = True
        if "wkb" in options:
            file_options["geom_encoding"] = "wkb"
        if "ewkb" in options:
            file_options["geom_encoding"] = "ewkb"
        if "wkt" in options:
            file_options["geom_encoding"] = "wkt"
        if "ewkt" in options:
            file_options["geom_encoding"] = "ewkt"
        # ENH: Check for unknown geom_encoding

        file_options["date_format"] = date_format
        file_options["timestamp_format"] = date_format + "T" + time_format
        file_options["coord_sys"] = coord_sys

        # Determine fields to dump
        data_options = {}
        if self.args.fields:
            file_options["include_fields"] = fields
        if self.args.exclude_fields:
            file_options["exclude_fields"] = exclude_fields

        # Handle deltas
        versioned_only = bool(delta)

        # For each feature type .. dump data
        for feature_type in db.dd.featureTypes(
            "myworld",
            feature_type_spec,
            versioned_only=versioned_only,
            sort=True,
            warn_if_no_match=True,
        ):
            pred = self.geomFilterFor(db, feature_type, region_geom)

            # Case: Full dump
            if since_version == None and not delta:  # ENH: Support full dump from delta?

                with self.progress.operation("Feature", feature_type, "...") as stats:
                    stats["records"] = db.data_loader.dumpFeatures(
                        output_dir,
                        feature_type,
                        pred=pred,
                        file_encoding=file_encoding,
                        file_format=file_format,
                        file_options=file_options,
                        max_recs_per_file=max_recs_per_file,
                    )

            # Case: Incremental dump
            else:
                if delta:  # ENH: handle --since and --delta set
                    db_view = db.view(delta)
                    changes = db_view[feature_type].featureChanges()
                else:
                    changes = db.featureChanges(feature_type, since_version)

                if changes:
                    with self.progress.operation("Feature", feature_type, "...") as stats:
                        stats["records"] = db.data_loader.dumpFeatureChanges(
                            output_dir,
                            feature_type,
                            changes,
                            delta=delta,
                            pred=pred,
                            file_encoding=file_encoding,
                            file_format=file_format,
                            file_options=file_options,
                            max_recs_per_file=max_recs_per_file,
                        )

    def dump_deltas(self, output_dir, db, name_spec, region_geom, file_encoding, since_version):
        """
        Output .delta files for deltas NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing deltas", "...")

        # For each feature type .. dump delta and base records
        for feature_type in db.dd.featureTypes("myworld", versioned_only=True, sort=True):
            pred = self.geomFilterFor(db, feature_type, region_geom)

            # Case: Full dump
            if since_version == None:
                n_recs = db.data_loader.dumpDeltas(
                    output_dir, feature_type, name_spec, pred=pred, file_encoding=file_encoding
                )
                self.progress(2, "Wrote", n_recs, "records")

            # Case: Incremental dump
            else:
                delta_changes = db.deltaChanges(
                    feature_type, since_version, schema="delta"
                )  # ENH: Include name_spec
                base_changes = db.deltaChanges(
                    feature_type, since_version, schema="base"
                )  # ENH: Include name_spec

                if delta_changes or base_changes:
                    n_recs = db.data_loader.dumpDeltaChanges(
                        output_dir,
                        feature_type,
                        delta_changes,
                        base_changes,
                        pred=pred,
                        file_encoding=file_encoding,
                    )
                    self.progress(2, "Wrote", n_recs, "records")

    def dump_feature_types(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .def files for FEATURE_TYPE_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing feature definitions", "...")

        # Case: Full dump
        if since_version == None:

            (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

            n_done = 0
            for feature_rec in db.dd.featureTypeRecs(
                datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
            ):
                db.data_loader.dumpFeatureType(output_dir, feature_rec, file_encoding=file_encoding)
                n_done += 1

        # Case: Incremental dump
        else:
            changes = db.configChanges("dd_feature", since_version, name_spec)

            n_done = db.data_loader.dumpFeatureTypeChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_enums(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .enum file for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing enumerator definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for enum_name in db.dd.enumeratorNames(name_spec, sort=True, warn_if_no_match=True):
                db.data_loader.dumpEnumerator(output_dir, enum_name, file_encoding=file_encoding)
                n_done += 1

        # Case: Incremental dump
        else:
            changes = db.configChanges("dd_enum", since_version, name_spec)

            n_done = db.data_loader.dumpEnumeratorChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_layers(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .layer files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing layer definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for layer_name in db.config_manager.layerNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                db.data_loader.dumpLayerDefinition(
                    output_dir, layer_name, file_encoding=file_encoding
                )
                n_done += 1

        # Case: Incremental dump
        else:
            changes = db.configChanges("layer", since_version, name_spec)

            n_done = db.data_loader.dumpLayerChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_layer_groups(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .layer_group files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing layer group definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for layer_name in db.config_manager.layerGroupNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                db.data_loader.dumpLayerGroupDefinition(
                    output_dir, layer_name, file_encoding=file_encoding
                )
                n_done += 1

        # Case: Incremental dump
        else:
            changes = db.configChanges("layer_group", since_version, name_spec)

            n_done = db.data_loader.dumpLayerGroupChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_localisation(self, output_dir, db, file_encoding, language=None):
        """
        Output .localisation files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing localisation definitions", "...")

        db.data_loader.dumpLocalisation(output_dir, file_encoding, language)

    def dump_private_layers(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .private_layer files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing private_layer definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for rec in db.config_manager.privateLayerRecs(
                name_spec, sort=True, warn_if_no_match=True
            ):
                db.data_loader.dumpPrivateLayer(output_dir, rec, file_encoding=file_encoding)
                n_done += 1

        # Case: Incremental Dump
        else:
            changes = db.configChanges("private_layer", since_version, name_spec)

            n_done = db.data_loader.dumpPrivateLayerChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_networks(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .network files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing network definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for network_name in db.config_manager.networkNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                db.data_loader.dumpNetworkDefinition(
                    output_dir, network_name, file_encoding=file_encoding
                )
                n_done += 1

        # Case: Incremental dump
        else:
            changes = db.configChanges("network", since_version, name_spec)

            n_done = db.data_loader.dumpNetworkChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_datasources(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .datasource files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing datasource definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for datasource_name in db.dd.datasourceNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                db.data_loader.dumpDatasourceDefinition(
                    output_dir, datasource_name, file_encoding=file_encoding
                )
                n_done += 1

        # Case: Incremental dump
        else:
            changes = db.configChanges("datasource", since_version, name_spec)

            n_done = db.data_loader.dumpDatasourceChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_applications(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .application files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing application definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for application_name in db.config_manager.applicationNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                db.data_loader.dumpApplication(
                    output_dir, application_name, file_encoding=file_encoding
                )
                n_done += 1

        # Case: Incremental dump
        else:
            changes = db.configChanges("application", since_version, name_spec)

            n_done = db.data_loader.dumpApplicationChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_roles(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .role files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing role definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for role in db.config_manager.roleNames(name_spec, sort=True, warn_if_no_match=True):
                db.data_loader.dumpRole(output_dir, role, file_encoding=file_encoding)
                n_done += 1

        # Case: Incremental Dump
        else:
            changes = db.configChanges("role", since_version, name_spec)

            n_done = db.data_loader.dumpRoleChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_users(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .user files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing user definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for user in db.config_manager.userNames(name_spec, sort=True, warn_if_no_match=True):
                db.data_loader.dumpUser(output_dir, user, file_encoding=file_encoding)
                n_done += 1

        # Case: Incremental Dump
        else:
            raise MywError("Cannot perform incremental dump. Table is not change tracked.")

        self.progress("finished", records=n_done)

    def dump_groups(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .group files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing group definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for group_rec in db.config_manager.groupRecs(
                name_spec, sort=True, warn_if_no_match=True
            ):
                db.data_loader.dumpGroup(output_dir, group_rec, file_encoding=file_encoding)
                n_done += 1

        # Case: Incremental Dump
        else:
            changes = db.configChanges("group", since_version, name_spec)

            n_done = db.data_loader.dumpGroupChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_table_sets(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .table_set files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing table set definitions", "...")

        # Case: Full dump
        if since_version == None:

            n_done = 0
            for name in db.config_manager.tableSetNames(
                name_spec, sort=True, warn_if_no_match=True
            ):
                db.data_loader.dumpTableSet(output_dir, name, file_encoding=file_encoding)
                n_done += 1

        # Case: Incremental Dump
        else:
            changes = db.configChanges("table_set", since_version, name_spec)

            n_done = db.data_loader.dumpTableSetChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    def dump_settings(self, output_dir, db, name_spec, file_encoding, since_version):
        """
        Output .settings files for NAME_SPEC to OUTPUT_DIR
        """

        self.progress("starting", "Writing settings", "...")

        # Case: Full dump
        if since_version == None:
            n_done = db.data_loader.dumpSettings(output_dir, name_spec, file_encoding=file_encoding)

        # Case: Incremental Dump
        else:
            changes = db.configChanges("setting", since_version, name_spec)

            n_done = db.data_loader.dumpSettingChanges(
                output_dir, changes, file_encoding=file_encoding
            )

        self.progress("finished", records=n_done)

    # ==============================================================================
    #                                 OPERATION DROP
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "drop", help="Delete data or meta-data")
    op_def.add_argument(
        "what",
        type=str,
        choices=[
            "data",
            "features",
            "searches",
            "queries",
            "enums",
            "layers",
            "layer_groups",
            "private_layers",
            "networks",
            "datasources",
            "applications",
            "roles",
            "users",
            "groups",
            "settings",
            "notifications",
            "application_layers",
            "checkpoints",
            "table_sets",
            "extracts",
            "replicas",
            "deltas",
        ],
        help="Type of object to drop",
    )
    op_def.add_argument(
        "args",
        type=str,
        nargs="*",
        help="Name and optional definition of item's application (minimum 1 arg)",
    )
    op_def.add_argument(
        "--delta", type=str, default="", help="Drop data records from this database version"
    )
    op_def.add_argument("--force", action="store_true", help="Drop item even if it contains data")
    _add_standard_args(op_def)

    drop_operation_optional_args = {}
    drop_operation_optional_args["application_layers"] = op_def = argparse.ArgumentParser(
        prog="drop application_layer", formatter_class=MywArgparseHelpFormatter
    )
    op_def.add_argument(
        "application", type=str, help="Application to drop application layer from (can be wildcard)"
    )

    def operation_drop(self):
        """
        Delete a feature definition, enumerator, layer definition,etc
        """

        # Parse sub-op args
        if self.args.what in self.drop_operation_optional_args:
            if not self.args.args:
                # No args passed is an error (we need 2). We never default on a DROP operation.
                self.arg_parser.error("Please specify which items you want to drop (e.g. '*' '*'.)")
            first_arg = self.args.args[0]
            self.args.name = self.args.args[1]
        else:
            if not self.args.args:
                # No args passed is an error (we need 1). We never default on a DROP operation.
                self.arg_parser.error("Please specify which items you want to drop (e.g. '*'.)")
            self.args.name = self.args.args[0]

        db = self.db_server.open(self.args.db_name)

        if self.args.what == "data":
            self.drop_data(db, self.args.name, self.args.delta)
        elif self.args.what == "features":
            self.drop_features(db, self.args.name, self.args.force)
        elif self.args.what == "searches":
            self.drop_searches(db, self.args.name)
        elif self.args.what == "queries":
            self.drop_queries(db, self.args.name)
        elif self.args.what == "enums":
            self.drop_enums(db, self.args.name, self.args.force)
        elif self.args.what == "layers":
            self.drop_layers(db, self.args.name, self.args.force)
        elif self.args.what == "layer_groups":
            self.drop_layer_groups(db, self.args.name)
        elif self.args.what == "private_layers":
            self.drop_private_layers(db, self.args.name)
        elif self.args.what == "networks":
            self.drop_networks(db, self.args.name)
        elif self.args.what == "datasources":
            self.drop_datasources(db, self.args.name, self.args.force)
        elif self.args.what == "applications":
            self.drop_applications(db, self.args.name)
        elif self.args.what == "roles":
            self.drop_roles(db, self.args.name)
        elif self.args.what == "users":
            self.drop_users(db, self.args.name)
        elif self.args.what == "groups":
            self.drop_groups(db, self.args.name)
        elif self.args.what == "settings":
            self.drop_settings(db, self.args.name)
        elif self.args.what == "notifications":
            self.drop_notifications(db, self.args.name)
        elif self.args.what == "application_layers":
            self.drop_application_layers(db, first_arg, self.args.name)
        elif self.args.what == "checkpoints":
            self.drop_checkpoints(db, self.args.name)
        elif self.args.what == "table_sets":
            self.drop_table_sets(db, self.args.name, self.args.force)
        elif self.args.what == "extracts":
            self.drop_extracts(db, self.args.name, self.args.force)
        elif self.args.what == "replicas":
            self.drop_replicas(db, self.args.name, self.args.force)
        elif self.args.what == "deltas":
            self.drop_deltas(db, self.args.name)
        else:
            raise Exception("Bad choice: " + self.args.what)  # Should never happen

        db.commit()

    def drop_data(self, db, feature_type_spec, delta):
        """
        Drop feature data
        """
        # ENH: Support wildcarded delta

        if delta:
            db_view = db.view(delta)

            for feature_type in db.dd.featureTypes(
                "myworld", feature_type_spec, versioned_only=True, sort=True, warn_if_no_match=True
            ):
                with self.progress.operation(
                    "Delta", delta, ":", "Dropping data for:", feature_type
                ):
                    db_view.table(feature_type).truncate()

        else:
            for feature_type in db.dd.featureTypes(
                "myworld", feature_type_spec, sort=True, warn_if_no_match=True
            ):
                db.dd.emptyFeatureTable(feature_type)

    def drop_features(self, db, name_spec, force):
        """
        Drop feature table(s) and associated DD info
        """

        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):

            with self.progress.operation("Dropping feature type:", feature_rec):

                try:
                    if feature_rec.datasource_name == "myworld" and not db.dd.featureTableIsEmpty(
                        feature_rec.feature_name
                    ):
                        if not force:
                            raise MywError("Table is not empty:", feature_rec)
                        db.dd.emptyFeatureTable(feature_rec.feature_name)

                    db.dd.dropFeatureType(feature_rec)

                except MywError as cond:
                    self.progress("warning", str(cond))

    def drop_searches(self, db, name_spec):
        """
        Drop searches for FEATURE_TYPE_SPEC
        """

        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):

            with self.progress.operation("Dropping searches for:", feature_rec):
                db.dd.alterFeatureType(feature_rec, {"searches": []})

    def drop_queries(self, db, name_spec):
        """
        Drop queries for FEATURE_TYPE_SPEC
        """

        (datasource_spec, feature_type_spec) = self.parseFeatureNameSpec(name_spec)

        for feature_rec in db.dd.featureTypeRecs(
            datasource_spec, feature_type_spec, sort=True, warn_if_no_match=True
        ):

            with self.progress.operation("Dropping queries for:", feature_rec):
                db.dd.alterFeatureType(feature_rec, {"queries": []})

    def drop_enums(self, db, name_spec, force):
        """
        Drop enumerator definition(s)
        """

        for enum_name in db.dd.enumeratorNames(name_spec, sort=True, warn_if_no_match=True):

            if db.dd.enumeratorIsUsed(enum_name) and not force:
                self.progress("warning", "Enumerator in use:", enum_name)
                continue

            with self.progress.operation("Dropping enumerator:", enum_name):
                db.dd.dropEnumerator(enum_name)

    def drop_layers(self, db, name_spec, force):
        """
        Drop layer definition(s)
        """

        for layer_name in db.config_manager.layerNames(name_spec, sort=True, warn_if_no_match=True):

            # ENH: Check for in use .. and use force arg
            with self.progress.operation("Dropping layer:", layer_name):
                db.config_manager.dropLayer(layer_name)

    def drop_layer_groups(self, db, name_spec):
        """
        Drop layer group definition(s)
        """

        for name in db.config_manager.layerGroupNames(name_spec, sort=True, warn_if_no_match=True):

            with self.progress.operation("Dropping layer group:", name):
                db.config_manager.dropLayerGroup(name)

    def drop_private_layers(self, db, name_spec):
        """
        Drop private layer(s)
        """

        for rec in db.config_manager.privateLayerRecs(name_spec, sort=True, warn_if_no_match=True):

            with self.progress.operation("Dropping private layer:", rec.id):
                db.config_manager.dropPrivateLayer(rec.id)

    def drop_networks(self, db, name_spec):
        """
        Drop network definition(s)
        """

        for name in db.config_manager.networkNames(name_spec, sort=True, warn_if_no_match=True):

            with self.progress.operation("Dropping network:", name):
                db.config_manager.dropNetwork(name)

    def drop_datasources(self, db, name_spec, force):
        """
        Drop datasource definition(s)
        """

        for datasource_name in db.dd.datasourceNames(name_spec, sort=True, warn_if_no_match=True):

            if db.dd.datasourceInUse(datasource_name) and not force:
                self.progress("warning", "Datasource in use:", datasource_name)
                continue

            # ENH: if datasource is in use and --force, delete the associated layers ?
            with self.progress.operation("Dropping datasource:", datasource_name):
                db.dd.dropDatasource(datasource_name)

    def drop_applications(self, db, name_spec):
        """
        Drop application definition(s)
        """

        for application_name in db.config_manager.applicationNames(
            name_spec, sort=True, warn_if_no_match=True
        ):

            # ENH: Check for in use by a role (and throw error unless forcing)
            with self.progress.operation("Dropping application:", application_name):
                db.config_manager.dropApplication(application_name)

    def drop_roles(self, db, name_spec):
        """
        Drop roles(s)
        """
        for role_name in db.config_manager.roleNames(name_spec, sort=True, warn_if_no_match=True):

            # ENH: Check for in use by a user (and throw error unless forcing)
            with self.progress.operation("Dropping role:", role_name):
                db.config_manager.dropRole(role_name)

    def drop_users(self, db, name_spec):
        """
        Drop users(s)
        """
        for user_name in db.config_manager.userNames(name_spec, sort=True, warn_if_no_match=True):

            with self.progress.operation("Dropping user:", user_name):
                db.config_manager.dropUser(user_name)

    def drop_groups(self, db, name_spec):
        """
        Drop groups(s)
        """
        for group_rec in db.config_manager.groupRecs(name_spec, sort=True, warn_if_no_match=True):

            with self.progress.operation("Dropping group:", group_rec.id):
                db.config_manager.dropGroup(group_rec.id)

    def drop_settings(self, db, name_spec):
        """
        Drop setting(s)
        """

        # ENH: Warn if no match
        for setting_name in db.settings(name_spec):
            with self.progress.operation("Dropping setting:", setting_name):
                db.setSetting(setting_name, None)

    def drop_notifications(self, db, text_spec):
        """
        Drop administrator notifications
        """

        # ENH: Warn if no match
        for rec in db.config_manager.notifications(text_spec):
            with self.progress.operation("Dropping notification:", rec.id, ":", rec.subject):
                db.session.delete(rec)

    def drop_application_layers(self, db, application_name, text_spec):
        """
        Drop application_layer(s)
        """

        # ENH: Warn if no match
        for app_name in db.config_manager.applicationNames(
            application_name, sort=True, warn_if_no_match=True
        ):
            rec = db.config_manager.applicationRec(app_name)
            for _, application_rec in rec.layer_item_recs():
                with self.progress.operation(
                    "Dropping application_layer:", application_rec.layer_id
                ):
                    db.session.delete(application_rec)

    def drop_checkpoints(self, db, name_spec):
        """
        Drop checkpoint(s)
        """

        # ENH: Warn if no match
        for checkpoint_name in db.checkpoints(name_spec):
            with self.progress.operation("Dropping checkpoint:", checkpoint_name):
                db.dropCheckpoint(checkpoint_name)

    def drop_table_sets(self, db, name_spec, force):
        """
        Drop table set definition(s)
        """

        # ENH: Warn if no match
        for name in db.config_manager.tableSetNames(name_spec):

            if db.config_manager.tableSetInUse(name) and not force:
                self.progress("warning", "Table set in use:", name)
                continue

            with self.progress.operation("Dropping table set:", name):
                db.config_manager.dropTableSet(name)

    def drop_extracts(self, db, name_spec, force):
        """
        Drop extract definition(s)
        """

        rep_engine = self.replication_engine(db, "master")

        # ENH: Warn if no match
        for name in rep_engine.extractTypes(name_spec):
            rep_engine.dropExtractType(name, force)

    def drop_replicas(self, db, name_spec, force):
        """
        Drop extract definition(s)
        """

        rep_engine = self.replication_engine(db, "master")

        # ENH: Warn if no match
        for name in db.replicaNames(name_spec):
            if force:
                rep_engine.deleteReplica(name)
            else:
                rep_engine.dropReplica(name)

    def drop_deltas(self, db, name_spec):
        """
        Drop all records for the specified deltas
        """
        # Note: Faster to do per table .. but this is safer

        feature_types = db.dd.featureTypes("myworld", versioned_only=True, sort=True)

        for delta in db.deltas(name_spec, sort=True):
            db_view = db.view(delta)

            with self.progress.operation("Dropping delta", delta):

                for feature_type in feature_types:
                    db_view.table(feature_type).truncate()

                db.commit()

    # ==============================================================================
    #                              OPERATION CHECKPOINT
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "checkpoint", help="Create a named version")
    op_def.add_argument("name", type=str, help="Checkpoint name")
    op_def.add_argument(
        "--at", type=str, help="Version to create checkpoint at (default: current version)"
    )
    op_def.add_argument(
        "--reposition", action="store_true", help="If checkpoint already exists, reposition it"
    )
    _add_standard_args(op_def)

    def operation_checkpoint(self):
        """
        Create or update checkpoint
        """

        db = self.db_server.open(self.args.db_name)

        # Check for already exists
        if not self.args.reposition and (db.dataVersionFor(self.args.name, False) != None):
            raise MywError("Checkpoint already exists: {}".format(self.args.name))

        # Get version
        if self.args.at:
            version = db.dataVersionFor(self.args.at)
        else:
            version = None

        # Create or reposition
        version = db.setCheckpoint(self.args.name, version)

        self.progress(1, "Set checkpoint", self.args.name, "at data version", version)

        db.commit()

    # ==============================================================================
    #                                OPERATION MAINTAIN
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "maintain", help="Maintain statistics and internal tables"
    )
    _add_standard_args(op_def)
    op_def.add_argument(
        "what",
        choices=[
            "statistics",
            "disk",
            "transaction_logs",
            "features",
            "triggers",
            "geom_indexes",
            "searches",
            "notifications",
            "replicas",
            "usage_stats",
        ],
        help="Aspect to maintain",
    )

    op_def.add_argument(
        "names",
        type=str,
        nargs="?",
        default="*",
        help="Item(s) to perform operation on (can be wildcard)",
    )
    op_def.add_argument(
        "--before",
        metavar="DAYS_OR_DATE",
        default="30",
        help="Minimum age to keep (notifications and usage_stats only)",
    )

    def operation_maintain(self):
        """
        Maintain internal tables and statistics
        """

        db = self.db_server.open(self.args.db_name)

        before_date = self._date_from_arg("before", self.args.before)

        if self.args.what == "statistics":
            self.maintain_statistics(db)
        elif self.args.what == "disk":
            self.maintain_disk(db, self.args.names)
        elif self.args.what == "transaction_logs":
            self.maintain_transaction_logs(db)
        elif self.args.what == "features":
            self.maintain_objects(db, self.args.names)
        elif self.args.what == "triggers":
            self.maintain_triggers(db, self.args.names)
        elif self.args.what == "geom_indexes":
            self.maintain_geom_indexes(db, self.args.names)
        elif self.args.what == "searches":
            self.maintain_searches(db, self.args.names)
        elif self.args.what == "notifications":
            self.maintain_notifications(db, self.args.names, before_date)
        elif self.args.what == "replicas":
            self.maintain_replicas(db)  # ENH: Use names and age
        elif self.args.what == "usage_stats":
            self.maintain_usage_stats(db, self.args.names, before_date)
        else:
            raise Exception("Bad choice: " + self.args.what)  # Should never happen

    def _date_from_arg(self, arg_name, date_str):
        """
        Helper to convert DATE_STR to a date, handling delta as int
        """

        try:
            if re.match("^[0123456789]+$", date_str):
                n_days = int(date_str)
                return datetime.now() - timedelta(n_days)
            else:
                return datetime.strptime(date_str, "%Y-%m-%d")

        except ValueError as cond:
            raise MywError("Bad value for '{}'".format(arg_name), ":", cond)

    def maintain_statistics(self, db):
        """
        Update database statistics (for query optimisation)
        """

        db.updateStatistics()

    def maintain_disk(self, db, name_spec):
        """
        Compact disk
        """

        if name_spec == "*":
            with self.progress.operation("Vacuuming all tables"):
                db.db_driver.vacuum()

        else:
            for (schema, table_name) in self.tableSpecsMatching(db, name_spec):
                with self.progress.operation("Vacuuming", "{}.{}".format(schema, table_name)):
                    db.db_driver.vacuum(schema, table_name)

    def maintain_transaction_logs(self, db):
        """
        Prune transaction log records that are no longer required
        """

        # Get lowest version referenced by a checkpoint
        min_cp_version = db.earliestNamedDataVersion()

        # Delete records upto (and including) that version
        # Note: 'Including' looks odd .. but is correct
        db.pruneTransactionLogs(min_cp_version)

        db.commit()

    def maintain_objects(self, db, feature_type):
        """
        Rebuild all derived data for FEATURE_TYPE
        """

        for feature_rec in db.dd.featureTypeRecs(
            "myworld", feature_type, sort=True, warn_if_no_match=True
        ):

            with self.progress.operation("Maintaining feature type:", feature_rec):
                db.dd.rebuildTriggersFor(feature_rec)
                db.dd.rebuildGeomIndexesFor(feature_rec)
                db.dd.rebuildAllSearchStringsFor(feature_rec)

    def maintain_triggers(self, db, feature_type):
        """
        Rebuild triggers for features FEATURE_TYPE
        """

        for feature_rec in db.dd.featureTypeRecs(
            "myworld", feature_type, sort=True, warn_if_no_match=True
        ):
            db.dd.rebuildTriggersFor(feature_rec)

    def maintain_geom_indexes(self, db, feature_type):
        """
        Rebuild geometry indexes for features FEATURE_TYPE
        """

        for feature_rec in db.dd.featureTypeRecs(
            "myworld", feature_type, sort=True, warn_if_no_match=True
        ):
            db.dd.rebuildGeomIndexesFor(feature_rec)

    def maintain_searches(self, db, feature_type):
        """
        Rebuild search index records for features FEATURE_TYPE
        """

        for feature_rec in db.dd.featureTypeRecs(
            "myworld", feature_type, sort=True, warn_if_no_match=True
        ):
            db.dd.rebuildAllSearchStringsFor(feature_rec)

    def maintain_notifications(self, db, subject_spec, min_date_to_keep):
        """
        Prune notifications older than N_DAYS
        """

        with self.progress.operation(
            "Pruning notifications created before:", min_date_to_keep.date()
        ):

            for rec in db.config_manager.notifications(subject_spec, before=min_date_to_keep):
                self.progress(1, "Dropping notification:", rec.id, rec.subject)
                db.session.delete(rec)

        db.commit()

    def maintain_replicas(self, db):
        """
        Prune replicas that are marked as 'dropped'

        DB must be a master database"""

        rep_engine = self.replication_engine(db, "master")

        rep_engine.pruneReplicas()

        db.commit()

    def maintain_usage_stats(self, db, names, min_date_to_keep):
        """
        Prune usage older than N_DAYS
        """

        include_licences = names == "all"
        db.stats_manager.pruneUsageStats(min_date_to_keep, include_licences)

    # ==============================================================================
    #                                OPERATION VALIDATE
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "validate", help="Check database integrity")
    _add_standard_args(op_def)
    op_def.add_argument(
        "what",
        choices=["features", "layers", "datasources", "table_sets"],
        help="Type of data to check",
    )
    op_def.add_argument("names", type=str, nargs="?", default="*", help="Item(s) to validate")

    def operation_validate(self):
        """
        Check database integrity
        """

        db = self.db_server.open(self.args.db_name)

        if self.args.what == "features":
            self.validate_features(db, self.args.names)
        elif self.args.what == "layers":
            self.validate_layers(db, self.args.names)
        elif self.args.what == "datasources":
            self.validate_datasources(db, self.args.names)
        elif self.args.what == "table_sets":
            self.validate_table_sets(db, self.args.names)
        else:
            raise Exception("Bad choice: " + self.args.what)  # Should never happen

    def validate_features(self, db, name_spec):
        """
        Check feature definitions are valid
        """

        (datasource_spec, name_spec) = self.parseFeatureNameSpec(name_spec)

        enum_names = db.dd.enumeratorNames()
        unit_defs = db.setting("core.units", {})

        rows = []

        for rec in db.dd.featureTypeRecs(
            datasource_spec, name_spec, sort=True, warn_if_no_match=True
        ):

            for err_msg in rec.validate(enum_names, unit_defs):
                rows.append({"feature": rec, "error": err_msg})

        tab_fmtr = MywTableFormatter("feature", ["error", "error", "{}"])

        self.print_lines(tab_fmtr.format(rows))

    def validate_layers(self, db, name_spec):
        """
        Check layer definitions are valid
        """

        rows = []

        for name in db.config_manager.layerNames(name_spec, sort=True, warn_if_no_match=True):
            rec = db.config_manager.layerRec(name)

            for err_msg in rec.validate():
                rows.append({"layer": name, "type": rec.datasource_rec.type, "error": err_msg})

        tab_fmtr = MywTableFormatter("layer", "type", ["error", "error", "{}"])

        self.print_lines(tab_fmtr.format(rows))

    def validate_datasources(self, db, name_spec):
        """
        Check datasource definitions are valid
        """

        rows = []

        for name in db.dd.datasourceNames(name_spec, sort=True, warn_if_no_match=True):
            rec = db.dd.datasourceRec(name)

            for err_msg in rec.validate():
                rows.append({"datasource": name, "type": rec.type, "error": err_msg})

        tab_fmtr = MywTableFormatter("datasource", "type", ["error", "error", "{}"])

        self.print_lines(tab_fmtr.format(rows))

    def validate_table_sets(self, db, name_spec):
        """
        Check layer definitions are valid
        """

        rows = []

        for name in db.config_manager.tableSetNames(name_spec, sort=True, warn_if_no_match=True):
            rec = db.config_manager.tableSetRec(name)

            for err_msg in rec.validate():
                rows.append({"table_set": name, "error": err_msg})

        tab_fmtr = MywTableFormatter("table_set", ["error", "error", "{}"])

        self.print_lines(tab_fmtr.format(rows))

    # ==============================================================================
    #                                 OPERATION INITIALISE
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "initialise", help="Initialise master database for replication"
    )
    op_def.add_argument("sync_dir", type=str, help="Directory to store update packages in")
    op_def.add_argument("sync_url", type=str, help="URL of master myWorld server")
    op_def.add_argument(
        "--download_dir", type=str, help="Set download directory and enable extract downloads"
    )
    op_def.add_argument(
        "--anonymous_downloads", action="store_true", help="Enable anonymous downloads"
    )
    op_def.add_argument("--force", action="store_true", help="Force reinitialisation of meta-data")
    op_def.add_argument(
        "--login_on_app_start",
        action="store_true",
        help="Perform login check every time a user attempts to use an application",
    )
    op_def.add_argument(
        "--os_auth",
        action="store_true",
        help="Allows for authorisation using OS username (Currently only supported in Windows)",
    )
    op_def.add_argument(
        "--login_timeout",
        type=int,
        default=None,
        help="Automatically perform login check after specified number of minutes",
    )
    _add_standard_args(op_def)

    def operation_initialise(self):
        """
        Initialise replication meta-data in master database
        """

        from myworldapp.core.server.replication.myw_master_replication_engine import (
            MywMasterReplicationEngine,
        )

        db = self.db_server.open(self.args.db_name)

        rep_engine = MywMasterReplicationEngine(db, progress=self.progress)

        rep_engine.initialiseDatabase(
            self.args.sync_dir,
            self.args.sync_url,
            force=self.args.force,
            download_dir=self.args.download_dir,
            anonymous_downloads=self.args.anonymous_downloads,
            os_auth=self.args.os_auth,
            login_timeout=self.args.login_timeout,
            login_on_app_start=self.args.login_on_app_start,
        )

    # ==============================================================================
    #                                  OPERATION EXTRACT
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "extract", help="Create a SQLite extract")
    op_def.add_argument(
        "output_db", type=str, help="File name for SQLite database (suffix must be .db)"
    )
    op_def.add_argument("description", type=str, help="Description for metadata file")
    op_def.add_argument(
        "region", type=str, nargs="?", default="full", help="Region defining extract extent"
    )
    op_def.add_argument(
        "table_set", type=str, nargs="?", default="full", help="Table set defining extract content"
    )
    op_def.add_argument(
        "name", type=str, nargs="?", help="Name for extract (default: <region>_<table_set>)"
    )
    op_def.add_argument("--zipped", action="store_true", help="Zip files for download")
    op_def.add_argument(
        "--overwrite", action="store_true", help="If database files already exist, overwrite them"
    )
    op_def.add_argument("--include_deltas", action="store_true", help="Include deltas in extract")
    op_def.add_argument(
        "--encryption_key",
        type=str,
        default=None,
        action=EncryptionKeyAction,
        help="Encryption key to use for this extract. If no value is provided a random key will be generated",
    )

    _add_standard_args(op_def)

    def operation_extract(self):
        """
        Create an extract and initialise it
        """

        from myworldapp.core.server.replication.myw_master_replication_engine import (
            MywMasterReplicationEngine,
        )
        from myworldapp.core.server.replication.myw_extract_replication_engine import (
            MywExtractReplicationEngine,
        )

        # Open database
        # Note: 'SERIALIZABLE' ensures that view of master is frozen while extracting
        # ENH: Better to use 'REPEATABLE READ' (new at Postges 9.1)?
        db = self.db_server.open(self.args.db_name, isolation_level="SERIALIZABLE")

        # Deal with defaults
        region = self.args.region
        if region == "full":
            region = None

        table_set = self.args.table_set
        if table_set == "full":
            table_set = None

        # Build default extract name
        extract_name = self.args.name
        if not extract_name:
            extract_name = self.args.region
            if table_set:
                extract_name += "_" + self.args.table_set

        # Build connect string for 'direct' sync
        master_db_connect_info = {
            "host": self.db_server.host,
            "port": self.db_server.port,
            "db_name": db.name(),
        }

        # Create extract
        rep_engine = MywMasterReplicationEngine(db, "master", progress=self.progress)

        extract_db = rep_engine.extract(
            self.args.output_db,
            extract_name,
            region,
            table_set,
            master_db_connect_info,
            self.args.overwrite,
            self.args.include_deltas,
            self.args.encryption_key,
        )

        # Package it
        extract_rep_engine = MywExtractReplicationEngine(extract_db, progress=self.progress)
        extract_rep_engine.package(self.args.description, self.args.zipped)

    # ==============================================================================
    #                                 OPERATION EXPORT
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "export", help="Export master changes to the sync directory"
    )
    op_def.add_argument(
        "extract_type", type=str, default="*", nargs="?", help="Extract type to export changes for"
    )
    op_def.add_argument(
        "--records_per_file",
        type=int,
        default=2000,
        metavar="N",
        help="Start new output file after N records",
    )  # NativeApp prefers small files
    op_def.add_argument(
        "--include_code", action="store_true", help="Include client code in sync package"
    )
    _add_standard_args(op_def)

    def operation_export(self):
        """
        Load pending updated from the sync directory
        """

        # Open database
        # Note: SERIALIZABLE forces session to be always in a transaction.
        # This avoids the danger of a transaction 'gap' when exporting from a hot database.
        # See MywMasterReplicationEngine.exportChanges() for more details
        db = self.db_server.open(self.args.db_name, isolation_level="SERIALIZABLE")
        rep_engine = self.replication_engine(db)
        db_type = rep_engine.databaseType()

        succeeded = False
        attempts = 0

        while not succeeded:
            attempts += 1
            try:
                # Export the updates
                if db_type == "master":
                    rep_engine.exportChanges(
                        self.args.extract_type,
                        max_recs_per_file=self.args.records_per_file,
                        include_code=self.args.include_code,
                    )
                    succeeded = True

                elif db_type == "replica":
                    rep_engine.exportChanges()
                    succeeded = True

                else:
                    raise MywError("Cannot export from a {} database".format(db_type))
            except exc.OperationalError:
                if attempts > 10:
                    # It seems unlikely that two jobs would clash with one another this many times,
                    # so we assume another problem and report the error.
                    raise
                self.progress(6, "Export clash detected, retrying...")
                db.session.rollback()

    # ==============================================================================
    #                                 OPERATION UPDATE
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "update", help="Apply master updates to a SQLite extract"
    )
    _add_standard_args(op_def)

    def operation_update(self):
        """
        Load pending updates from the sync share
        """

        # Open database
        db = self.db_server.open(self.args.db_name)
        rep_engine = self.replication_engine(db, "extract", ignore_sync_url=True)

        # Load the updates
        n_loaded = rep_engine.importUpdates()

        # Rebuild zip files and manifest (if necessary)
        if n_loaded > 0:
            # TODO: vacuum
            rep_engine.repackage()

    # ==============================================================================
    #                                  OPERATION CONVERT
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "convert", help="Convert a database to SQLite format"
    )
    op_def.add_argument(
        "output_db", type=str, help="File name for SQLite database (suffix must be .db)"
    )
    op_def.add_argument(
        "--overwrite", action="store_true", help="If file already exists, overwrite it"
    )
    _add_standard_args(op_def)

    def operation_convert(self):
        """
        Convert to SQLite format
        """

        from myworldapp.core.server.replication.myw_extract_engine import MywExtractEngine
        from myworldapp.core.server.replication.myw_extract_filter import (
            MywExtractFilter,
        )  # ENH: Avod need to import this
        from myworldapp.core.server.database.myw_upgrade_manager import MywUpgradeManager

        db = self.db_server.open(self.args.db_name)
        upgrade_mgr = MywUpgradeManager(self.progress)

        # Check schema version
        expected_version = upgrade_mgr.coreVersion()
        db_version = db.versionStamp("myw_schema")

        if db_version != expected_version:
            msg = "Database schema does not match expected version: Expected {}: Got {}".format(
                expected_version, db_version
            )
            raise MywError(msg)

        # Check for already exists
        if os.path.exists(self.args.output_db):
            if self.args.overwrite:

                os.unlink(self.args.output_db)
            else:
                raise MywError("File already exists: " + self.args.output_db)

        # Set up conversion
        extract_filter = MywExtractFilter(
            "extract", region=None, table_set=None, progress=None, include_deltas=True
        )

        engine = MywExtractEngine(db, self.progress)

        # Do conversion
        engine.extractDatabase(self.args.output_db, extract_filter)

    # ==============================================================================
    #                                  OPERATION PACKAGE
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "package", help="Package a SQLite database for deployment"
    )
    op_def.add_argument("description", type=str, help="Description of database content")
    op_def.add_argument("--zipped", action="store_true", help="Zip files for download")
    op_def.add_argument("--force", action="store_true", help="Override consistency checks")
    _add_standard_args(op_def)

    def operation_package(self):
        """
        Package (or re-package) an extract database for deployment to Native Apps

        Zips files (if requested) and adds manifest"""

        from myworldapp.core.server.replication.myw_extract_replication_engine import (
            MywExtractReplicationEngine,
        )

        require_code = not self.args.force

        # Open database
        db = self.db_server.open(self.args.db_name)  # ENH: Force SQLite
        rep_engine = MywExtractReplicationEngine(db, progress=self.progress)

        # Check database type
        db_type = rep_engine.databaseType()

        if db_type == "replica":
            raise MywError("Deploy of replica database not permitted")

        if db_type != "extract":
            self.progress("warning", "Database is not an extract")

        # Zip and build manifest
        rep_engine.package(self.args.description, self.args.zipped, require_code=require_code)

    # ==============================================================================
    #                                  OPERATION CONFIGURE_EXTRACT
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "configure_extract", help="Configure download of extracts"
    )
    op_def.add_argument("extract", type=str, help="Extract to configure (or all or none)")
    op_def.add_argument(
        "role",
        type=str,
        nargs="?",
        default=None,
        help="Role which will be able to download the extract (can be wildcard, all or none)",
    )
    op_def.add_argument(
        "--writable_by_default",
        action="store_true",
        help="Sets the extract to be writable by default when downloaded",
    )
    op_def.add_argument(
        "--expiry", type=str, help="Date and time of when the extract will expire (in ISO format)"
    )
    op_def.add_argument(
        "--folder",
        type=str,
        help="Override name of folder where extract will be available to download. Relative to replication.download_root setting",
    )

    _add_standard_args(op_def)

    def operation_configure_extract(self):
        """
        Configure extracts for download
        """
        # Open database
        db = self.db_server.open(self.args.db_name)

        extract_name = self.args.extract
        role = self.args.role
        writable_by_default = self.args.writable_by_default
        expiry = self.args.expiry
        folder_name = self.args.folder

        specific_role = role is not None and role != "all" and role != "none"

        if specific_role and folder_name:
            raise MywError("Can't set folder name when specifying a role")
        if specific_role and expiry:
            raise MywError("Can't set expiry when specifying a role")
        if specific_role and writable_by_default:
            raise MywError("Can't set writable_by_default name when specifying a role")

        if specific_role:
            self.set_extract_download(db, extract_name, role)
        else:
            db.setExtractDownload(extract_name, role, writable_by_default, expiry, folder_name)

        db.commit()

    def set_extract_download(self, db, extract_name, role_name_spec):
        """ """
        # ENH: Warn if no match
        try:
            for role in db.roles(role_name_spec):
                with self.progress.operation("Adding extract download:", role):
                    db.setExtractDownload(extract_name, role)
        except MywError as cond:
            self.progress("error", str(cond))

    # ==============================================================================
    #                                  OPERATION RUN
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "run", help="Run a script")
    op_def.add_argument("file", type=str, nargs="?", help="File to run")
    op_def.add_argument("script_args", nargs="*", help="Arguments to pass to script")
    op_def.add_argument(
        "--command", "-c", action="store_true", help="Interpret args as a python command"
    )
    op_def.add_argument("--sql", "-s", action="store_true", help="Interpret args as a sql command")
    op_def.add_argument(
        "--commit", action="store_true", help="Perform a commit after script completes"
    )
    _add_standard_args(op_def)

    def operation_run(self):
        """
        Run a python script
        """
        # ENH: Support command scripts too

        # Init globals
        db = self.db_server.open(self.args.db_name)
        args = self.args.script_args

        # Case: Interactive session
        if not self.args.file:
            if self.args.sql:
                self.run_sql_from_prompt(db)
            else:
                code.interact(local=locals())

        # Case: Single command
        elif self.args.command or self.args.sql:
            cmd = " ".join([self.args.file] + self.args.script_args)
            if self.args.sql:
                self.run_sql_statement(db, cmd)
            else:
                exec(cmd)

        # Case: Run file
        else:
            if self.args.file.endswith(".sql"):
                self.run_sql_file(db, self.args.file)
            else:
                globs = {"db": db, "args": args, "__file__": os.path.abspath(self.args.file)}
                exec(
                    compile(open(self.args.file, "rb").read(), self.args.file, "exec"), globs, globs
                )  # Globs args enable ref of local classes in files

        # Commit changes (if requested)
        if self.args.commit:
            db.db_driver.session.commit()

    def run_sql_from_prompt(self, db):
        """
        Read SQL statements from prompt and run them
        """

        while True:
            sys.stdout.write("SQL> ")
            line = sys.stdin.readline().strip()

            if line.lower() == "quit":
                break

            if not line:
                continue

            try:
                self.run_sql_statement(db, line)
            except Exception as cond:
                print(cond)

    def run_sql_file(self, db, file_name):
        """
        Load SQL from FILE_NAME and run it
        """

        for sql in db.db_driver.sql_statements_in(file_name):
            self.progress(1, "Running:", sql)
            self.run_sql_statement(db, sql)

    def run_sql_statement(self, db, sql):
        """
        Execute a SQL statement and show result
        """

        to_string = lambda x: "<buffer>" if isinstance(x, memoryview) else str(x)

        # Run statement
        res = db.db_driver.execute(sql)

        # Show result (if appropriate)
        if res.returns_rows:
            print("  ", ",".join(map(to_string, list(res.keys()))))
            for row in res:
                print("  ", ",".join(map(to_string, row)))

    # ==============================================================================
    #                              OPERATION BACKUP
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "backup", help="Copy database to disk archive")
    op_def.add_argument("file", type=str, help="File to create")
    _add_standard_args(op_def)

    def operation_backup(self):
        """
        Archive to disk
        """

        self.progress(1, "Creating", self.args.file, "...")
        self.db_server.backup(self.args.db_name, self.args.file)

    # ==============================================================================
    #                              OPERATION RESTORE
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "restore", help="Restore database from disk archive")
    op_def.add_argument("file", type=str, help="File to restore from")
    _add_standard_args(op_def)

    def operation_restore(self):
        """
        Restore from disk
        """

        # ENH: Add --overwrite
        # ENH: As single transaction

        # Check archive exists
        if not os.path.exists(self.args.file):
            raise MywError("File not found: " + self.args.file)

        # Drop existing instance (if necesary)
        if self.db_server.exists(self.args.db_name):
            self.progress(1, "Dropping database", self.args.db_name, "...")
            self.db_server.drop(self.args.db_name)

        # Create new instance
        self.progress(1, "Creating database", self.args.db_name, "...")
        self.db_server.create(self.args.db_name)

        # Load archive
        self.progress(1, "Loading", self.args.file, "...")
        self.db_server.restore(self.args.db_name, self.args.file)

    # ==============================================================================
    #                              OPERATION DROP_DATABASE
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "drop_database", help="Delete database")
    _add_standard_args(op_def)

    def operation_drop_database(self):
        """
        Drop a database instance
        """

        # ENH: insist on --force if data tables are populated

        self.progress(1, "Dropping database", self.args.db_name, "...")
        self.db_server.drop(self.args.db_name)
