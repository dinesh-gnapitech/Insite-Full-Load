################################################################################
# Engine for communicating with a spatialite 'server'
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os
import shutil

from sqlalchemy import event

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from .myw_db_server import MywDbServer


class MywSqliteDbServer(MywDbServer):
    """
    Engine for communicating with a Spatialite 'server'

    Provides facilities for creating, deleting and opening databases"""

    def __init__(
        self,
        host=None,
        port=None,
        username=None,
        password=None,
        encryption_key=None,
        progress=MywProgressHandler(),
    ):
        """
        Init slots of self

        HOST, PORT, USERNAME and PASSWORD are ignored"""

        super(MywSqliteDbServer, self).__init__(progress)

        self.host = host  # ENH: Avoid need for this (modify myw_db_command)
        self.port = port
        self.encryption_key = encryption_key

    def connectSpecFor(self, db_name, **kwargs):
        """
        Build the SQLAlchemy connect spec from parameters specified in self.args

        Gets backstop values for password etc from environment (if necessary)
        """

        if self.encryption_key is None:
            connectionMethod = "sqlite"
            password = ""
        else:
            connectionMethod = "sqlite+pysqlcipher"
            password = f":{self.encryption_key}@"

        return f"{connectionMethod}://{password}/{db_name}"

    def updateStatistics(self, name):
        session = self.openSecondarySession(name)
        session.myw_db_driver.updateStatistics()

    def openSession(self, db_name, isolation_level=None):
        """
        Open database and initialise SQLAlchemy session (for using model etc)

        Database must exist and have myWorld data model installed

        Returns a MywDatabase object"""

        # ENH: Subclassed to prevent automatic creation of DBs

        if not self.exists(db_name):
            raise MywError("No such database: {}".format(db_name))

        return super(MywSqliteDbServer, self).openSession(db_name, isolation_level=isolation_level)

    def prepareForConnect(self, engine):
        """
        Called before connecting SQLAlchemy engine ENGINE

        Subclassed to configure spatialite initialisation"""

        # See https://geoalchemy-2.readthedocs.io/en/latest/

        # Add an event to load spatialite after engine connects
        # ENH: Find a simpler way
        @event.listens_for(engine, "connect")
        def connect(dbapi_connection, connection_rec):
            dbapi_connection.enable_load_extension(True)
            sql = "select load_extension('{}')".format("mod_spatialite")
            dbapi_connection.execute(sql)

    # ==============================================================================
    #                             BASIC OPERATIONS
    # ==============================================================================

    def exists(self, name):
        """
        True if a database called name exists
        """

        return os.path.exists(name)

    def create(self, name, template=None, schema_only=False):
        """
        Create database NAME (which must not already exist).
        TEMPLATE specifies a template database to use.
        If SCHEMA_ONLY then create the schema only.
        """
        # ENH: Get rid of schema_only

        # Check for already exists
        if self.exists(name):
            raise MywError("Database already exists: " + name)

        if template:
            # Just copy the other DB
            shutil.copy(template, name)

        else:
            # Create DB and install the Spatialite datamodel
            session = self.openSecondarySession(name)
            session.myw_db_driver.initialiseDatabase()

    def drop(self, name):
        """
        Drop database NAME (which must exist)
        """

        os.remove(name)  # ENH: Use myw_os_engine

    def backup(self, name, archive_file):
        """
        Store database NAME as archive_file
        """

        shutil.copyfile(name, archive_file)  # ENH: Use myw_os_engine

    def restore(self, name, archive_file):
        """
        Restore database NAME from archive_file
        """

        shutil.copyfile(archive_file, name)  # ENH: Use myw_os_engine
