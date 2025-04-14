################################################################################
# Abstract superclass for replication engines
################################################################################
# Copyright: IQGeo Limited 2010-2023

from abc import ABC, abstractmethod
import os, shutil, glob, fnmatch, tempfile
from datetime import datetime
from contextlib import contextmanager
import codecs, csv
from zipfile import ZipFile, ZIP_DEFLATED

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.tilestore.myw_tile_db import MywTileDB


def databaseType(db):
    """
    String giving database type ('non-initialised', 'master', 'extract' or 'replica')
    """

    db_type = db.setting("replication.replica_id") or "non-initialised"

    if fnmatch.fnmatch(db_type, "replica*"):
        db_type = "replica"

    return db_type


class MywReplicationEngine(ABC):
    """
    Abstract superclass for replication engines

    Provides helpers for loading data, putting/getting updates etc"""

    # Names of settings whose changes are not propagated in exports
    excluded_settings = [
        "replication.extract_type",  # These have different values in extract
        "replica_id",
        "replication.replica_id_hwm",  # These are specific to master DB
        "replication.replica_shard_lwm",
        "replication.sync_root",
        "replication.master_shard_max",
    ]

    def __init__(self, db, sync_engine=None, db_type=None, progress=MywProgressHandler()):
        """
        Init slots of self

        DB is a MywDatabase. If optional DB_TYPE is provided, asserts that DB
        is of that type ('master','extract' or 'replica')"""

        # Init slots
        self.db = db
        self.progress = progress
        self.os_engine = MywOsEngine(progress)

        # Get clean errors on Oracle
        if db.session.bind.dialect.name == "oracle":
            raise MywError(
                "Replication not supported for database type: " + db.session.bind.dialect.name
            )

        # Check type is as expected
        if db_type != None:
            self.assertDatabaseTypeIs(db_type)

        self.__data_dir = None  # lazily initialised in self.localRoot()

        self.sync_engine = sync_engine

    # ==============================================================================
    #                                ABSTRACT METHODS
    # ==============================================================================
    @abstractmethod
    def importUpdates(self, name_spec="*") -> int:
        """
        Import updates from the other part(s) of the replication system

        Returns the number of entities updated."""
        raise NotImplementedError()

    # ==============================================================================
    #                            CONFIG CHANGE PROPAGATION
    # ==============================================================================

    def exportConfigChanges(self, update_dir, base_cp_name, extract_filter):
        """
        Export pending configuration changes to UPDATE_DIR

        BASE_CP_NAME is checkpoint identifying last successful export"""

        output_dir = self.ensurePath(update_dir, "features")

        # Find version of last successful export
        since_version = self.db.dataVersionFor(base_cp_name)

        # Say what we are about to do
        self.progress(
            "starting", "Exporting configuration changes since version", since_version, "..."
        )
        n_changes = 0

        # Write setting changes
        self.progress("starting", "Exporting setting changes ...")
        setting_changes = self.db.configChanges("setting", since_version)
        n_recs = self.db.data_loader.dumpSettingChanges(
            output_dir, setting_changes, excludes=self.excluded_settings
        )
        self.progress("finished", "Wrote", n_recs, "setting definitions", configs=n_recs)
        n_changes += n_recs

        # Write datasource changes
        self.progress("starting", "Exporting datasource changes ...")
        datasource_changes = self.db.configChanges("datasource", since_version)
        n_recs = self.db.data_loader.dumpDatasourceChanges(output_dir, datasource_changes)
        self.progress("finished", "Wrote", n_recs, "datasource definitions", configs=n_recs)
        n_changes += n_recs

        # Write enumerator changes
        self.progress("starting", "Exporting enumerator changes ...")
        enum_changes = self.db.configChanges("dd_enum", since_version)
        n_recs = self.db.data_loader.dumpEnumeratorChanges(output_dir, enum_changes)
        self.progress("finished", "Wrote", n_recs, "enumerator definitions", configs=n_recs)
        n_changes += n_recs

        # Write feature type changes
        self.progress("starting", "Exporting feature type changes ...")
        feature_type_changes = self.db.configChanges("dd_feature", since_version)
        n_recs = self.db.data_loader.dumpFeatureTypeChanges(output_dir, feature_type_changes)
        self.progress("finished", "Wrote", n_recs, "feature type definitions", configs=n_recs)
        n_changes += n_recs

        # Write layer changes
        self.progress("starting", "Exporting layer changes ...")
        layer_changes = self.db.configChanges("layer", since_version)
        n_recs = self.db.data_loader.dumpLayerChanges(output_dir, layer_changes)
        self.progress("finished", "Wrote", n_recs, "layer definitions", configs=n_recs)
        n_changes += n_recs

        # Write layer group changes
        self.progress("starting", "Exporting layer group changes ...")
        layer_group_changes = self.db.configChanges("layer_group", since_version)
        n_recs = self.db.data_loader.dumpLayerGroupChanges(output_dir, layer_group_changes)
        self.progress("finished", "Wrote", n_recs, "layer group definitions", configs=n_recs)
        n_changes += n_recs

        # Write private layer changes
        self.progress("starting", "Exporting private layer changes ...")
        layer_changes = self.db.configChanges("private_layer", since_version)
        n_recs = self.db.data_loader.dumpPrivateLayerChanges(output_dir, layer_changes)
        self.progress("finished", "Wrote", n_recs, "private layer definitions", configs=n_recs)
        n_changes += n_recs

        # Write network changes
        self.progress("starting", "Exporting network changes ...")
        network_changes = self.db.configChanges("network", since_version)
        n_recs = self.db.data_loader.dumpNetworkChanges(output_dir, network_changes)
        self.progress("finished", "Wrote", n_recs, "network definitions", configs=n_recs)
        n_changes += n_recs

        # Write application changes
        self.progress("starting", "Exporting application changes ...")
        application_changes = self.db.configChanges("application", since_version)
        n_recs = self.db.data_loader.dumpApplicationChanges(output_dir, application_changes)
        self.progress("finished", "Wrote", n_recs, "application definitions", configs=n_recs)
        n_changes += n_recs

        # Write role changes
        self.progress("starting", "Exporting role changes ...")
        role_changes = self.db.configChanges("role", since_version)
        n_recs = self.db.data_loader.dumpRoleChanges(output_dir, role_changes)
        self.progress("finished", "Wrote", n_recs, "role definitions", configs=n_recs)
        n_changes += n_recs

        # Write user group changes
        self.progress("starting", "Exporting group changes ...")
        group_changes = self.db.configChanges("group", since_version)
        n_recs = self.db.data_loader.dumpGroupChanges(output_dir, group_changes)
        self.progress("finished", "Wrote", n_recs, "group definitions", configs=n_recs)
        n_changes += n_recs

        # Write table_set changes
        self.progress("starting", "Exporting table_set changes ...")
        table_set_changes = self.db.configChanges("table_set", since_version)
        n_recs = self.db.data_loader.dumpTableSetChanges(output_dir, table_set_changes)
        self.progress("finished", "Wrote", n_recs, "table_set definitions", configs=n_recs)
        n_changes += n_recs

        # Write local feature type definitions for extracted external feature types
        self.progress("starting", "Exporting local feature type changes ...")
        n_recs = 0
        for (ds_rec, feature_rec) in extract_filter.externalFeatureTypeChanges(
            self.db, feature_type_changes, layer_changes, table_set_changes
        ):
            local_feature_desc = self.db.dd.localFeatureTypeDescriptorFor(feature_rec)
            self.db.data_loader.dumpFeatureTypeDefinition(
                output_dir, local_feature_desc.definition(), with_datasource=True
            )
            n_recs += 1
        self.progress("finished", "Wrote", n_recs, "local feature type definitions", configs=n_recs)

        self.progress("finished", "Wrote", n_changes, "configuration changes")

    def loadConfigChanges(self, update_dir, suppress_change_tracking=False):
        """
        Load the condiguration files from update directory tree UPDATE_DIR

        If SUPPRESS_CHANGE_TRACKING is True, suppress creation of
        configuration log records"""

        with self.progress.operation("Loading configuration changes from", update_dir):

            with self.changeTrackingEnv(suppress_change_tracking):

                self.loadConfigFiles(update_dir, "features", "*.settings")
                self.loadConfigFiles(update_dir, "features", "*.datasource")
                self.loadConfigFiles(update_dir, "features", "*.enum")
                self.loadConfigFiles(update_dir, "features", "*.def")
                self.loadConfigFiles(update_dir, "features", "*.layer")
                self.loadConfigFiles(update_dir, "features", "*.layer_group")
                self.loadConfigFiles(update_dir, "features", "*.private_layer")
                self.loadConfigFiles(update_dir, "features", "*.network")
                self.loadConfigFiles(update_dir, "features", "*.application")
                self.loadConfigFiles(update_dir, "features", "*.role")
                self.loadConfigFiles(update_dir, "features", "*.group")
                self.loadConfigFiles(update_dir, "features", "*.table_set")

    def loadConfigFiles(self, update_dir, sub_dir, file_spec):
        """
        Load json files FILE_SPEC from UPDATE_DIR, reporting progress
        """

        # Find files to load
        full_file_spec = os.path.join(update_dir, sub_dir, file_spec)
        file_paths = glob.glob(
            str(full_file_spec)
        )  # unicode() forces glob to return unicode file names #  ENH Use os_engine

        # Load them (in repeatable order)
        # Note: Sort required becaused glob not ordered on Linux
        for file_path in sorted(file_paths):

            msg = n_processed = None

            self.progress("starting", "Loading", file_path, "...")
            try:
                (n_processed, msg) = self.db.data_loader.loadFile(file_path, update=True)
            finally:
                self.progress("finished", msg, records=n_processed)

    # ==============================================================================
    #                            FEATURE DATA CHANGE PROPAGATION
    # ==============================================================================

    def exportFeatureChanges(self, update_dir, base_cp_name, extract_filter, max_recs_per_file):
        """
        Export pending feature changes to UPDATE_DIR

        BASE_CP_NAME is checkpoint identifying last successful export
        EXTRACT_FILTER defines the region and tables to export (if any)."""

        output_dir = self.ensurePath(update_dir, "features")

        # Find version of last successful export
        since_version = self.db.dataVersionFor(base_cp_name)

        self.progress("starting", "Exporting feature changes since version", since_version, "...")

        # For each selected feature table ..
        n_ftrs = 0
        for feature_type in extract_filter.myworldFeatureTypes(self.db):

            # Find changed records
            self.progress(2, "Checking", feature_type, "...")
            changes = self.db.featureChanges(feature_type, since_version)

            # Dump them
            if changes:
                pred = extract_filter.regionPredicateFor(self.db, feature_type)

                n_ftrs += self.db.data_loader.dumpFeatureChanges(
                    output_dir,
                    feature_type,
                    changes,
                    pred=pred,
                    max_recs_per_file=max_recs_per_file,
                    file_format="csv",
                    file_options={"geom_encoding": "wkb"},
                )

        self.progress("finished", "Wrote", n_ftrs, "feature changes", features=n_ftrs)

    def loadFeatureChanges(
        self, update_dir, suppress_change_tracking=False, aggressive_commit=False
    ):
        """
        Load the feature data files from update directory tree UPDATE_DIR

        If SUPPRESS_CHANGE_TRACKING is True, suppress creation of
        transaction log records

        Optional AGGRESSIVE_COMMIT forces a commit after each file
        load (workaround for timing issue on sqlite DBs)"""

        # ENH: Investigate Fogbugz 6645 and remove AGGRESSIVE_COMMIT

        with self.progress.operation("Loading feature changes from", update_dir):

            # Find files to load
            full_file_spec = os.path.join(update_dir, "features", "*.csv")
            file_paths = glob.glob(
                str(full_file_spec)
            )  # unicode() forces glob to return unicode file names #  ENH Use os_engine

            # Load them (in repeatable order)
            # Note: Sort required becaused glob not ordered on Linux
            for file_path in sorted(file_paths):

                with self.progress.operation("Loading", file_path, "...") as stats:
                    msg = n_processed = None

                    with self.changeTrackingEnv(suppress_change_tracking):
                        (n_processed, msg) = self.db.data_loader.loadFile(
                            file_path, skip_bad_records=False
                        )

                    if aggressive_commit:
                        self.db.commit()  # Force SQLite to complete insert operation

                    self.progress(1, msg)
                    stats["n_processed"] = n_processed

    # ==============================================================================
    #                            FEATURE DELTA CHANGE PROPAGATION
    # ==============================================================================

    def exportDeltaChanges(self, update_dir, base_cp_name, extract_filter):
        """
        Export pending feature changes to UPDATE_DIR

        BASE_CP_NAME is checkpoint identifying last successful export
        EXTRACT_FILTER defines the region and tables to export (if any)."""

        output_dir = self.ensurePath(update_dir, "deltas")

        # Find version of last successful export
        since_version = self.db.dataVersionFor(base_cp_name)

        self.progress("starting", "Exporting delta changes since version", since_version, "...")

        # For each selected feature table ..
        n_ftrs = 0
        for feature_type in extract_filter.myworldFeatureTypes(self.db, versioned_only=True):

            # Find changed records
            self.progress(2, "Checking", feature_type, "...")
            delta_changes = self.db.deltaChanges(
                feature_type, since_version, "delta"
            )  # ENH: Merge these two calls?
            base_changes = self.db.deltaChanges(feature_type, since_version, "base")

            # Dump them
            if delta_changes or base_changes:
                pred = extract_filter.regionPredicateFor(self.db, feature_type)

                n_ftrs += self.db.data_loader.dumpDeltaChanges(
                    output_dir, feature_type, delta_changes, base_changes, pred=pred
                )

        self.progress("finished", "Wrote", n_ftrs, "delta changes", features=n_ftrs)

    def loadDeltaChanges(self, update_dir, suppress_change_tracking=False, aggressive_commit=False):
        """
        Load the delta data files from update directory tree UPDATE_DIR

        If SUPPRESS_CHANGE_TRACKING is True, suppress creation of
        transaction log records

        Optional AGGRESSIVE_COMMIT forces a commit after each file
        load (workaround for timing issue on sqlite DBs)"""

        with self.progress.operation("Loading delta changes from", update_dir):

            # Find files to load
            full_file_spec = os.path.join(update_dir, "deltas", "*.delta")
            file_paths = glob.glob(
                str(full_file_spec)
            )  # unicode() forces glob to return unicode file names #  ENH Use os_engine

            # Load them (in repeatable order)
            # Note: Sort required becaused glob not ordered on Linux
            for file_path in sorted(file_paths):

                with self.progress.operation("Loading", file_path, "...") as stats:
                    msg = n_processed = None

                    with self.changeTrackingEnv(suppress_change_tracking):
                        (n_processed, msg) = self.db.data_loader.loadFile(
                            file_path, skip_bad_records=False
                        )

                    if aggressive_commit:
                        self.db.commit()  # Force SQLite to complete insert operation

                    self.progress(1, msg)
                    stats["n_processed"] = n_processed

    # ==============================================================================
    #                            TILE DATA CHANGE PROPAGATION
    # ==============================================================================

    def exportTileChanges(self, update_dir, base_cp_name, extract_filter):
        """
        Export pending tile changes to UPDATE_DIR

        BASE_CP_NAME is checkpoint identifying last successful
        export. EXTRACT_FILTER defines the region and tile_files to export.

        Extracts a rectangular region of tiles, clipped to EXTRACT_FILTER region bounds"""

        # Note: Assumes no-one else is updating the tile files

        # Create output directory (if necessary)
        out_tile_dir = self.ensurePath(update_dir, "tiles")

        tile_file_mappings = extract_filter.tileFileMappings(self.db, out_tile_dir)

        # For each tile file ..
        for in_tile_file, out_tile_file in list(tile_file_mappings.items()):

            # Say what we are about to do
            self.progress(
                "starting", "Exporting tile changes from", in_tile_file, "..."
            )  # ENH: Better to give name of output file?

            # Get extraction options
            options = extract_filter.tileFileOptions(in_tile_file)
            bounds = extract_filter.regionBounds()

            # Open input
            tile_db = MywTileDB(in_tile_file, "u", progress=self.progress)
            since_version = tile_db.dataVersionFor(base_cp_name)

            # If anything to export ..
            if tile_db.hasChangesSince(since_version):  # ENH: Check for changes within bounds only

                # Open output
                self.progress("starting", "Creating", out_tile_file, "...")
                out_tile_db = MywTileDB(out_tile_file, "w", progress=self.progress)

                # Export changes
                n_tiles = out_tile_db.loadFromDB(
                    tile_db,
                    bounds=bounds,
                    clip=options["clip"],
                    min_zoom=options["min_zoom"],
                    max_zoom=options["max_zoom"],
                    since_version=since_version,
                )

                # ENH: Make tile_db a context manager
                out_tile_db.close()
                self.progress("finished", tiles=n_tiles)

            else:
                self.progress(1, "No changes to export")

            # Tidy up
            tile_db.close()

            self.progress("finished")

    def loadTileChanges(self, update_dir):
        """
        Load the tile files from update directory tree UPDATE_DIR
        """

        tile_file_spec = os.path.join(update_dir, "tiles", "*.sqlite")
        in_tile_files = glob.glob(
            str(tile_file_spec)
        )  # unicode() forces glob to return unicode file names #  ENH Use os_engine

        for in_tile_file in sorted(in_tile_files):

            n_tiles = None
            self.progress("starting", "Import tile changes from", in_tile_file, "...")
            try:

                # Find file to load data into
                basename = os.path.basename(in_tile_file)
                tile_db_file = self.db.tilestore().tileFile(basename)

                # Check for not found
                if not tile_db_file:
                    raise MywError("No such tilestore file: " + basename)

                # Open files
                in_tile_db = MywTileDB(in_tile_file, "r", progress=self.progress)
                tile_db = MywTileDB(tile_db_file, "u", progress=self.progress)

                # Import changes
                n_tiles = tile_db.loadFromDB(in_tile_db)

                # Tidy up
                in_tile_db.close()
                tile_db.close()

            finally:
                self.progress("finished", tiles=n_tiles)

    # ==============================================================================
    #                        VERSION STAMP CHANGE PROPAGATION
    # ==============================================================================

    def exportVersionStamps(self, update_dir, master_data_version):
        """
        Export master and replica version stamps to UPDATE_DIR

        These version stamps are used by replica to determine which
        version of the data they now have"""

        self.progress("starting", "Exporting version stamps...")

        # Get records to export
        master_rec = {
            "component": "master_data",
            "version": master_data_version,
            "date": datetime.utcnow(),
        }

        version_stamps = [master_rec]

        for replica_id in self.db.replicaNames():
            rec = self.db.versionStampRec(replica_id + "_data")

            if rec:
                props = {"component": rec.component, "version": rec.version, "date": rec.date}
                version_stamps.append(props)

        # Export them
        file_name = os.path.join(update_dir, "version_stamps.csv")
        self.writeCsvFile(file_name, ["component", "version", "date"], version_stamps)

        self.progress("finished", "Wrote", len(version_stamps), "version stamps")

    def loadVersionStamps(self, update_dir):
        """
        Import master and replica version stamps from UPDATE_DIR
        """

        self.progress("starting", "Loading versions stamps", "...")
        file_name = os.path.join(update_dir, "version_stamps.csv")
        version_stamps = self.readCsvFile(file_name)

        for rec in version_stamps:
            self.progress(1, "Setting version stamp:", rec["component"], rec["version"])
            self.db.setVersionStamp(rec["component"], rec["version"], rec["date"])

        self.progress("finished", "Imported", len(version_stamps), "version stamps")

    # ==============================================================================
    #                        CODE CHANGE PROPAGATION
    # ==============================================================================

    def exportCodeFile(self, update_dir, code_file):
        """
        Export code package CODE_FILE
        """

        with self.progress.operation("Exporting code file", code_file):
            out_file = os.path.join(update_dir, "code.zip")
            self.os_engine.copy_file(code_file, out_file)

    def loadCodeFile(self, update_dir):
        """
        Import code package (if it exists)
        """

        in_file = os.path.join(update_dir, "code.zip")

        if os.path.exists(in_file):
            out_dir = self.db.directory()
            out_file = os.path.join(out_dir, "code.zip")
            self.progress(1, "Updating", out_file)
            shutil.copy(in_file, out_file)

    # ==============================================================================
    #                               GENERAL HELPERS
    # ==============================================================================

    def assertDatabaseTypeIs(self, db_type):
        """
        Throws MywError unless self's database is of DB_TYPE
        """

        actual_db_type = self.databaseType()

        if actual_db_type != db_type:
            raise MywError(
                "{}({}) is not a {} database".format(self.db.name(), actual_db_type, db_type)
            )

    def databaseType(self):
        """
        String giving database type ('non-initialised', 'master', 'extract' or 'replica')
        """

        return databaseType(self.db)

    def setCheckpoints(self, cp_name):
        """
        Set checkpoint CP_NAME in all 'datasets' (database and all tile files)

        Returns version in main database"""

        with self.progress.operation("Setting checkpoint", cp_name):

            # Set in database
            db_version = self.db.setCheckpoint(cp_name)
            self.progress(2, "Setting checkpoint in", self.db.name(), "at version", db_version)

            # Set in tile files
            for tile_db_file in self.db.tilestore().tileFiles():
                self.progress(2, "Setting checkpoint in tile db", tile_db_file)
                tile_db = MywTileDB(tile_db_file, "u", progress=self.progress)
                tile_db.setCheckpoint(cp_name)
                tile_db.close()

        return db_version

    def repositionCheckpoints(self, cp_name, at_cp_name):
        """
        Reposition checkpoint CP_NAME in all 'datasets' (database and all tile files)
        """

        with self.progress.operation("Repositioning checkpoint", cp_name):

            # Set in database
            version = self.db.dataVersionFor(at_cp_name)
            self.progress(2, "Repositioning checkpoint in", self.db.name(), "to version", version)
            self.db.setCheckpoint(cp_name, version)

            # Set in tile files
            for tile_db_file in self.db.tilestore().tileFiles():
                self.progress(2, "Repositioning checkpoint in", tile_db_file)
                tile_db = MywTileDB(tile_db_file, "u", progress=self.progress)
                tile_db.setCheckpoint(cp_name, tile_db.dataVersionFor(at_cp_name))
                tile_db.close()

    # ==============================================================================
    #                                 UPDATE GET/PUT
    # ==============================================================================

    def localRoot(self):
        """
        Local directory for storing downloads and exports
        """

        # Get root location
        if not self.__data_dir:
            self.__data_dir = tempfile.mkdtemp(prefix="myw_")
            self.os_engine.ensure_exists(self.__data_dir)

        # Add database-specific bit
        # ENH: Assumes database is on this machine - hostname is safer
        return self.ensurePath(self.__data_dir, "sync", self.db.name())

    def pendingUpdates(self, since_id, *path):
        """
        Find updates to load from PATH since update SINCE_ID

        Returns set of full paths, keyed by update_id"""

        return self.sync_engine.pendingUpdates(since_id, *path)  # ENH: call direct?

    def pathToUpdate(self, update_id, *path):
        """
        Returns full path to an update file in the sync tree
        """

        # ENH: Check replica info init?
        sync_root = self.db.setting("replication.sync_root")
        dir_path = os.path.join(sync_root, *path)
        file_name = "{}.zip".format(update_id)

        return os.path.join(dir_path, file_name)

    def createExportDir(self, *sync_path):
        """
        Create local directory to export changes to
        """

        # Convert update ID to string
        to_string = lambda x: str(x)
        sync_path = list(map(to_string, sync_path))

        # Create directory
        update_dir = self.ensurePathEmpty(self.localRoot(), "exports", *sync_path)

        return update_dir

    def createSyncDir(self, *sync_path):
        """
        Create shared directory for storing updates

        Returns full path to directory"""

        sync_root = self.db.setting("replication.sync_root")

        update_dir = self.ensurePathEmpty(sync_root, *sync_path)

        return update_dir

    def putUpdate(self, update_dir, *sync_path):
        """
        Zip directory UPDATE_DIR and copy it to the sync directory

        SYNC_PATH identifies the location to uplaod to e.g. ['master', 'full', 1]"""

        # Get name for zip file
        local_dir = os.path.dirname(update_dir)
        zip_file_name = str(sync_path[-1]) + ".zip"
        zip_file = os.path.join(local_dir, zip_file_name)

        # Zip the update
        self.zipTree(zip_file, update_dir)

        # Upload zip file to sync directory
        self.sync_engine.uploadFile(sync_path[:-1], local_dir, zip_file_name)

        # Tidy up
        self.removeFile(zip_file)

    def getUpdate(self, *sync_path):
        """
        Get an update from the sync directory (if necessary)

        SYNC_PATH identifies the update to download e.g. ['master', 'full', 1]

        Returns path to directory created"""

        # Convert update ID to string
        # ENH: Add helper to do this
        to_string = lambda x: str(x)
        sync_path = list(map(to_string, sync_path))

        # If something we exported .. just use that
        export_dir = os.path.join(self.localRoot(), "exports", *sync_path)
        if os.path.exists(export_dir):
            return export_dir
        else:
            return self.downloadUpdate(*sync_path)

    def downloadUpdate(self, *sync_path):
        """
        Get an update from the sync directory and unpack it to a local directory

        SYNC_PATH identifies the update to download e.g. ['master', 'full', 1]

        Returns path to directory created"""

        # Convert update ID to string
        to_string = lambda x: str(x)
        sync_path = list(map(to_string, sync_path))

        # Get name of file to download
        local_root = self.ensurePath(self.localRoot(), "downloads", *sync_path[:-1])
        update_id = sync_path[-1]
        zip_file_name = update_id + ".zip"

        # Down the zip file
        local_zip_file = self.sync_engine.downloadFile(sync_path[:-1], local_root, zip_file_name)

        # Extract contents
        self.progress(3, "Unpacking", local_zip_file)
        update_dir = os.path.join(local_root, update_id)
        self.unzipTree(local_zip_file, update_dir)

        # Tidy up
        self.removeFile(local_zip_file)

        return update_dir

    def deleteSyncDir(self, *sync_path):
        """
        Remove shared directory for storing updates
        """

        sync_root = self.db.setting("replication.sync_root")

        path = os.path.join(sync_root, *sync_path)

        self.removeTree(path)

    # ==============================================================================
    #                                FILE OPERATIONS
    # ==============================================================================

    def writeCsvFile(self, file_name, field_names, rows):
        """
        Write ROWS as CSV, handling time formatting etc
        """

        # ENH: Duplicated with myw_record_mixin
        timestamp_format = "%Y-%m-%dT%H:%M:%S.%f"

        encoding = "utf-8"

        with open(file_name, "w", encoding=encoding, newline="") as strm:
            writer = csv.DictWriter(strm, fieldnames=field_names)
            writer.writeheader()

            for row in rows:

                # Perform conversions
                temp_row = {}
                for field_name, value in list(row.items()):
                    if isinstance(value, datetime):
                        value = datetime.strftime(value, timestamp_format)
                    temp_row[field_name] = value

                writer.writerow(temp_row)

    def readCsvFile(self, file_name):
        """
        Read a CSV file, using header information

        Returns a list of dicts"""

        rows = []
        encoding = "utf-8"

        with codecs.open(file_name, "r", encoding=encoding) as strm:

            reader = csv.DictReader(strm)

            for row in reader:

                # Perform conversions
                for prop, value in list(row.items()):
                    if value == "":
                        row[prop] = None

                rows.append(row)

        return rows

    def zipTree(self, zipfile_path, update_dir):
        """
        Package the contents of UPDATE_DIR into ZIPFILE_PATH

        Recursively adds all files using relative paths. Replaces
        existing zipfile if it exists"""

        # ENH: Delegate to os_engine

        self.progress("starting", "Creating", zipfile_path)

        with ZipFile(zipfile_path, "w", ZIP_DEFLATED) as zipfile:

            update_dir = str(update_dir)  # Forces os.walk() to return unicode strings

            for dir, sub_dirs, file_names in os.walk(update_dir):
                sub_dirs.sort()
                for file_name in sorted(file_names):

                    file_path = os.path.join(dir, file_name)
                    rel_path = file_path[len(update_dir) + len(os.sep) :]

                    self.progress(1, "Adding file", rel_path)

                    zipfile.write(file_path, rel_path)

        self.progress("finished")

    def unzipTree(self, zipfile_path, update_dir):
        """
        Unpack the contents of ZIPFILE_PATH into UPDATE_DIR

        Replaced existing UPDATE_DIR if there is one"""

        # Remove any existing directory
        if os.path.exists(update_dir):
            self.removeTree(update_dir)

        # Unpack zip file
        with ZipFile(zipfile_path, "r") as zip_file:
            zip_file.extractall(update_dir)

    def ensurePathEmpty(self, root, *dirs):
        """
        Create directory tree DIRS (if necessary), wiping any existing dir

        Returns path to tree"""

        path = self.ensurePath(root, *dirs)

        # Ensure directory is empty
        # ENH: Find a better way!
        self.removeTree(path)
        self.ensurePath(root, *dirs)

        self.progress(5, "Initialised", path)

        return path

    def ensurePath(self, root, *dirs):
        """
        Create directory tree DIRS (if necessary)

        Returns path to tree"""

        # ENH: Duplicated with sync_engine

        path = root

        for dir in dirs:
            path = os.path.join(path, dir)
            if not os.path.exists(path):
                self.progress(6, "Creating directory", path)
                os.mkdir(path)
                # Tweak the permissions on this directory
                # When this code is executed in the web server, the directory is owned by
                # "apacheuser". Giving group write access allows users that are in "apache"
                # group to modify that directory.
                try:
                    os.chmod(path, 0o775)
                except Exception as cond:
                    self.progress(6, "Unable to change permissions on path", path)

        return path

    def removeFile(self, file_path):
        """
        Delete a file
        """

        self.progress(5, "Deleting file", file_path)
        os.remove(file_path)

    def removeTree(self, dir_path):
        """
        Delete a directory tree
        """

        self.progress(5, "Deleting tree", dir_path)
        shutil.rmtree(str(dir_path), True)  # Unicode() ensures char16 file names handled correctly

    # ==============================================================================
    #                                  HELPERS
    # ==============================================================================

    @contextmanager
    def changeTrackingEnv(self, suppress):
        """
        Context manager to suppress database change tracking (if requested)

        Warning: Code within the context MUST NOT commit"""

        # ENH: Move to MywDatabase?
        # ENH: Set flag on MywDatabase to prevent commit

        data_version = self.db.versionStamp("data")

        if suppress:
            self.db.deleteVersionStamp("data")
            self.db.session.flush()  # Ensures triggers see the change

        try:
            yield

        finally:
            if suppress:
                self.db.setVersionStamp("data", data_version)
                self.db.session.flush()
