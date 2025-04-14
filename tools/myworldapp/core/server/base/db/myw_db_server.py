################################################################################
# Engine for communicating with a PostgreSQL server
################################################################################
# Copyright: IQGeo Limited 2010-2023

from abc import ABC, abstractmethod
import os

from sqlalchemy.engine import create_engine, engine_from_config
from sqlalchemy.orm import sessionmaker

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.db.globals import Session, init_session


class MywDbServer(ABC):
    """
    Abstarct superclass for low level server engines

    Provides facilities for creating, deleting and opening databases

    Subclasses must implement:
      connectSpecFor(db_name, **kwargs)
      exists(name)
      create(name,template,schema_only)
      drop(name)
      backup(name,archive_file)
      restore(name,archive_file)
      updateStatistics(name)"""

    @abstractmethod
    def connectSpecFor(self, db_name, **kwargs):
        raise NotImplementedError()

    @abstractmethod
    def updateStatistics(self, name):
        raise NotImplementedError()

    @staticmethod
    def mywDatabaseNameFor(db_engine):
        """
        Returns the database name (in myWorld terms).

        DB_ENGINE is a SQLAlchemy database engine
        """

        # ENH: Move to drivers

        return db_engine.url.database

    @staticmethod
    def mywConnectSpecFor(db_engine):
        """
        Build myw_db-style connect spec for database DB_ENGINE

        Returns a list of strings"""

        # ENH: Move to drivers

        url = db_engine.url
        if db_engine.dialect.name == "postgresql":
            username = url.username
            host = url.host
        else:
            # Oracle
            if url.database:
                username = url.database  # Looks odd, but is correct for Oracle
                host = url.host
            else:
                # url.host is actually a TNSNAME
                # don't set arguments to let the server use environment variables
                username = None
                host = None

        args = []
        if username:
            args.extend(["--username", username])
        if url.password:
            args.extend(["--password", url.password])
        if host:
            args.extend(["--host", host])
        if url.port:
            args.extend(["--port", str(url.port)])

        return args

    @staticmethod
    def urlFor(db_engine, hideCredentials=False):
        """
        Returns url for database DB_ENGINE
        hideCredentials=True will obscure username, and password is returned URL

        Returns SQLAlchemy URL object"""

        import copy

        url = copy.copy(db_engine.url)
        if hideCredentials:
            url = url.set(username="***", password="***")

        return url

    @staticmethod
    def newFor(db_type=None, **args):
        """
        Returns an instance of the MywDbDriver subclass appropriate for the underlying database of SESSION
        """
        db_type = db_type or os.getenv("MYW_DB_TYPE") or "postgres"

        if db_type == "postgres":
            from .myw_postgres_db_server import MywPostgresDbServer

            return MywPostgresDbServer(**args)

        elif db_type == "sqlite":
            from .myw_sqlite_db_server import MywSqliteDbServer

            return MywSqliteDbServer(**args)

        else:
            raise Exception("Database type not supported: " + db_type)

    def __init__(self, progress):
        """
        Init slots of self
        """

        self.progress = progress or MywProgressHandler()

        # ENH: Find a cleaner way
        self.echo_sql = hasattr(progress, "level") and progress.level > 15

    def openSession(self, db_name, isolation_level=None):
        """
        Open database and initialise the SQLAlchemy global session

        Returns the global session"""

        # Build connect spec
        connect_spec = self.connectSpecFor(db_name)
        self.progress(
            1, "Opening database", self.connectSpecFor(db_name, hideCredentials=True), "..."
        )

        # Open database and init pyramid
        config = {}
        config["sqlalchemy.url"] = connect_spec
        engine = engine_from_config(config, "sqlalchemy.", echo=self.echo_sql)

        # Init models, set driver
        self.progress(7, "Initialising sqlalchemy")
        self.prepareForConnect(engine)

        if isolation_level:
            connection = engine.connect()
            init_session(Session, connection)
            connection.execution_options(isolation_level=isolation_level)
        else:
            init_session(Session, engine)

        # Set progress reporter
        Session.myw_db_driver.progress = self.progress  # pylint: disable=no-member

        return Session

    def openSecondarySession(self, db_name):
        """
        Connect to an additional database DB_NAME

        Returns a SQLAlchemy session

        Warning: Result shared exemplars with the primary database
        .. so must have the same data model"""
        # ENH: Support different data models by using a different declarative_base instance

        connect_spec = self.connectSpecFor(db_name)
        self.progress(
            2, "Opening database", self.connectSpecFor(db_name, hideCredentials=True), "..."
        )

        # Open SQLAlchemy session
        engine = create_engine(connect_spec, echo=self.echo_sql)
        sm = sessionmaker(bind=engine)
        session = sm()

        # Init models, set driver
        self.progress(7, "Initialising sqlalchemy")
        self.prepareForConnect(engine)
        init_session(session, session.bind)

        # Set progress reporter
        session.myw_db_driver.progress = self.progress

        return session

    def prepareForConnect(self, engine):
        """
        Called before connecting SQLAlchemy engine ENGINE

        Gets subclassed in sqlite server (for spatialite int)"""

        pass

    def run_subprocess(self, cmd, filter=None, env_vars=None, log_output_level=1):
        """
        Helper to run a shell command

        FILTER            a proc to filter the output from the spawned child process
        ENV_VARS          a dictionary of environment variable overrides
        LOG_OUTPUT_LEVEL  level at which the sub-process output is logged (Default=1)
        """
        os_eng = MywOsEngine(progress=self.progress)
        return os_eng.run(*cmd, env=env_vars, log_output_level=log_output_level, filter=filter)
