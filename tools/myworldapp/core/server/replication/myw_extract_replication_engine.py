################################################################################
# Engine for performing replication operations on extract database
################################################################################
# Copyright: IQGeo Limited 2010-2023

import glob
import json
import os
from collections import OrderedDict
from zipfile import ZipFile, ZIP_DEFLATED

from myworldapp.core.server.base.core.myw_error import MywError
from .myw_replication_engine import MywReplicationEngine

from .myw_direct_sync_engine import MywDirectSyncEngine
from .myw_http_sync_engine import MywHttpSyncEngine


class MywExtractReplicationEngine(MywReplicationEngine):
    """
    Engine for performing replication operations on a extract database
    """

    def __init__(
        self,
        db,
        remote_username=None,
        remote_password=None,
        ignore_sync_url=False,
        db_type=None,
        **opts,
    ):
        """
        Init slots of self

        DB is a MywDatabase. Optional USERNAME and PASSWORD are for
        connecting to master (define a myworld user or postgres
        user, depending on sync method)

        See super for details of opts"""

        # Deal with defaults
        remote_username = remote_username or os.getenv("MYW_REMOTE_USERNAME")
        remote_password = remote_password or os.getenv("MYW_REMOTE_PASSWORD") or ""

        # Get replication parameter from database
        sync_url = db.setting("replication.sync_url")
        sync_root = db.setting("replication.sync_root")
        master_connect_spec = db.setting("replication.master_connect_spec")

        # Create engine for file upload/download
        if sync_url and not ignore_sync_url:
            sync_engine = MywHttpSyncEngine(sync_url, remote_username, remote_password)
        else:
            master_connect_spec["username"] = remote_username
            master_connect_spec["password"] = remote_password
            sync_engine = MywDirectSyncEngine(sync_root, master_connect_spec)

        # Init super
        super(MywExtractReplicationEngine, self).__init__(
            db, sync_engine=sync_engine, db_type=db_type, **opts
        )

        sync_engine.progress = self.progress

    # ==============================================================================
    #                                OPERATIONS
    # ==============================================================================

    def importUpdates(self, name_spec="*"):
        """
        Update database and tilestore to the latest master data version

        Returns number of updates imported"""

        with self.progress.operation(
            "Updating extract", self.db.setting("replication.extract_type")
        ):
            n_loaded = self.importMasterUpdates()
            self.db.commit()

        return n_loaded

    def importMasterUpdates(self):
        """
        Update database and tilestore to the latest master data version

        Checks sync area for available master updates, loads
        those not already applied.

        Returns number of updates imported"""

        # Build location to check for updates
        sync_root = self.db.setting("replication.sync_root")
        extract_type = self.db.setting("replication.extract_type")

        # Get current version of master data
        master_id = self.db.versionStamp("master_update")

        # Get list of available updates
        self.progress("starting", "Checking for master updates since", extract_type, master_id)
        updates = self.pendingUpdates(master_id, "master", extract_type)
        self.progress("finished")

        # Check for nothing to do
        if not updates:
            self.progress(1, "Database is already at latest master version")
            return 0

        # Say what we are about to do
        self.progress(1, "Found", len(updates), "master updates to load")

        # For each update (in sequence order) ..
        n_loaded = 0
        for update_id in sorted(updates.keys()):

            self.progress("starting", "Loading master update", extract_type, update_id)

            # Check for missing update
            expected_id = master_id + 1
            if update_id != expected_id:
                raise MywError(
                    "Update sequence error: Expected {} : Got {}".format(expected_id, update_id)
                )

            # Load the update
            self.importMasterUpdate(extract_type, update_id)
            master_id = update_id
            n_loaded += 1

            # Record that we've processed the update
            # ENH: Do in same transaction as the feature load
            self.db.setVersionStamp("master_update", update_id)
            self.db.commit()

            self.progress("finished", "Loaded master update", extract_type, update_id)

        return n_loaded

    def importMasterUpdate(self, extract_type, update_id):
        """
        Load master update UPDATE_DIR

        Loads tile and feature changes and updates version stamp. Commits the change."""

        update_dir = self.getUpdate("master", extract_type, update_id)

        # Say what we're about to do
        self.progress("starting", "Loading files from", update_dir, "...")

        # Load changes (ensuring that we won't send them back again)
        self.loadTileChanges(update_dir)
        self.loadConfigChanges(update_dir, suppress_change_tracking=True)
        self.loadFeatureChanges(update_dir, suppress_change_tracking=True, aggressive_commit=True)
        self.loadDeltaChanges(update_dir, suppress_change_tracking=True, aggressive_commit=True)
        self.loadVersionStamps(update_dir)
        self.loadCodeFile(update_dir)

        # Commit the changes
        self.db.commit()

        # Tidy up
        self.removeTree(update_dir)

        self.progress("finished")

    def activate(self, owner, location, n_ids):
        """
        Convert self's database into a replica

        Regsiters database with master and initialises it as a replica"""

        with self.progress.operation("Activating database", self.db.name()):

            # Register with master
            extract_type = self.db.setting("replication.extract_type")
            replica_props = self.sync_engine.register(extract_type, owner, location, n_ids)

            # Set id, init sequences etc
            self.convertToReplica(
                replica_props["replica_id"],
                replica_props["shard_min_id"],
                replica_props["shard_max_id"],
            )

    def convertToReplica(self, replica_id, shard_min_id, shard_max_id):
        """
        Initialise as a replica

        REPLICA_ID gives the name to use. SHARD_MIN_ID and
        SHARD_MAX_ID define the range to use in feature ID generators."""

        self.progress(1, "Activating as", replica_id)

        # Set instance-specific properties
        self.db.setSetting("replication.replica_id", replica_id)

        # Init sequences
        self.db.db_driver.initSequences(
            shard_min_id, shard_max_id, self.db.dd.sequenceFields("myworld")
        )

        # Clear the download cache
        self.removeTree(self.localRoot())

        self.db.commit()

    # ==============================================================================
    #                                    PACKAGING
    # ==============================================================================

    def repackage(self):
        """
        Re-package the database for deployment
        """

        # Get properties from metadata
        metadata_file = os.path.join(self.db.directory(), "metadata.json")
        with open(metadata_file, "r") as file:
            metadata = json.load(file)

        description = metadata["description"]
        zipped = "zipped" in metadata["db_file"]

        # Rebuild package
        with self.progress.operation("Repackaging", self.db.name(), description, zipped):
            self.package(description, zipped)

    def package(self, description, zipped, require_code=True):
        """
        Package the database for deployment

        Optional REQUIRE_CODE permits construction of a package
        without code.zip (useful during Native App development).

        Zips files (if requested) and adds manifest"""

        # Find files that compose package
        directory = self.db.directory()
        (db_file, tile_files, code_file) = self.findFiles(directory, require_code)

        # Vacuum database etc
        self.tidyDatabase()

        # Build zip files (if requested)
        if zipped:
            db_file = self.zip(db_file)
            for i, tile_file in enumerate(tile_files):
                tile_files[i] = self.zip(tile_file)

        # Show what we found
        n_files = len(tile_files) + 2
        self.progress(1, "Building manifest for", n_files, "files")

        extract_type = self.db.setting("replication.extract_type")

        # Get file sizes etc
        metadata = self.buildManifest(
            extract_type, description, db_file, tile_files, code_file, zipped
        )

        # Write file
        out_file = os.path.join(directory, "metadata.json")
        self.progress(1, "Creating", out_file)
        with open(out_file, "w") as strm:
            json.dump(metadata, strm, indent=3)

    def tidyDatabase(self):
        """
        Prepare the current database for deployment

        Clears transaction log, vacuums, etc"""

        with self.progress.operation("Tidying", self.db.path):

            # ENH: Build statistics on database using
            # self.db.db_driver.execute("analyze")  # ENH: Encapsulate on driver

            # Ensure transaction log is empty
            # Note: These would be seen as local changed on NativeApp
            self.progress(1, "Clearing transaction log")
            TransactionLog = self.db.db_driver.rawModelFor("myw", "transaction_log")
            self.db.session.query(TransactionLog).delete()
            self.db.commit()

            # Compress
            self.progress(1, "Vacuuming")
            self.db.db_driver.vacuum()

    def findFiles(self, dir, require_code):
        """
        Find paths to the package files

        Returns:
          db_file      Path to database file
          tile_files   Path to tile files
          code_file    Path to code.zip (None if not present)"""

        # Check for directory does not exist
        if not os.path.exists(dir):
            raise MywError("Directory not found: " + dir)

        # Find files
        db_file_spec = self.pathTo(dir, "*.db")
        tile_file_spec = self.pathTo(dir, "*.sqlite")

        db_files = glob.glob(db_file_spec)
        tile_files = glob.glob(tile_file_spec)
        code_file = self.pathTo(dir, "code", zipped=True)

        # Check there is exactly one db file
        # ENH: Check name matches dir name
        n_db_files = len(db_files)
        if n_db_files == 0:
            raise MywError("Database file not found: " + db_file_spec)
        if n_db_files > 1:
            raise MywError("Directory contains more than one database file: " + dir)

        # Check there is a code file
        if not os.path.exists(code_file):
            msg = "Directory does not contain client code package"

            if require_code:
                raise MywError(msg)
            else:
                self.progress("warning", msg)
                code_file = None

        # ENH: Check for spurious files

        return (db_files[0], sorted(tile_files), code_file)

    def pathTo(self, dir, file_name, zipped=False):
        """
        Returns path for file FILE_NAME in DIR (optionally suffixed .zip)
        """

        if zipped:
            file_name = file_name + ".zip"

        return os.path.join(dir, file_name)

    def zip(self, file_path, force=False):
        """
        Zip a file (if necessary), placing output in same directory

        Returns name of file created"""

        zipfile_path = file_path + ".zip"

        if force or self.zipNeedsRebuild(file_path, zipfile_path):
            with self.progress.operation("Zipping", file_path, "..."):

                with ZipFile(zipfile_path, "w", ZIP_DEFLATED, allowZip64=True) as zipfile:
                    zipfile.write(file_path, os.path.basename(file_path))

        else:
            self.progress(1, "Zip already up to date for:", file_path)

        return zipfile_path

    def zipNeedsRebuild(self, file_path, zipfile_path):
        """
        True if ZIPFILE_PATH does not exist or is younger than FILE_PATH
        """

        if not os.path.exists(zipfile_path):
            return True

        src_last_update = os.stat(file_path).st_mtime
        tgt_last_update = os.stat(zipfile_path).st_mtime

        return src_last_update >= tgt_last_update

    def buildManifest(self, extract_type, description, db_file, tile_files, code_file, zipped):
        """
        Build the manifest structure

        Returns dict"""

        metadata = OrderedDict()
        metadata["extract_type"] = extract_type
        metadata["description"] = (description,)

        # Add database file properties
        metadata["db_file"] = self.file_props(db_file, zipped)

        # Add tile file properties
        tile_file_props = []
        for tile_file in tile_files:
            props = self.file_props(tile_file, zipped)
            tile_file_props.append(props)

        metadata["tile_files"] = tile_file_props

        # Add code package properties (if present)
        if code_file:
            metadata["code_package"] = self.file_props(code_file, True)

        return metadata

    def file_props(self, file_path, zipped):
        """
        Returns properties of FILE_PATH (basename, size, etc) as dict
        """

        props = {}

        # Get name (Note: Assumes does not contain '.')
        props["name"] = os.path.basename(file_path).split(".")[0]

        # Get sizes
        if zipped:
            props["size"] = self.get_uncompressed_size(file_path)
            props["zipped"] = os.path.getsize(file_path)
        else:
            props["size"] = os.path.getsize(file_path)

        return props

    def get_uncompressed_size(self, zip_file_path):
        """
        Returns uncompressed size of data in ZIP_FILE_PATH
        """

        n_bytes = 0

        with ZipFile(zip_file_path, "r", allowZip64=True) as zipfile:

            for info in zipfile.infolist():
                n_bytes += info.file_size

        return n_bytes
