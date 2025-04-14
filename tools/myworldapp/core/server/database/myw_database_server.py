################################################################################
# Engine for communicating with a PostgreSQL server
################################################################################
# Copyright: IQGeo Limited 2010-2023

import warnings

from sqlalchemy import exc

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.db.myw_db_server import MywDbServer


class MywDatabaseServer:
    """
    High level engine for communicating with a database server

    Provides facilities for creating, deleting and opening databases

    Internally, most work is delegated to MywDbServer. This
    class provided mainly to isolate MywDbServer from model."""

    def __init__(self, db_type=None, progress=MywProgressHandler(), **args):
        """
        Returns an server engine connecting using ARGS

        For a definition of supported args, see MywDbServer"""

        # Init slots
        self.db_server = MywDbServer.newFor(db_type=db_type, progress=progress, **args)

        self.progress = progress

        # Get connect info
        # ENH: better to expose db_server?
        self.host = self.db_server.host
        self.port = self.db_server.port

    def open(self, db_name, isolation_level=None):
        """
        Open database and initialise SQLAlchemy session (for using model etc)

        Database must exist and have myWorld data model installed

        Returns a MywDatabase object"""

        # Suppressing warnings about field type 'geometry' ...
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=exc.SAWarning)

            # Open database
            session = self.db_server.openSession(db_name, isolation_level=isolation_level)

            # Create database object
            # Note: This can only be imported once the database is open
            self.progress(7, "Loading models")
            from myworldapp.core.server.database.myw_database import MywDatabase

            self.progress(7, "Initialising database")
            db = MywDatabase(session, progress=self.progress)

            self.progress(7, "Initisation complete")

            return db

    def openSecondary(self, db_name):
        """
        Connect to an additional database DB_NAME

        Returns a MywRawDatabase
        """

        session = self.db_server.openSecondarySession(db_name)

        # Create database object
        # Note: This can only be imported once the database is open
        self.progress(7, "Initialising database")
        from myworldapp.core.server.database.myw_raw_database import MywRawDatabase

        return MywRawDatabase(session, progress=self.progress)

    def openSession(self, db_name, isolation_level=None):
        """
        Open database and initialise the SQLAlchemy global session (~= transaction)

        Returns the global session"""

        return self.db_server.openSession(db_name, isolation_level=isolation_level)

    # ==============================================================================
    #                             BASIC OPERATIONS
    # ==============================================================================

    def connectSpecFor(self, db_name, **kwargs):
        """
        Build the SQLAlchemy connect spec from parameters specified in self.args

        Gets backstop values for password etc from environment (if necessary)
        """

        return self.db_server.connectSpecFor(db_name, **kwargs)

    def exists(self, name):
        """
        True if a database called name exists
        """

        return self.db_server.exists(name)

    def create(self, name, template=None, schema_only=False):
        """
        Create database NAME (which must not already exist).
        TEMPLATE specifies a template database to use.
        If SCHEMA_ONLY then create the schema only.

        Note: Requires exclusive access to TEMPLATE (unless SCHEMA_ONLY)"""

        return self.db_server.create(name, template=template, schema_only=schema_only)

    def drop(self, name):
        """
        Drop database NAME (which must exist)
        """

        return self.db_server.drop(name)

    def backup(self, name, archive_file):
        """
        Store database NAME as archive_file
        """

        return self.db_server.backup(name, archive_file)

    def restore(self, name, archive_file):
        """
        Restore database NAME from archive_file
        """

        return self.db_server.restore(name, archive_file)

    def updateStatistics(self, name):
        """
        Analyse database gathering statistics to improve query performance
        """

        return self.db_server.updateStatistics(name)
