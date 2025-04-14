################################################################################
# High-level API for manipulating the myWorld database
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os
import fnmatch
import json
from datetime import datetime

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler


class MywRawDatabase:
    """
    High-level object for manipulating a myWorld database (without using models)

    Provides protocols for querying and changing system
    settings etc. Does not use models
    """

    # Provided because we cannot create a MywDatabase on a
    # secondary connection of a different database type due to the
    # way Mapfish models work. See public comment on MywDatabase
    # for more details.

    def __init__(self, session, progress=MywProgressHandler()):
        """
        Init slots of self

        SESSION is a SQLAlchemy session object. Optional
        PROGRES_PROC(level,*msg) is a callback for progress messages"""

        self.session = session
        self.progress = progress

    # ==============================================================================
    #                                  PROPERTIES
    # ==============================================================================

    @property
    def path(self):
        """
        Location of database

        For SQLite databases, returns path of database file"""

        return self.session.bind.engine.url.database

    def name(self):
        """
        Name of database

        For SQLite databases, returns name of database file (but not its path)"""

        return os.path.basename(self.path)

    def directory(self):
        """
        Directory in which database file is located (SQLite databses only)
        """

        return os.path.dirname(self.path) or "."

    @property
    def db_driver(self):
        """
        Self's database driver (a MywDbDriver)
        """

        return self.session.myw_db_driver

    # ==============================================================================
    #                            BASIC DATABASE OPERATIONS
    # ==============================================================================

    def commit(self, ok=True):
        """
        Commit changes to disk (or roll them back)

        Version lock is released"""

        if ok:
            self.session.flush()
            self.session.commit()
        else:
            self.session.rollback()

    def rollback(self):
        """
        Discard all changes since last commit

        Version lock is released"""

        self.session.flush()  # ENH: Not necessary?
        self.session.rollback()

    def executeSQL(self, sql):
        """
        Execute the given sql statement
        """

        return self.session.execute(sql)

    # ==============================================================================
    #                                  TABLE HELPERS
    # ==============================================================================

    def tableNames(self, schema, filter=None, sort=False):
        """
        Returns names of the tables in SCHEMA

        Optional filter is a glob-style filter"""

        table_names = self.db_driver.tableNamesIn(schema)

        if filter:
            table_names = fnmatch.filter(table_names, filter)

        if sort:
            table_names = sorted(table_names)

        return table_names

    def rawTable(self, schema_name, table_name):
        """
        A query yielding the records in TABLE_NAME as raw SQLAlchemy objects

        Raw objects do not include model behaviour or geometry column mappings"""

        # ENH: Improve rawModelFor() to handle geometry column mappings etc

        model = self.db_driver.rawModelFor(schema_name, table_name)

        return self.session.query(model)

    # ==============================================================================
    #                                    STATISTICS
    # ==============================================================================

    def updateStatistics(self):
        """
        Update database statistics (to improve query performance)
        """

        self.progress("starting", "Building statistics...")

        self.session.myw_db_driver.updateStatistics()

        self.progress("finished", "Done")

    # ==============================================================================
    #                                TILE DB ACCESS
    # ==============================================================================

    def tilestore(self):
        """
        Self's tile repository (a MywTilestore)

        Constructed from myworld datasource's 'tilestore' property"""
        # ENH: Could cache this

        from myworldapp.core.server.base.tilestore.myw_tilestore import MywTilestore

        # Get the datasource record
        MywDatasource = self.db_driver.rawModelFor("myw", "datasource")
        myworld_ds_rec = self.session.query(MywDatasource).get("myworld")  # ENH: Warn if not found

        # Unpick the spec
        if myworld_ds_rec.spec:
            spec = json.loads(myworld_ds_rec.spec)
        else:
            spec = {}

        tilestore_spec = spec.get("tilestore", [])

        tilestore = MywTilestore(tilestore_spec)

        # For SQLite DBs, tile files assumed to be in same directory as database (as per Native App)
        if self.db_driver.dialect_name == "sqlite":
            tilestore_spec = tilestore.mapped_spec(self.directory())
            tilestore = MywTilestore(tilestore_spec)

        return tilestore

    def setTileFiles(self, tilestore_spec):
        """
        Set the files that make up self's tile repository

        Updates the myworld datasource's 'tilestore' property

        TILESTORE_SPEC is a dict of tile file names, keyed by tile
        layer (see MywTilestore for details)"""

        # Get the datasource record
        MywDatasource = self.db_driver.rawModelFor("myw", "datasource")
        myworld_ds_rec = self.session.query(MywDatasource).get("myworld")  # ENH: Warn if not found

        # Unpick the spec
        if myworld_ds_rec.spec:
            spec = json.loads(myworld_ds_rec.spec)
        else:
            spec = {}

        # Set the new value
        spec["tilestore"] = tilestore_spec
        myworld_ds_rec.spec = json.dumps(spec)

    # ==============================================================================
    #                                  SYSTEM SETTINGS
    # ==============================================================================
    # These currently get overwritten in MywDatabase

    def setting(self, name):
        """
        Get the value of system setting NAME (if there is one)

        Returns the value, formatted according to its type"""

        MywSetting = self.db_driver.rawModelFor("myw", "setting")
        rec = self.session.query(MywSetting).get(name)

        if not rec:
            return None

        return self._settingValue(rec)

    def setSetting(self, name, value):
        """
        Set (or update) the value of system setting NAME

        Returns the value, formatted according to its type"""

        # Get the existing record (if there is one)
        MywSetting = self.db_driver.rawModelFor("myw", "setting")
        rec = self.session.query(MywSetting).get(name)

        if value != None:

            # Case: Insert
            if not rec:
                rec = MywSetting()
                rec.name = name
                self._setSettingValue(rec, value)
                self.session.add(rec)

            # Case: Update
            else:
                self._setSettingValue(rec, value)

        else:
            # Case: Delete
            if rec:
                self.session.delete(rec)

    def _settingValue(self, rec):
        """
        The value of
        """
        # ENH: Duplicated with model MywSetting. Move to driver?

        # Format the value
        if rec.type == "STRING":
            return rec.value

        elif rec.type == "INTEGER":
            return int(rec.value)

        elif rec.type == "JSON":
            return json.loads(rec.value)

        else:
            raise Exception(self.name, "Unknown setting type", rec.type)  # Internal error

    def _setSettingValue(self, rec, formatted_value):
        """
        Set value on a setting record
        """
        # ENH: Duplicated with model MywSetting

        # Determine type
        if isinstance(formatted_value, str):
            data_type = "STRING"
            value = formatted_value

        elif isinstance(formatted_value, int):
            data_type = "INTEGER"
            value = str(formatted_value)

        elif isinstance(formatted_value, (dict, list)):
            data_type = "JSON"
            value = json.dumps(formatted_value)

        else:
            raise Exception(self.name, "Cannot determine storage type for", formatted_value)

        rec.type = data_type
        rec.value = value

    # ==============================================================================
    #                              VERSION STAMPS
    # ==============================================================================

    def versionStamp(self, component):
        """
        Get the value of the version stamp for COMPONENT
        """

        MywVersionStamp = self.db_driver.rawModelFor("myw", "version_stamp")

        rec = self.session.query(MywVersionStamp).get(component)

        if not rec:
            return None

        return rec.version

    def setVersionStamp(self, component, version, date=datetime.utcnow()):
        """
        Get the value of the version stamp for COMPONENT
        """

        MywVersionStamp = self.db_driver.rawModelFor("myw", "version_stamp")

        rec = self.session.query(MywVersionStamp).get(component)

        if not rec:
            rec = MywVersionStamp(component=component)
            self.session.add(rec)

        rec.version = version
        rec.date = date

    # ==============================================================================
    #                               REPLICA META-DATA
    # ==============================================================================

    def replicaRec(self, replica_id):
        """
        Database record for replica REPLICA_ID (if there is one)
        """

        MywReplica = self.db_driver.rawModelFor("myw", "replica")

        return self.session.query(MywReplica).get(replica_id)
