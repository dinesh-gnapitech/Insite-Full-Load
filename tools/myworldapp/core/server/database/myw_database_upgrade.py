################################################################################
# Superclass for module database upgrades
################################################################################
# Copyright: IQGeo Limited 2010-2023
import os, glob
from myworldapp.core.server.base.core.myw_error import *
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.system.myw_localiser import MywLocaliser
from myworldapp.core.server.base.db_schema.myw_db_upgrade import MywDbUpgrade

from .myw_database import MywDatabase


class MywDatabaseUpgrade(MywDbUpgrade):
    """
    Abstract superclass for non-core database upgrades

    Extends MywDbUpgrade to provide an extra properties
    .module and .db (a MywModule and MywDatabase). Also provides
    locatisation services (see .loadResourceFile() and .localiser)

    Sub-classes must implement:
      .module_name        Name of module to which upgrade relates
      .from_version       Minimum version stamp from which self can upgrade
      .updates            List of methods to run, keyed by datamodel version no
      .supports_dry_run   True if all changes can be made in a single transaction
      .resource_dir       Location for resource files"""

    # Abstract members, must be given sensible values in derived classes.
    module_name = ""
    resource_dir = ""

    def __init__(self, session, progress=MywProgressHandler(), lang=None, encoding=None):
        """
        Init slots of self

        Optional LANG is a language identifier for localising
        configuration files during install (see
        .loadResourceFile()). If not provided, the system language
        setting is used"""

        # Init super
        super(MywDatabaseUpgrade, self).__init__(session, progress, lang)

        # Init self
        self.module = MywProduct().module(self.module_name)
        self.db = MywDatabase(self.session, progress=self.progress)

        # Build localisation engine
        self.localiser = MywLocaliser(
            self.lang, self.module.name, self.module.path, encoding=encoding
        )

    def resourceFile(self, *path):
        """
        The full path to self's resource file PATH
        """

        return os.path.join(self.resource_dir, *path)

    def loadResourceFiles(self, *file_spec, **kwargs):
        """
        Load configuration or data files from self's resources directory

        FILE_SPEC is a glob-style specification relative to self.resource_dir."""

        full_file_spec = os.path.join(self.resource_dir, *file_spec)

        return self.loadFiles(full_file_spec, **kwargs)

    def loadFiles(self, file_spec, **kwargs):
        """
        Load configuration or data files FILE_SPEC

        FILE_SPEC is a glob-style specification relative to self.resource_dir.
        KWARGS are as for MywDataLoader.loadFile()

        By default, localises messages in configuration files using self's localiser"""

        self.progress(3, "Loading files:", file_spec)

        file_names = glob.glob(str(file_spec))

        for file_name in sorted(file_names):
            self.loadFile(file_name, **kwargs)

    def loadFile(self, file_name, **kwargs):
        """
        Load a configuration or data file

        FILE_NAME is a path relative to self.resource_dir.
        KWARGS are as for MywDataLoader.loadFile()

        By default, localises messages in configuration files using self's localiser"""

        if not "localiser" in kwargs:
            kwargs["localiser"] = self.localiser

        path = os.path.join(self.resource_dir, file_name)

        self.db.data_loader.loadFile(path, **kwargs)
