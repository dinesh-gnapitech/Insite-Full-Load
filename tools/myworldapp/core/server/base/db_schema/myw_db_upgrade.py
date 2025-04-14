################################################################################
# Superclass for myWorld database upgrades
################################################################################
# Copyright: IQGeo Limited 2010-2023

from datetime import datetime
from sqlalchemy import MetaData

from myworldapp.core.server.base.core.myw_error import *
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.db.myw_db_driver import MywDbDriver


class MywDbUpgradeError(MywError):
    """Exception for data/user errors during upgrades"""


class MywDbUpgrade:
    """
    Abstract superclass for database upgrades

    Provides framework for running update methods (see .run())

    Sub-classes must implement:
      .from_version       Minuimum version stamp from which self can upgrade
      .updates            List of methods to run, keyed by datamodel version no
      .schema_vs_name     "myw_schema" in almost all cases. Exceptions generally live on
                          old release branches but not on main.
      .supports_dry_run   True if all changes can be made in a single transaction"""

    # Abstract members, must be given sensible values in derived classes.
    from_version = float("inf")
    schema_vs_name = ""
    updates = {}

    # The can be overridden in subclasses
    db_driver_class = MywDbDriver
    supports_dry_run = False

    # ==============================================================================
    #                                 CONSTRUCTION
    # ==============================================================================

    def __init__(self, session, progress=MywProgressHandler(), lang=None, encoding=None):
        """
        Init slots of self

        SESSION is a SQLAlchemy session
        """

        self.session = session
        self.progress = progress

        self.db_driver = self.db_driver_class.newFor(
            self.session
        )  # Driver for the database dialect
        self.transaction_level = None  # Current transaction level (0 means none)

        self.lang = lang or self.getDefaultLanguage()
        self.encoding = encoding
        self.db_driver.progress = self.progress

    @classmethod
    def to_version(self):
        """
        The schema version to which self upgrades the database
        """

        if not self.updates:
            return self.from_version

        return max(self.updates.keys())

    # ==============================================================================
    #                                    RUNNING
    # ==============================================================================

    def run(self, stop_before=999999, dry_run=False):
        """
        Apply the updates in self

        Optional STOP_BEFORE can be used to limit the updates run.
        If DRY_RUN is True, just show what would be done"""

        # Show starting state
        current_version = self.current_version_for(self.schema_vs_name)
        if current_version == None:
            current_version = 0
        self.progress(1, "Upgrading from schema version:", current_version)
        self.progress(3, "Language:", self.lang)

        # Check current version is suitable
        if current_version < self.from_version:
            msg = "This upgrade cannot start from schema version {} (must be {} or later)".format(
                current_version, self.from_version
            )
            raise MywDbUpgradeError(msg)

        # Check for dry-run not supported
        if dry_run:
            if not self.db_driver.supports_data_model_rollback:
                raise MywDbUpgradeError("Database type does not support dry run")

            if not self.supports_dry_run:
                raise MywDbUpgradeError("Upgrade does not support dry run")

        # Init state
        self.transaction_level = 0

        # Make the changes
        if dry_run:
            self.dry_run_updates(stop_before)
        else:
            self.run_updates(stop_before)

    def dry_run_updates(self, stop_before):
        """
        Test self's updates
        """

        self.start_transaction()
        try:
            self.run_updates(stop_before)

        finally:
            print("Discarding changes (dry run)")
            self.end_transaction(False)

    def run_updates(self, stop_before):
        """
        Run self's updates
        """

        # For each update ...
        for update_id in sorted(self.updates.keys()):

            # Check for done
            if update_id >= stop_before:
                self.progress(1, "Stopping before ", update_id)
                return

            # Run it
            self.run_update_if_appropriate(update_id)

    def run_update_if_appropriate(self, update_id):
        """
        Apply update method ID if it hasn't already been run
        """

        current_version = self.current_version_for(self.schema_vs_name)
        if current_version is None:
            current_version = 0

        # Get description for user
        meth_name = self.updates[update_id]
        update_desc = "{}: {}()".format(update_id, meth_name)

        # Check for already run
        if update_id <= current_version:
            self.progress(2, "Update already run:", update_desc)
            return False

        # Run update
        with self.progress.operation("Running update", update_desc):

            # As a single transaction ..
            ok = self.start_transaction()
            try:

                # Make changes
                meth = getattr(self, meth_name)
                meth()

                # Update version stamp
                self.set_current_version_for(self.schema_vs_name, update_id)

                ok = True

            finally:
                self.end_transaction(ok)

    # ==============================================================================
    #                                  TRANSACTIONS
    # ==============================================================================

    def start_transaction(self):
        """
        Start a transaction on the database

        Calls can be nested"""

        self.transaction_level += 1

        return False

    def end_transaction(self, ok=True):
        """
        End a transaction on the database
        """

        self.transaction_level -= 1

        if self.transaction_level == 0:

            if ok:
                self.session.commit()
            else:
                self.session.rollback()

    # ==============================================================================
    #                                VERSION STAMPS
    # ==============================================================================

    def current_version_for(self, component):
        """
        Return version stamp for COMPONENT (an integer)
        """

        if self.db_driver.tableExists("myw", "version_stamp"):
            return self.post_170_current_version_for(component)

        if self.db_driver.tableExists("data", "myw_database_version"):
            return self.pre_170_current_version_for(component)

        return 0

    def pre_170_current_version_for(self, component):
        """
        Return version stamp from pre 1.7 table
        """

        known_versions = {"1.0.5": 10500, "1.5.0": 15000, "1.6.0": 16000}

        # Pre1.7 only versioned the schema
        if component != "myw_schema":
            return 0

        sql_str = "SELECT MAX(database_version_tag) FROM data.myw_database_version;"
        version_str = self.execute_sql(sql_str).scalar()

        # Translate version strings to numbers
        return known_versions.get(version_str, 0)

    def post_170_current_version_for(self, component):
        """
        Return version stamp from 1.7 table
        """

        db_tablename = self.db_driver.dbNameFor("myw", "version_stamp", True)
        sql_str = "SELECT (version) FROM {} WHERE component = '{}'".format(db_tablename, component)
        version_str = self.execute_sql(sql_str).scalar()
        if version_str is None:
            return 0

        return version_str

    def set_current_version_for(self, component, version):
        """
        Set version stamp for COMPONENT (an integer)
        """

        if (component == "myw_schema") and version < 17000:
            self.progress(3, "No version stamp table yet")
            return

        date = datetime.utcnow()  # Must match myw_database.setVersionStamp()

        MywVersionStamp = self.rawModelFor("myw", "version_stamp")

        vsr = (
            self.session.query(MywVersionStamp)
            .filter(MywVersionStamp.component == component)
            .first()
        )

        if not vsr:
            vsr = MywVersionStamp(component=component, version=version, date=date)
            self.session.add(vsr)

        vsr.version = version
        vsr.date = date

        self.session.flush()

    # ==============================================================================
    #                                SQL MANIPULATION
    # ==============================================================================

    def execute_sql(self, *lines):
        """
        Run an SQL command
        """

        sql_str = ""
        for line in lines:
            sql_str += line + " "

        return self._execute_sql(sql_str)

    def _execute_sql(self, sql_str):
        """
        Run an SQL command
        """

        self.progress(10, "SQL:", self.transaction_level, ": ", sql_str)

        # Escape SQLAlchemy special chars
        sql_str = sql_str.replace("%", "%%")

        # Run it
        # ENH: Fix 'illegal variable name/number' issue in 260 Oracle upgrade and use session.execute() instead
        res = self.session.connection().execute(sql_str)

        return res

    # ==============================================================================
    #                                  LOGGING
    # ==============================================================================

    def warning(self, level, *msg):
        """
        Write a warning
        """

        self.progress("warning", *msg)

    # ==============================================================================
    #                                   HELPERS
    # ==============================================================================

    def rawModelFor(self, schema, table_name, id_from_sequence=False):
        """
        Build a sqlalchemy class for accessing TABLE_NAME

        Optional ID_FROM_SEQUENCE indicates that the table's id field has a sequence generator
        Optional GEOM_COLUMNS is a list of geometry column names.

        Returns a 'raw' model (no field mapping for geometry fields, booleans, etc)"""

        # Use separate metadata for each instance (since table shape may have changed)
        metadata = MetaData(schema=self.db_driver.dbNameFor(schema))

        return self.db_driver.rawModelFor(
            schema, table_name, id_from_sequence=id_from_sequence, metadata=metadata
        )

    def getDefaultLanguage(self):
        """
        The default language defined in settings
        """
        MywSetting = self.rawModelFor("myw", "setting")

        setting = self.session.query(MywSetting).filter(MywSetting.name == "core.language").first()
        if not setting:
            setting = (
                self.session.query(MywSetting).filter(MywSetting.name == "language").first()
            )  # For pre-5.1 compatibility

        lang = setting and setting.value or "en"

        # return language handling possibility of it being a list of languages (first one is the default one)
        return lang.split(",")[0]
