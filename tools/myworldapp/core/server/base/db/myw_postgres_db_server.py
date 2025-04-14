################################################################################
# Engine for communicating with a PostgreSQL server
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os, re, tempfile

from myworldapp.core.server.base.core.myw_error import MywError
from .myw_db_server import MywDbServer


class MywPostgresDbServer(MywDbServer):
    """
    Engine for communicating with a PostgreSQL server

    Provides facilities for creating, deleting and opening databases"""

    def __init__(
        self, host=None, port=None, username=None, password=None, progress=None, encryption_key=None
    ):
        """
        Init slots of self

        HOST, PORT, USERNAME and PASSWORD are the server connection parameters.
        If not given, values are taken from environment"""

        super(MywPostgresDbServer, self).__init__(progress)

        self.host = host or os.getenv("MYW_DB_HOST") or "localhost"
        self.port = port or os.getenv("MYW_DB_PORT") or os.getenv("PGPORT") or 5432
        self.username = (
            username or os.getenv("MYW_DB_USERNAME") or os.getenv("PGUSER") or "postgres"
        )
        self.password = password or os.getenv("MYW_DB_PASSWORD")

    def connectSpecFor(self, db_name, hideCredentials=False):
        """
        Build the SQLAlchemy connect spec from parameters specified in self.args

        Gets backstop values for password etc from environment (if necessary)
        If hideCredentials is True, then username and password will not be shown
        """

        # Prompt for password (if necessary) (and remember for future)
        if not self.password:
            self.password = input("Password for postgres user '{}': ".format(self.username))

        return "postgresql://{}:{}@{}:{}/{}".format(
            "***" if hideCredentials else self.username,
            "***" if hideCredentials else self.password,
            self.host,
            self.port,
            db_name,
        )

    def updateStatistics(self, name):
        self.run_psql_command("ANALYSE", db_name=name)

    # ==============================================================================
    #                             BASIC OPERATIONS
    # ==============================================================================
    # These require the psql tool in the path

    def exists(self, name):
        """
        True if a database called name exists
        """

        sql = "SELECT 1 from pg_database WHERE datname='{}'".format(name)

        output = self.run_psql_command(sql)

        return re.match(".*\(1 row\).*", output.replace("\n", "")) != None

    def create(self, name, template=None, schema_only=False):
        """
        Create database NAME (which must not already exist).
        TEMPLATE specifies a template database to use.
        If SCHEMA_ONLY then create the schema only.

        Note: Requires exclusive access to TEMPLATE (unless SCHEMA_ONLY)"""

        # Create the database
        sql = 'CREATE DATABASE "{}"'.format(name)
        if template and not schema_only:
            sql += ' TEMPLATE "{}"'.format(template)
        self.run_psql_command(sql)

        # Add postgis
        sql = "CREATE EXTENSION IF NOT EXISTS postgis"
        self.run_psql_command(sql, name)

        # Copy the schema from the template database (if requested)
        if template and schema_only:

            temp_dir = tempfile.mkdtemp()
            schema_file_name = os.path.join(temp_dir, "{}_schema.pg".format(template))

            self.progress(5, "Copying schema from database", template)
            self.dumpSchema(template, schema_file_name)
            self.loadSchema(name, schema_file_name)

            os.remove(schema_file_name)
            os.rmdir(temp_dir)

    def dumpSchema(self, db_name, file_name):
        """
        Save schema of database DB_NAME to FILE_NAME
        """

        self.run_postgres_command("pg_dump", "-s", "--format", "c", "--file", file_name, db_name)

    def loadSchema(self, db_name, file_name, schema=None):
        """
        Restore schema into database DB_NAME from FILE_NAME

        If optional SCHEMA is given, just restore that schema"""

        if schema:

            self.run_postgres_command(
                "psql", "--dbname", db_name, "-c", "DROP SCHEMA " + schema + " CASCADE"
            )

            self.run_postgres_command("psql", "--dbname", db_name, "-c", "CREATE SCHEMA " + schema)

            self.run_postgres_command(
                "pg_restore", "-s", "--dbname", db_name, "--schema", schema, file_name
            )
        else:
            self.run_postgres_command("pg_restore", "-s", "--dbname", db_name, file_name)

    def drop(self, name):
        """
        Drop database NAME (which must exist)
        """

        sql = 'DROP DATABASE "{}"'.format(name)
        self.run_psql_command(sql)

    def backup(self, name, archive_file):
        """
        Store database NAME as archive_file
        """

        self.run_postgres_command(
            "pg_dump", "--dbname", name, "--file", archive_file, "--format", "custom"
        )

    def restore(self, name, archive_file):
        """
        Restore database NAME from archive_file
        """

        self.run_postgres_command("pg_restore", "--no-owner", "--dbname", name, archive_file)

    def run_psql_command(self, sql, db_name=None):
        """
        Helper to run SQL command via the PostgreSQL psql utility

        Required because SQLAlchemy .execute() runs command in
        transaction .. but some SQL operations require non-transaction env"""

        cmd = ["psql", "-c", sql]

        if db_name:
            cmd += ["--dbname", db_name]

        return self.run_postgres_command(*cmd)

    def run_postgres_command(self, *cmd):
        """
        Helper to run PostgreSQL utility
        """

        # Build command to run
        cmd = list(cmd)
        cmd[1:1] += ["--host", self.host, "--port", str(self.port), "--username", self.username]

        # Build environment to run it in
        env_vars = {}
        if self.password:
            env_vars["PGPASSWORD"] = str(self.password)

        # Say what we are about to do
        self.progress(6, "Running postgres command:", *cmd)

        # Run it
        try:
            output = self.run_subprocess(cmd, env_vars=env_vars, log_output_level=1000)

        except MywError as cond:
            raise MywError(self.filter_psql_output(str(cond)))

        return self.filter_psql_output(output)

    def filter_psql_output(self, output):
        """
        Filters rubbish from output of a psql command
        """

        filter = 'could not find a "psql".* | ^\s*$'

        lines = output.splitlines()

        filtered_lines = []
        for line in lines:
            if not re.match(filter, line):
                filtered_lines.append(line)

        return "\n".join(filtered_lines)
