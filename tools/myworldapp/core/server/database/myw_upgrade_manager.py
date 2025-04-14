################################################################################
# MywUpgradeManager
################################################################################
# Copyright: IQGeo Limited 2010-2023

import sys

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.system.myw_product import MywProduct


class MywUpgradeManager:
    """
    Engine for loading database upgrades
    """

    def __init__(self, progress=MywProgressHandler()):
        """
        Init slots of self
        """

        self.product = MywProduct()
        self.progress = progress
        self.os_engine = MywOsEngine(self.progress)

    # ==============================================================================
    #                                 ENGINE LOADING
    # ==============================================================================

    def installationEnginesFor(self, module_name):
        """
        Upgrade engines to perform the installion for MODULE_NAME

        Returns an ordered list of database upgrade engines"""

        engines = []

        # Add the installer
        install_engine = self.engineFor(module_name)
        if install_engine == None:
            raise MywError("No installer for module:", module_name)

        engines = [install_engine]

        # Add any later upgrades
        for upgrade_id in self.upgradesIn(module_name):
            engine = self.engineFor(module_name, upgrade_id)

            if engine.to_version() > install_engine.to_version():
                engines.append(engine)

        return engines

    def engineFor(self, module_name, upgrade_id=None):
        """
        Load upgrade engine UPGRADE_ID from MODULE_NAME

        If UPGRADE_ID is None, return the install engine

        Returns the class object (if there is one)"""

        module = self.product.module(module_name, check_exists=True)

        # Build name of python file and class
        python_module_name = self.pythonModuleNameFor(module_name, upgrade_id)
        class_name = self.engineClassFor(python_module_name)

        # Build full path to module
        # ENH: Delegate to module?
        if module_name == "core":
            python_module_path = "myworldapp.core.server.base.db_schema.{}".format(
                python_module_name
            )
        else:
            python_module_path = "myworldapp.modules.{}.server.db_schema.{}".format(
                module_name, python_module_name
            )

        # Load the module
        # ENH: Delegate to product?
        try:
            self.progress(3, "Compiling:", python_module_path)
            __import__(python_module_path)
            python_module = sys.modules[python_module_path]

        except ImportError as cond:
            self.progress(7, "Compile failed:", cond)
            if not str(cond).endswith(python_module_name):
                raise
            return None

        # Get the engine class
        self.progress(3, "Finding class:", class_name)
        engine = getattr(python_module, class_name)

        # Check for upgrade module doesn't match location
        # ENH: Derive name automatically
        if module_name != "core" and engine.module_name != module_name:
            raise MywError(engine, "is for module:", engine.module_name)

        return engine

    def upgradesIn(self, module_name):
        """
        The IDs of the upgrade engines in MODULE_NAME
        """

        module = self.product.module(module_name)

        if module_name == "core":
            upgrades_dir = module.file("server", "base", "db_schema")
        else:
            upgrades_dir = module.file("server", "db_schema")

        file_spec = self.pythonModuleNameFor(module_name, "*") + ".py"

        ids = []
        for file_name in self.os_engine.find_files(upgrades_dir, file_spec):
            id = file_name.split("_")[-1][:-3]
            ids.append(id)

        return sorted(ids)

    def pythonModuleNameFor(self, module_name, upgrade_id=None):
        """
        The basename of python file for the specified install/upgrade engine
        """

        prefix = "myw_db" if module_name == "core" else module_name + "_database"

        if upgrade_id == None:
            return "{}_install".format(prefix)
        else:
            return "{}_upgrade_{}".format(prefix, upgrade_id)

    def engineClassFor(self, python_module_name):
        """
        The class name expected in PYTHON_MODULE_NAME
        """
        words = python_module_name.replace("-", "_").split("_")
        return "".join(w.title() for w in words)

    # ==============================================================================
    #                                  CORE INSTALLATION
    # ==============================================================================

    def coreVersion(self):
        """
        The core version that self will create
        """

        last_upgrade = self.installationEnginesFor("core")[-1]

        return last_upgrade.to_version()

    def installCore(self, session, stop_before, lang=None, encoding=None):
        """
        Install the myWorld core datamodel and predefined feature types

        SESSION is a SQLAlchemy session
        """

        # Deal with defaults
        if not lang:
            lang = "en"

        # Create data model
        with self.progress.operation("Creating system tables..."):

            for upgrade in self.installationEnginesFor("core"):
                upgrade(session, lang=lang, progress=self.progress, encoding=encoding).run(
                    stop_before=stop_before
                )

        # Install default layers, feature types, etc
        from myworldapp.core.server.database.myw_database import MywDatabase

        db = MywDatabase(session, self.progress)

        with self.progress.operation("Installing initial configuration..."):
            self.engineFor("core").install_default_configuration(db, lang, encoding)

    # ==============================================================================
    #                                  MODULE INSTALLATION
    # ==============================================================================

    def installModule(self, module, session, stop_before, lang=None, encoding=None):
        """
        Install the myWorld core datamodel and predefined feature types

        SESSION is a SQLAlchemy session

        LANG defaults to the language used when core was installed (DB setting 'language')"""

        with self.progress.operation("Installing", module):

            for engine_class in self.installationEnginesFor(module):
                engine = engine_class(session, self.progress, lang, encoding)
                engine.run(stop_before=stop_before, dry_run=False)
