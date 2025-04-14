################################################################################
# Engine for performing replication file upload/download
################################################################################
# Copyright: IQGeo Limited 2010-2023

import glob
import os
import shutil

from .myw_sync_engine import MywSyncEngine
from myworldapp.core.server.database.myw_database_server import MywDatabaseServer


class MywDirectSyncEngine(MywSyncEngine):
    """
    Sync engine that operates via direct access to the sync share and master database
    """

    def __init__(self, sync_root, master_db_connect_info=None, **opts):
        """
        Init slots of self

        SYNC_ROOT is location of the root of the sync
        tree. Optional MASTER_DB_CONNECT_INFO is a dict defining
        PostgreSQL connection info for master database"""

        super(MywDirectSyncEngine, self).__init__(**opts)

        self.sync_root = sync_root
        self.master_db_connect_info = master_db_connect_info

    def register(self, extract_type, owner, location, n_ids):
        """
        Register a replica with the master database

        Returns dict giving properties allocated to replica (name, shard, etc)"""

        # Open master
        (master_db, master_rep_engine) = self.openMasterDB()

        # Register in master, allocate id shard, etc
        replica_props = master_rep_engine.registerReplica(extract_type, owner, location, n_ids)

        master_db.commit()

        return replica_props

    def pendingUpdates(self, since_id, *path):
        """
        Find updates to load from PATH since update SINCE_ID

        Returns set of full paths, keyed by update_id"""

        root_dir = os.path.join(self.sync_root, *path)
        updates = {}

        # Check for dir doesn't exists
        if not os.path.exists(root_dir):
            return updates

        # Find all zip files
        file_spec = os.path.join(root_dir, "*.zip")

        for file_path in glob.glob(file_spec):

            base = os.path.basename(file_path).split(".")[0]

            if base.isdigit():
                update_id = int(base)
                if update_id > since_id:
                    updates[update_id] = file_path

        return updates

    def downloadFile(self, sync_dir, local_dir, file_name):
        """
        Download FILE_NAME from the sync directory

        Returns name of file created"""

        sync_full_dir = os.path.join(self.sync_root, *sync_dir)
        sync_full_path = os.path.join(sync_full_dir, file_name)

        local_path = os.path.join(local_dir, file_name)

        with self.progress.operation("Downloading", local_path, "from", sync_full_path):
            shutil.copy(sync_full_path, local_path)

        return local_path

    def uploadFile(self, sync_dir, local_dir, file_name):
        """
        Upload file FILE_PATH to the sync directory
        """

        sync_full_dir = self.ensurePath(self.sync_root, *sync_dir)
        sync_full_path = os.path.join(sync_full_dir, file_name)

        file_path = os.path.join(local_dir, file_name)

        with self.progress.operation("Uploading", file_name, "to", sync_full_path):
            shutil.copy(file_path, sync_full_path)

        # ENH: Could add to index here

    def updateReplicaStatus(self, replica_id, master_update):
        """
        Update master status meta-data for replica REPLICA_ID
        """
        # ENH: Could update master here
        pass

    def openMasterDB(self):
        """
        Open master
        """

        from .myw_master_replication_engine import (
            MywMasterReplicationEngine,
        )  # TODO: Avoid this circular reference

        master_db_manager = MywDatabaseServer(
            host=self.master_db_connect_info["host"],
            port=self.master_db_connect_info["port"],
            username=self.master_db_connect_info["username"],
            password=self.master_db_connect_info["password"],
            progress=self.progress,
        )

        master_db = master_db_manager.openSecondary(self.master_db_connect_info["db_name"])

        master_rep_engine = MywMasterReplicationEngine(master_db, "master", progress=self.progress)

        return (master_db, master_rep_engine)
