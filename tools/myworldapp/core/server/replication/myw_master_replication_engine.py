################################################################################
# Engine for performing replication operations on master database
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os
import shutil
import traceback
from datetime import datetime

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.tilestore.myw_tile_db import MywTileDB
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.system.myw_code_manager import MywCodeManager

from .myw_replication_engine import MywReplicationEngine
from .myw_direct_sync_engine import MywDirectSyncEngine
from .myw_extract_engine import MywExtractEngine
from .myw_extract_filter import MywExtractFilter


class MywMasterReplicationEngine(MywReplicationEngine):
    """
    Engine for performing replication operations on a master database

    Provides protocols for initialising the database, creating
    an extract, registering a replica and exporting/importing updates"""

    def __init__(self, db, db_type=None, **opts):
        """
        Init slots of self

        DB is a MywDatabase. See super for details of opts"""

        progress = opts.pop("progress", MywProgressHandler())

        # Set engine for file upload/download
        # Note: sync_share directly accessible to master, so upload is just a copy
        sync_engine = MywDirectSyncEngine(db.setting("replication.sync_root"), progress=progress)

        # Init super
        super(MywMasterReplicationEngine, self).__init__(
            db, sync_engine=sync_engine, db_type=db_type, progress=progress, **opts
        )

    # ==============================================================================
    #                                  INITIALISATION
    # ==============================================================================

    def initialiseDatabase(
        self,
        sync_dir,
        sync_url,
        force=False,
        download_dir="",
        anonymous_downloads=False,
        os_auth=False,
        login_timeout=None,
        login_on_app_start=False,
    ):
        """
        Initialise replication metadata in master database

        SYNC_DIR is the exchange driectory for update
        packages. Optional SYNC_URL is a myWorld server that can be
        used to upload/download packages to SYNC_DIR."""

        # Check not already initialised
        if (self.db.setting("replication.replica_id") != None) and not force:
            raise MywError("Replication meta-data already initialised")

        # ENH: Warn if replicas already exist

        # Reserve bottom half of id range for master
        top_id = (
            2**31
        )  # PostgreSQL IDs are 32-bit *signed* ints .. so only half range is available :-(
        master_max_id = top_id / 2  # ENH: Make proportion configurable

        # Build list of sync urls
        sync_urls = []
        if sync_url:
            item = {"name": "default", "url": sync_url}
            sync_urls.append(item)

        # Set properties
        self.progress(2, "Initialising settings")
        self.db.setSetting("replication.replica_id", "master")
        self.db.setSetting("replication.sync_root", sync_dir)
        self.db.setSetting("replication.sync_urls", sync_urls)
        self.db.setSetting("replication.master_shard_max", master_max_id)
        self.db.setSetting("replication.replica_shard_lwm", top_id)
        self.db.setSetting("replication.replica_id_hwm", 0)
        self.db.setSetting("replication.download_root", download_dir or "")
        self.db.setSetting("replication.anonymous_downloads", anonymous_downloads)
        self.db.setSetting(
            "replication.auth_options",
            {
                "auth_via_os_username": os_auth,
                "local_session_timeout": login_timeout,
                "on_application_start": login_on_app_start,
            },
        )

        # Update sequences
        seq_min_id = 0
        seq_max_id = master_max_id

        self.progress(2, "Updating sequences")
        for feature_type in self.db.dd.adjustSequences(seq_min_id, seq_max_id, restart=False):
            self.progress(3, "Updating generator for:", feature_type)

        # Init change tracking
        self.db.incrementVersionStamp("data")

        # Create data model for defining spatial extracts
        self.createExtractModel()

        # Clear the download cache
        self.removeTree(self.localRoot())

        self.db.commit()

    # ==============================================================================
    #                               EXTRACT METADATA
    # ==============================================================================

    def checkpointNameFor(self, extract_type):
        """
        Name of checkpoint recording database state at time of more recent export for EXTRACT_TYPE
        """

        return "extract_" + extract_type + "_export"

    def extractTypes(self, spec="*"):
        """
        Yields the names of created extracts matching SPEC
        """

        # ENH: Get rid of this?
        return self.db.extractNames(spec)

    def extractDef(self, name):
        """
        Returns meta-data for NAME
        """
        extract_rec = self.db.extractRec(name)

        base_config = None
        access_by_all = False

        # get roles with access to this extract
        role_names = set()
        for config in self.db.extractConfigs(name):
            if config.role_name is None:
                base_config = config
                continue
            if config.role_name == "all":
                # extract is configured for all roles
                access_by_all = True

            role_names.add(config.role_name)

        # add roles with access to all extracts (unless extract is already accessible by 'all')
        god_role_names = set()  # roles to access to all extracts
        for config in self.db.extractConfigs("all"):
            god_role_names.add(config.role_name)

        if access_by_all:
            # replace the list with just 'all' to remove redundancy
            role_names = {"all"}

        cp_name = self.checkpointNameFor(name)
        cp_rec = self.db.checkpointRec(cp_name) or {}
        region = self.regionFor(extract_rec.region, False)

        return {
            "name": name,
            "region": extract_rec.region,
            "table_set": extract_rec.table_set,
            "region_exists": region != None,
            "last_export": extract_rec.last_export_id,
            "last_export_time": cp_rec.get("date"),
            "include_deltas": extract_rec.include_deltas or False,
            "folder_name": base_config.folder_name,
            "expiry_time": base_config.expiry_time,
            "writable_by_default": base_config.writable_by_default,
            "roles": list(role_names),
            "god_roles": list(god_role_names),
        }

    def dropExtractType(self, name, force=False):
        """
        Discards definition of NAME
        """

        with self.progress.operation("Dropping extract", name):
            extract_rec = self.db.extractRec(name)

            # Check for in use
            if not force:
                replica_names = self.db.replicaNames(extract_type=name)
                if replica_names:
                    raise MywError("Replicas exist for extract type:", name)

            # Remove any extract config records
            self.progress(2, "Removing extract config")
            configs = self.db.extractConfigs(name)
            configs.delete()
            # Remove checkpoint (if it exists)
            # ENH: Remove checkpoints from tile files too (if they exist)
            cp_name = self.checkpointNameFor(name)
            self.progress(2, "Dropping checkpoint", cp_name)
            self.db.dropCheckpoint(cp_name, error_if_none=False)

            # Remove record
            self.progress(2, "Dropping extract definition")
            self.db.session.delete(extract_rec)

            # Remove sync update packages (to avoid problems if extract gets recreated)
            self.progress(2, "Removing updates")
            self.deleteSyncDir("master", name)

    # ==============================================================================
    #                                  EXTRACTION
    # ==============================================================================

    def extract(
        self,
        extract_db_path,
        name,
        region_name,
        table_set_name,
        master_db_connect_info,
        overwrite,
        include_deltas,
        encryption_key=None,
    ):
        """
        Create an extract of self's database

        NAME is the name of the extract to create/update.
        Optional REGION_NAME is the name of a myw_extract_region
        feature defining the spatial extent of the extract.
        Optional TABLE_SET_NAME is the name of a table_set
        defining the features and tile files to extract.

        EXTRACT_DB_PATH is the path for output sqlite database. Tile
        files and code package will be placed in the same directory.

        Optional include_deltas will include deltas in the extact"""

        with self.progress.operation("Creating extract", name):
            # Check master is init
            self.assertDatabaseTypeIs("master")

            # Get info required for extraction
            region_geom = self.regionFor(region_name)
            table_set = self.tableSetFor(table_set_name)
            code_file = self.codeFile()

            extract_filter = MywExtractFilter(
                "extract",
                region=region_geom,
                table_set=table_set,
                progress=self.progress,
                include_deltas=include_deltas,
            )

            # Create directory (if necessary)
            extract_dir = os.path.dirname(extract_db_path)
            folder_name = os.path.basename(extract_dir)
            self.os_engine.ensure_exists(extract_dir, ensure_empty=overwrite)

            # Avoid problems with pre-existing files
            if not self.os_engine.is_empty(extract_dir):
                raise MywError("Directory is not empty:", extract_dir)

            # Set checkpoints etc for future change detection
            self.progress(1, "Preparing", self.db.name(), "for extraction")
            self.prepareForExtract(
                name, region_name, table_set_name, include_deltas, folder_name, encryption_key
            )

            # Create extract
            # ENH: Remove copy if something goes wrong
            extract_engine = MywExtractEngine(
                self.db, progress=self.progress, encryption_key=encryption_key
            )

            (extract_db, tile_file_mappings) = extract_engine.extract(
                extract_db_path, extract_dir, extract_filter
            )

            # Initialise its properties (id, etc)
            # ENH: Avoid creation of another engine here
            extract_rep_engine = MywMasterReplicationEngine(extract_db, progress=self.progress)
            extract_rep_engine.convertToExtract(
                name, region_name, table_set_name, master_db_connect_info
            )

            # Add code package (if requested)
            if code_file:
                self.addCode(code_file, extract_dir)

            # Commit master checkpoints
            self.db.commit()

            return extract_db

    def prepareForExtract(
        self, name, region_name, table_set_name, include_deltas, folder_name, encryption_key
    ):
        """
        Create metadata and set initial checkpoint in all datasets prior to extraction

        NAME is the name of the extract to create. REGION_NAME is
        the name of a myw_extract_region feature (or
        None). TABLE_SET is the name of a table_set (or None)
        INCLUDE_DELTAS is a boolean that will allow the extract to include deltas on it
        FOLDER_NAME is a string that will point to the extract directory

        Checkpoints are using for differencing in subsequent exports"""

        # Create extract definition (if necessary)
        extract_rec = self.db.extractRec(name)

        if not extract_rec:
            self.progress(1, "Creating meta-data for extract:", name)
            extract_rec = self.db.addExtract(name, region_name, table_set_name, include_deltas)
        else:
            self.progress(1, "Updating meta-data for extract:", name)
            extract_rec.region = region_name
            extract_rec.table_set = table_set_name
            extract_rec.include_deltas = include_deltas

        if encryption_key is not None:
            self.progress(1, "Saving encryption key for extract:", name)
            self.db.saveExtractKey(name, encryption_key)
        else:
            self.progress(1, "Removing encryption key for extract:", name)
            self.db.deleteExtractKey(name)

        self.db.setExtractDownload(name, None, folder_name=folder_name)

        cp_name = extract_rec.checkpoint_name
        last_export_id = extract_rec.last_export_id

        # Determine if extract already in use
        have_exported = (last_export_id != None) and (last_export_id > 0)

        # Avoid losing data in extracts already in field
        if have_exported and self.unexportedChangesFor(name):
            raise MywError("Extract has unexported changes:", name)

        # Commit any pending changes
        self.db.commit()

        # Once all other updates are complete ..
        # Warning: Lock blocks all other extract and load ops .. so keep contents lean
        with self.db.db_driver.versionStampLock(exclusive=True, release_on_commit=False):
            # Rollforward our view to end of long transaction (remember: isolation level is 'serializable')
            # Note: Ensures we see the latest value for data version stamp if there are parallel extracts
            self.db.commit()

            # Init checkpoints for export (if neccessary)
            if not have_exported:
                # Place checkpoints for change detection .. which also starts a new long transaction
                version = self.setCheckpoints(cp_name)
                extract_rec.last_export_id = 0  # ENH: Do earlier?
            else:
                # Leave checkpoints where they were .. but start a new long transaction
                self.progress(
                    2, "Extract already exists - next export id will be", last_export_id + 1
                )
                version = self.db.incrementVersionStamp("data")
            self.db.commit()

        self.progress(2, "Extracting at master data version", version)

    def convertToExtract(self, extract_type, region_name, table_set_name, master_connect_spec):
        """
        Initialise self's database as an extract

        EXTRACT_TYPE is the extract type. TILESTORE_SPEC is the location of
        the tilestore files.

        Self's database must be SQLite"""

        self.progress(1, "Initialising as extract")

        # Get extract properties (which were copied in from master)
        extract_rec = self.db.rawTable("myw", "extract").get(extract_type)
        data_vs = self.db.versionStamp("data")

        # Set extract type
        self.db.setSetting("replication.replica_id", "extract")
        self.db.setSetting("replication.extract_type", extract_type)
        self.db.setSetting("replication.extract_region", region_name)
        self.db.setSetting("replication.extract_table_set", table_set_name)
        self.db.setSetting("replication.master_connect_spec", master_connect_spec)

        # Init version stamps
        self.db.setVersionStamp("master_update", extract_rec.last_export_id)
        self.db.setVersionStamp("master_data", data_vs - 1)
        self.db.setVersionStamp("data", 1)

        # Remove master-specific settings
        self.db.setSetting("replication.replica_shard_lwm", None)
        self.db.setSetting("replication.replica_id_hwm", None)

        # Clear the download cache
        self.removeTree(self.localRoot())

        self.db.commit()

    # ==============================================================================
    #                               SPATIAL EXTRACTION
    # ==============================================================================

    def createExtractModel(self):
        """
        Create data model for defining spatial extracts
        """

        # ENH: Better as part of standard model?

        resource_dir = os.path.join(
            os.path.dirname(__file__), "..", "base", "db_schema", "resources", "replication"
        )

        self.db.data_loader.loadFiles(resource_dir, "*.def")
        self.db.data_loader.loadFiles(resource_dir, "*.layer")

    def regionFor(self, region_name, error_if_none=True):
        """
        Geometry defining the region covered by REGION_NAME (if any)

        Returns a shapley polygon geometry (or None if type covers whole DB)
        """

        # Case: Extract covers whole database
        if region_name == None:
            return None

        # Case: Spatial extract
        # ENH: Implement myw_database.get_feature()
        ftr = self.db.tables["myw_extract_region"].filterOn("name", region_name).first()

        if error_if_none and ftr is None:
            raise MywError("No such extract region:", region_name)

        if ftr is None:
            return None

        return ftr._primary_geom_field.geom()

    def tableSetFor(self, table_set_name):
        """
        Definition for TABLE_SET_NAME

        Returns a table_set definition structure (or None for the special name None)

        Throws MywError if definition contains conflicting options"""

        if table_set_name == None:
            return None

        rec = self.db.config_manager.tableSetRec(table_set_name)

        if rec is None:
            raise MywError("No such table_set:", table_set_name)

        rec.assertValid()  # ENH: Pass record into extract filter and do this there

        return rec.definition(expand_env_vars=True)

    # ==============================================================================
    #                                REGISTRATION
    # ==============================================================================

    def registerReplica(self, extract_type, owner, location, n_ids):
        """
        Create entry for new replica and return its properties

        Returns dict with keys:
         replica_id
         shard_min_id
         shard_max_id"""

        # ENH: As a single transaction

        # Check database is master
        self.assertDatabaseTypeIs("master")

        # Block until we have exclusive access to replica metadata
        # ENH: Make replica.id a sequence and get rid of this
        self.db.db_driver.acquireShardLock()

        # Allocate replica ID (avoiding conflict with other processes)
        replica_seq = self.db.setting("replication.replica_id_hwm") + 1
        replica_id = "replica{}".format(replica_seq)
        self.db.setSetting("replication.replica_id_hwm", replica_seq)

        # Say what we are about to do
        self.progress(1, "Registering", replica_id)

        # Check replica not already registered (should never happen)
        if self.db.replicaRec(replica_id) != None:
            raise MywError("Replica already exists:", replica_id)

        # Allocate an shard (for object ids created in replica)
        (shard_min_id, shard_max_id) = self.getShard(replica_id, n_ids)

        # Create meta-data
        self.insertReplica(replica_id, extract_type, shard_min_id, shard_max_id, location, owner)
        replica_stamp = replica_id + "_data"
        self.db.setVersionStamp(replica_stamp, 0)

        # Create sync directory to hold uploads
        self.createSyncDir(replica_id)

        return {
            "replica_id": replica_id,
            "shard_min_id": shard_min_id,
            "shard_max_id": shard_max_id,
        }

    def updateReplica(self, replica_id, owner, location):
        """
        Update replica and for new owner and location values

        Returns dict with keys:
         replica_id
         shard_min_id
         shard_max_id"""

        # ENH: As a single transaction

        # Check database is master
        self.assertDatabaseTypeIs("master")

        self.progress(1, "Updating", replica_id, owner, location)
        self.updateReplicaEntry(replica_id, location, owner)

    def allocateExtraShard(self, replica_id, n_ids):
        """
        Allocate an additional shard to REPLICA_ID (which must exist)

        Returns dict with keys:
         shard_min_id
         shard_max_id"""

        # Say what we are about to do
        self.progress(1, "Allocating shard", replica_id)

        # Check database is master
        self.assertDatabaseTypeIs("master")

        # Allocate shard
        (shard_min_id, shard_max_id) = self.getShard(replica_id, n_ids)

        # Assign it to the replica
        replica_rec = self.db.replicaRec(replica_id)
        self.insertReplicaShard(replica_rec, shard_min_id, shard_max_id)

        return {"shard_min_id": shard_min_id, "shard_max_id": shard_max_id}

    def getShard(self, replica_id, n_ids):
        """
        Allocate next block of n_ids from the replica ID sequence range

        Eats IDs down from the top of the range. REPLICA_ID is for error reporting only

        Returns (min_id,max_id)"""

        self.db.db_driver.acquireShardLock()

        # Get range to use
        lwm = self.db.setting("replication.replica_shard_lwm")
        min_id = lwm - n_ids
        max_id = min_id + n_ids - 1

        # Check we haven't slipped into master range
        if min_id <= self.db.setting("replication.master_shard_max"):
            raise MywError(
                "Out of IDs while trying to allocate", n_ids, "ids for replica", replica_id
            )

        # Allocate it
        self.db.setSetting("replication.replica_shard_lwm", min_id)

        # Say what we did
        self.progress(
            2, "Allocated", replica_id, "shard", min_id, ":", max_id, "(", n_ids, "values", ")"
        )

        return (min_id, max_id)

    # ==============================================================================
    #                                    EXPORT
    # ==============================================================================

    def exportChanges(self, extract_type_spec=None, max_recs_per_file=None, include_code=False):
        """
        Export pending changes to the sync directory

        Optional EXTRACT_TYPE_SPEC is used to limit which extract
        types are considered (can be wildcarded)

        If INCLUDE_CODE is true, include the distribution code package (which must exist)"""

        extract_types = self.extractTypes(extract_type_spec)

        if not extract_types:
            self.progress(1, "No extracts to export")
            return

        # Find the code package (if requested)
        code_file = self.codeFile(include_code)

        # Generate the exports
        for extract_type in extract_types:
            with self.progress.operation("Exporting master changes for extract", extract_type):
                if self.unexportedChangesFor(extract_type) or include_code:
                    self.exportChangesFor(extract_type, max_recs_per_file, code_file)
                else:
                    self.progress(1, "No changes to export")

    def unexportedChangesFor(self, extract_type):
        """
        True if there are any unexported changes for EXTRACT_TYPE
        """

        extract_rec = self.db.extractRec(extract_type)

        # Get extraction options
        extract_filter = MywExtractFilter(
            "extract",
            region=self.regionFor(extract_rec.region),
            table_set=self.tableSetFor(extract_rec.table_set),
        )

        feature_types = extract_filter.myworldFeatureTypes(self.db)
        tile_files = extract_filter.tileFiles(self.db)

        # Get checkpoint marking last export
        # ENH: Get from extract_rec
        base_cp_name = self.checkpointNameFor(extract_type)

        # Check for pending changes in database
        since_version = self.db.dataVersionFor(base_cp_name)
        if self.db.hasChangesSince(
            since_version, feature_types, self.excluded_settings
        ):  # ENH: Could check region here
            return True

        # For each tile database ..
        for tile_db_file in tile_files:
            tile_db = MywTileDB(tile_db_file, "u", progress=self.progress)
            since_version = tile_db.dataVersionFor(base_cp_name)
            if tile_db.hasChangesSince(since_version):  # ENH: Could check bounds here
                return True

        return False

    def exportChangesFor(self, extract_type, max_recs_per_file, code_file=None):
        """
        Export pending changes for EXTRACT_TYPE to the sync directory
        """

        # Requires transaction isolation level SERIALIZABLE (starts new transaction after each commit)
        # ENH: assert transaction isolation level is set to SERIALIZABLE

        extract_rec = self.db.extractRec(extract_type)

        # Get extract options
        extract_filter = MywExtractFilter(
            "export",
            region=self.regionFor(extract_rec.region),
            table_set=self.tableSetFor(extract_rec.table_set),
        )

        # Get checkpoint marking last export
        base_cp_name = extract_rec.checkpoint_name
        next_cp_name = base_cp_name + "_next"

        # Get sequence number for update package
        update_id = extract_rec.last_export_id + 1

        # Create directory to hold update (early, in case it fails)
        update_dir = self.createExportDir("master", extract_type, update_id)

        # End current long transaction
        self.db.db_driver.acquireVersionStampLock(True)
        curr_version = self.setCheckpoints(next_cp_name)
        self.db.commit()  # Releases lock

        try:
            # Create Package
            # --------------
            with self.progress.operation("Exporting changes to", update_dir):
                # Export changes
                self.exportConfigChanges(update_dir, base_cp_name, extract_filter)
                self.exportFeatureChanges(
                    update_dir, base_cp_name, extract_filter, max_recs_per_file
                )
                if extract_rec.include_deltas:
                    self.exportDeltaChanges(
                        update_dir, base_cp_name, extract_filter
                    )  # If extract hasb_up included deltas
                self.exportTileChanges(update_dir, base_cp_name, extract_filter)
                self.exportVersionStamps(update_dir, curr_version)

                # Export code file (if requested)
                if code_file:
                    self.exportCodeFile(update_dir, code_file)

                # Zip and publish the result
                self.putUpdate(update_dir, "master", extract_type, update_id)

                # Tidy up
                self.removeTree(update_dir)

            # Reposition Checkpoints
            # ----------------------
            # Increment sequence number for next export
            extract_rec.last_export_id = update_id
            self.db.commit()

            # Reposition base checkpoints for next export
            # Note: Nice if this was atomic ... but not essential
            self.repositionCheckpoints(base_cp_name, next_cp_name)

        except Exception:
            self.progress("error", "Failed to Export changes to", update_dir)
            raise

        finally:
            # Remove temporary checkpoint
            self.db.dropCheckpoint(next_cp_name)

        self.db.commit()

    # ==============================================================================
    #                                   IMPORT
    # ==============================================================================

    def importUpdates(self, name_spec="*"):
        """
        Import replica updates into master database

        Checks sync area for replica updates, imports any we don't already have

        Optional NAME_SPEC can be used to limit the replicas"""

        self.progress(1, "Updating master")

        # For each live replica ..
        n_loaded = 0
        for replica_rec in self.db.replicaRecs(name_spec, dead=False):
            try:
                self.progress("starting", "Loading updates from", replica_rec.id)
                n_loaded += self.importUpdatesForReplica(replica_rec)

            except MywError as cond:
                self.progress("error", cond)

            except Exception as cond:
                self.progress("error", cond, traceback=traceback)

            finally:
                self.progress("finished")
        return n_loaded

    def importUpdatesForReplica(self, replica_rec):
        """
        Import pending updates for REPLICA_REC

        Returns number of updates loaded"""

        replica_version_stamp = replica_rec.version_stamp_name

        # Say what we are about to do
        current_id = self.db.db_driver.versionStamp(replica_version_stamp, update_lock=True)
        self.progress(2, "Initial version is", current_id)

        # Find updates to load
        updates = self.pendingUpdates(current_id, replica_rec.id)

        # Load them
        n_loaded = 0
        if updates:
            self.progress(1, "Found", len(updates), "uploads to import", "...")

            n_loaded = 0
            for update_id in sorted(updates.keys()):
                self.progress("starting", "Loading update", update_id)
                try:
                    # Check for missing update
                    expected_id = current_id + 1
                    if update_id != expected_id:
                        raise MywError(
                            replica_rec.id,
                            ": Update sequence error: Expected",
                            expected_id,
                            ": Got",
                            update_id,
                        )

                    # Load it
                    self.importUpdate(replica_rec.id, update_id)

                    # Record that we loaded it
                    self.progress(
                        3, "Updating version stamp", replica_version_stamp, "to", update_id
                    )
                    self.db.setVersionStamp(replica_version_stamp, update_id)

                    self.db.commit()

                    current_id = update_id
                    n_loaded += 1

                finally:
                    self.progress("finished")

        else:
            self.progress(1, "No pending uploads")

        # Check for replica now dead
        if replica_rec.status == "dropped":
            self.progress(1, "Marking replica as dead")
            replica_rec.dead = True
            self.db.session.add(replica_rec)
            self.db.commit()

        return n_loaded

    def importUpdate(self, replica_id, update_id):
        """
        Import pending update UPDATE_ID from REPLICA_ID
        """

        update_dir = self.getUpdate(replica_id, update_id)

        # Load the update (with change detection enabled)
        self.loadFeatureChanges(update_dir)
        self.loadDeltaChanges(update_dir)

        # Tidy up
        self.removeTree(update_dir)

    def hasPendingUpdates(self, replica_id):
        """
        True if REPLICA_ID has uploads that have not yet been imported
        """

        replica_rec = self.db.replicaRec(replica_id)

        current_id = self.db.versionStamp(replica_rec.version_stamp_name)
        updates = self.pendingUpdates(current_id, replica_id)

        return len(updates) > 0

    # ==============================================================================
    #                           REPLICA RECORD MANAGEMENT
    # ==============================================================================

    def insertReplica(self, replica_id, extract_type, shard_min_id, shard_max_id, location, owner):
        """
        Create a replica meta-data record in myw.replica
        """

        # Get model (avoiding probems if we are being called from secondary session)
        # ENH: Find a cleaner way e.g. implement db.modelFor()
        MywReplica = self.db.db_driver.rawModelFor("myw", "replica")

        # Create record
        replica_rec = MywReplica(
            id=replica_id,
            type=extract_type,
            registered=datetime.utcnow(),
            location=location,
            owner=owner,
            n_shards=0,
            dead=False,
        )

        self.db.session.add(replica_rec)
        self.db.session.flush()

        # Add a shard
        self.insertReplicaShard(replica_rec, shard_min_id, shard_max_id)

        self.db.commit()

        return replica_rec

    def insertReplicaShard(self, replica_rec, shard_min_id, shard_max_id):
        """
        Creates a new repilca_shard record (and update shard count on REPLICA_REC)
        """

        # Get model (avoiding probems if we are being called from secondary session)
        # ENH: Find a cleaner way e.g. implement db.modelFor()
        MywReplicaShard = self.db.db_driver.rawModelFor("myw", "replica_shard")

        # Create record
        shard_rec = MywReplicaShard(
            replica_id=replica_rec.id,
            seq=replica_rec.n_shards + 1,
            min_id=shard_min_id,
            max_id=shard_max_id,
        )

        self.db.session.add(shard_rec)

        # Update count (also used as sequence generator)
        replica_rec.n_shards += 1

        return shard_rec

    def updateReplicaEntry(self, replica_id, location, owner):
        """
        Update a replica meta-data record in myw.replica
        """

        # Get model (avoiding probems if we are being called from secondary session)
        # ENH: Find a cleaner way e.g. implement db.modelFor()
        MywReplica = self.db.db_driver.rawModelFor("myw", "replica")

        # Create record
        replica_rec = self.db.session.query(MywReplica).filter(MywReplica.id == replica_id).first()
        replica_rec.registered = datetime.utcnow()
        replica_rec.location = location
        replica_rec.owner = owner
        replica_rec.dead = False

        self.db.session.flush()
        self.db.commit()

        return replica_rec

    def updateReplicaStatus(self, replica_id, master_update):
        """
        Update status meta-data for replica REPLICA_ID

        Replica must exist and be active"""

        self.progress("starting", "Updating status for", replica_id)

        rec = self.db.replicaRec(replica_id)

        rec.master_update = master_update
        rec.last_updated = datetime.utcnow()  # ENH: Only if update has changed

    def storeClientLogs(self, replica_id, logs):
        """
        Store latest client logs for replica REPLICA_ID
        """

        # Get location to store file at
        file_path = self.pathToClientLogs(replica_id)
        self.progress("warning", "Saving client logs for " + replica_id, " to", file_path)
        self.progress(5, "Client logs of replica " + replica_id, ": ", logs)

        # Store it
        with open(file_path, "w") as local_file:
            local_file.write(logs)

    def pathToClientLogs(self, *path):
        """
        Returns full path to an update file in the sync tree
        """

        sync_root = self.db.setting("replication.sync_root")
        dir_path = os.path.join(sync_root, *path)
        now = datetime.now()
        file_name = "client_logs_{}.txt".format(now.strftime("%Y%m%d%H%M%S"))
        return os.path.join(dir_path, file_name)

    def dropReplica(self, replica_id):
        """
        Mark REPLICA_ID as no longer is use

        Replica must exist and be active"""

        self.progress("starting", "Marking replica as dropped", replica_id)

        # Mark it as dropped
        rec = self.db.replicaRec(replica_id)
        rec.dropped = datetime.utcnow()

        # If nothing left to import .. mark it as dropped
        if not self.hasPendingUpdates(replica_id):
            self.progress(1, "Marking replica as dead")
            rec.dead = True

        self.db.commit()

        self.progress("finished")

    def pruneReplicas(self):
        """
        Discard metadata and sync directories for dead replicas

        Returns number of replicas deleted"""

        # pylint: disable=no-member

        # ENH: Import this in header
        from myworldapp.core.server.models.myw_replica import MywReplica

        self.progress("starting", "Pruning replicas ...")

        replica_recs = self.db.session.query(MywReplica).order_by(MywReplica.id)

        # Drop replicas and associated directory trees
        n_deleted = 0
        for rec in replica_recs.filter(MywReplica.dead == True):
            self.deleteReplica(rec.id)
            self.db.commit()
            n_deleted += 1

        self.progress("finished", n_deleted, "replicas deleted", replicas=n_deleted)

        return n_deleted

    def deleteReplica(self, replica_id):
        """
        Discard metadata for replica REPLICA_ID (which must exist)
        """
        # ENH: As single transaction

        self.progress("starting", "Deleting replica", replica_id)

        replica_rec = self.db.replicaRec(replica_id)

        # Delete sync directory
        self.deleteSyncDir(replica_id)

        # Delete substruture (shard recs and version stamp)
        for sub_rec in replica_rec.substructure():
            self.db.session.delete(sub_rec)
        self.db.session.flush()

        # Delete record
        self.db.session.delete(replica_rec)

        self.progress("finished")

    # ==============================================================================
    #                           CODE FILE MANAGEMENT
    # ==============================================================================

    def codeFile(self, include_code=True):
        """
        Code file to copy (if any)
        """

        if not include_code:
            return None

        product = MywProduct()
        code_mgr = MywCodeManager(product)

        if not code_mgr.is_built("code_package"):
            raise MywError("No code file (not built?):", code_mgr.code_file)

        return code_mgr.code_file

    def addCode(self, code_file, extract_dir):
        """
        Copy the product's client code package into the target directory
        """

        with self.progress.operation("Adding code package"):
            self.progress(1, "Copying code from", code_file)
            out_file = os.path.join(extract_dir, "code.zip")
            shutil.copy(code_file, out_file)
