################################################################################
# Controller for replica synchronisation requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import os, time
from pyramid.view import view_config
from pyramid.response import FileResponse
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.database.myw_database import MywDatabase
from myworldapp.core.server.replication.myw_master_replication_engine import (
    MywMasterReplicationEngine,
)

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywSyncController(MywController):
    """
    Controller for replica synchronisation requests

    Note that sync requests do not consume a server licence (do
    not count as a myWorld online 'user')"""

    def __init__(self, request):
        """
        Initialize self
        """

        MywController.__init__(self, request)

        self.db = MywDatabase(Session)
        self._rep_engine = None  # Init lazily to allow use of abort()

    @property
    def rep_engine(self):
        """
        Self's replication engine (a MywMasterReplicationEngine)
        """

        if not self._rep_engine:
            settings = self.request.registry.settings
            trace_level = settings.get("myw.sync.options", {}).get("sync_log_level", 0)

            self._rep_engine = MywMasterReplicationEngine(
                self.db, progress=MywSimpleProgressHandler(trace_level, "INFO: SYNC: ")
            )

            if self._rep_engine.databaseType() != "master":
                print("ERROR: SYNC: Database is not master")
                raise exc.HTTPPreconditionFailed()  # not a master database

        return self._rep_engine

    @view_config(
        route_name="myw_sync_controller.register_replica", request_method="POST", renderer="json"
    )
    def register_replica(self):
        """
        Register a new replica, allocate it a name and a shard

        Returns allocated values"""
        extract_type = self.request.matchdict["extract_type"]

        self.current_user.assertAuthorized(self.request, require_reauthentication=True)

        # Get parameters
        owner = self.get_param(self.request, "owner", mandatory=True)
        location = self.get_param(self.request, "location", mandatory=True)
        n_ids = self.get_param(self.request, "n_ids", type=int, mandatory=True)

        # Register the replica
        props = self.rep_engine.registerReplica(extract_type, owner, location, n_ids)

        Session.flush()
        Session.commit()

        return props

    @view_config(
        route_name="myw_sync_controller.update_replica", request_method="PUT", renderer="json"
    )
    def update_replica(self):
        """
        Register a new replica, allocate it a name and a shard

        Returns allocated values"""
        replica_id = self.request.matchdict["replica_id"]

        self.current_user.assertAuthorized(self.request, require_reauthentication=True)

        # Get parameters
        owner = self.get_param(self.request, "owner", mandatory=True)
        location = self.get_param(self.request, "location", mandatory=True)

        # Register the replica
        self.rep_engine.updateReplica(replica_id, owner, location)

        Session.flush()
        Session.commit()

        return {"replica_id": replica_id}

    @view_config(
        route_name="myw_sync_controller.allocate_shard", request_method="PUT", renderer="json"
    )
    def allocate_shard(self):
        """
        Allocate an additional shard to REPLICA_ID

        Used by shard rollover in NativeApps

        Returns shard range"""
        replica_id = self.request.matchdict["replica_id"]

        self.current_user.assertAuthorized(self.request, require_reauthentication=True)

        # Unpick paramaters
        n_ids = self.get_param(self.request, "n_ids", type=int, mandatory=True)

        # Check replica exists and is active
        self.assert_active_replica("allocate shard", replica_id)

        # Allocate shard
        shard_props = self.rep_engine.allocateExtraShard(replica_id, n_ids)
        Session.commit()

        return shard_props

    @view_config(
        route_name="myw_sync_controller.list_master_updates", request_method="GET", renderer="json"
    )
    def list_master_updates(self):
        """
        Lists download packages for REPLICA_TYPE since version SINCE

        Returns a set of property sets, keys by update ID"""
        extract_type = self.request.matchdict["extract_type"]

        self.current_user.assertAuthorized(self.request)

        since_id = self.get_param(self.request, "since", type=int, default=0)
        settings = self.request.registry.settings
        trace_level = settings.get("myw.sync.options", {}).get("sync_log_level", 0)
        progress = MywSimpleProgressHandler(trace_level, "INFO: SYNC: ")

        # Get list of zip files
        updates = self.rep_engine.pendingUpdates(since_id, "master", extract_type)

        # Find their properties
        # If there is an issue with one of the update files, it will only return the updates before that point
        update_info = {}
        try:
            for (update_id, file_path) in sorted(list(updates.items()), key=lambda x: int(x[0])):
                file_path = self.rep_engine.pathToUpdate(update_id, "master", extract_type)
                file_stats = os.stat(file_path)
                file_size = file_stats.st_size
                # Check if size is below minimum for a ZIP file
                # (46 for central directory file header + 22 for EOCD record)
                if file_size < 68:
                    raise Exception(
                        f"File size for {file_path} is too small for zip file ({file_size} bytes)"
                    )

                update_info[update_id] = {
                    "file": file_path,
                    "size": file_size,
                    "date": time.ctime(file_stats.st_ctime),  # Enh: better from index file
                }
        except Exception as e:
            progress(2, f"Error: Unable to process update {update_id}: {e}")

        progress(5, f"Reporting update files as: {update_info}")
        return update_info

    @view_config(route_name="myw_sync_controller.download_master_update", request_method="GET")
    def download_master_update(self):
        """
        Get a master update from the sync directory
        """
        extract_type = self.request.matchdict["extract_type"]
        update_id = self.request.matchdict["update_id"]

        self.current_user.assertAuthorized(self.request)

        # Find file to download
        # ENH: Check it exists
        file_path = self.rep_engine.pathToUpdate(update_id, "master", extract_type)

        # Initiate the download
        return FileResponse(file_path)

    @view_config(route_name="myw_sync_controller.upload_replica_update", request_method="POST")
    def upload_replica_update(self):
        """
        Post a replica update to the sync directory and import to master
        """
        replica_id = self.request.matchdict["replica_id"]
        update_id = self.request.matchdict["update_id"]

        self.current_user.assertAuthorized(
            self.request, require_reauthentication=True, ignore_csrf=True, ignore_referer=True
        )

        # Check replica exists and is active
        replica_rec = self.assert_active_replica("upload from", replica_id)

        # Get data from request
        # ENH: Find a cleaner way?
        n_bytes = int(self.request.environ["CONTENT_LENGTH"])
        data = self.request.environ["wsgi.input"].read(n_bytes)

        # Get location to store file at
        # ENH: This can potentially case issues if the write fails, we should instead write to a temp file first then rename to the correct filename
        file_path = self.rep_engine.pathToUpdate(update_id, replica_id)

        # Store it
        with open(file_path, "wb") as local_file:
            local_file.write(data)

        # Import it
        with self.rep_engine.progress.operation("Importing update for", replica_id):
            self.rep_engine.importUpdatesForReplica(replica_rec)

        Session.flush()
        Session.commit()

        return self.request.response

    @view_config(route_name="myw_sync_controller.update_replica_status", request_method="POST")
    def update_replica_status(self):
        """
        Update master's info on status of replica REPLICA_ID
        """
        replica_id = self.request.matchdict["replica_id"]

        self.current_user.assertAuthorized(self.request, ignore_csrf=True, ignore_referer=True)

        # Unpick request payload
        master_update = self.get_param(self.request, "master_update")

        # Check replica exists
        self.assert_active_replica("update_status", replica_id)

        # Update the replica meta-data
        self.rep_engine.updateReplicaStatus(replica_id, master_update)

        Session.flush()
        Session.commit()

        return self.request.response

    @view_config(route_name="myw_sync_controller.store_client_logs", request_method="POST")
    def store_client_logs(self):
        """
        Store latest client logs for replica REPLICA_ID
        """
        replica_id = self.request.matchdict["replica_id"]

        self.current_user.assertAuthorized(self.request, ignore_csrf=True, ignore_referer=True)

        # Check replica exists
        self.assert_active_replica("update_status", replica_id)

        # Unpick request payload
        logs = self.get_param(self.request, "logs")

        # Update the replica meta-data
        self.rep_engine.storeClientLogs(replica_id, logs)

        return self.request.response

    @view_config(route_name="myw_sync_controller.drop_replica", request_method="POST")
    def drop_replica(self):
        """
        Mark a replica as no longer in use
        """
        replica_id = self.request.matchdict["replica_id"]

        self.current_user.assertAuthorized(self.request)

        # Check replica exists and is active
        self.assert_active_replica("drop", replica_id)

        # Mark the replica
        self.rep_engine.dropReplica(replica_id)

        Session.flush()
        Session.commit()

        return self.request.response

    def assert_active_replica(self, operation, replica_id):
        """
        Check REPLICA_ID exists and is active

        If validation fails, aborts"""

        # ENH: Abort codes don't really match the HTTp meanings. Return a string instead

        # Check replica exists
        rec = self.rep_engine.db.replicaRec(replica_id)
        if rec == None:
            print("WARNING: SYNC: Attempt to", operation, "unknown replica:", replica_id)
            raise exc.HTTPExpectationFailed()

        # Check that it is still active
        if rec.status != "active":
            print("WARNING: SYNC: Attempt to", operation, "non-active replica:", replica_id)
            raise exc.HTTPGone()

        return rec
