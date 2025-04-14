################################################################################
# Controller for on-demand extraction requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os, urllib.request, urllib.parse, urllib.error, datetime, shutil

from pyramid.view import view_config

from myworldapp.core.server.base.geom.myw_geometry import MywGeometry
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.database.myw_database import MywDatabase
from myworldapp.core.server.replication.myw_snapshot_engine import MywSnapshotEngine

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywSnapshotController(MywController):
    """
    Controller for replica synchronisation requests

    Note that sync requests do not consume a server licence (do
    not count as a myWorld online 'user')"""

    def __init__(self, request):
        """
        Initialize self
        """

        MywController.__init__(self, request)

        settings = request.registry.settings
        trace_level = settings.get("myw.sync.options", {}).get("snapshot_log_level", 0)

        self.public_dir = settings["pyramid.paths"]["static_files"]
        self.snapshots_dir = os.path.join(
            self.public_dir, "snapshots"
        )  # ENH: Move location down into sub-dir (with downloads etc) + make configurable

        self.progress = MywSimpleProgressHandler(trace_level, "INFO: SNAPSHOT: ")
        self._engine = None  # Init lazily to allow use of abort()

    @property
    def engine(self):
        """
        Self's snapshot engine (a MywSnapshotEngine)
        """

        if not self._engine:
            db = MywDatabase(Session)  # ENH: Could check this is a master database
            self._engine = MywSnapshotEngine(db, self.snapshots_dir, progress=self.progress)

        return self._engine

    @view_config(
        route_name="myw_snapshot_controller.extract", request_method="POST", renderer="string"
    )
    def extract(self):
        """
        Create an 'on demand' extract for the specified table_set and region

        Returns URL of ZIP file extracted"""
        table_set = self.request.matchdict["table_set"]

        # Check authorised
        self.current_user.assertAuthorized(self.request, require_reauthentication=True)

        # Delete old snapshots
        # ENH: Replace by explicit delete call by client after download
        self.prune_snapshots()

        # Get parameters (geometry sent in body to avoid URL overflow on large objects)
        region_geojson = self.get_param(self.request, "region", type="geojson", mandatory=True)
        region = MywGeometry.decode(region_geojson)  # ENH: Do this in get_param

        # Do the extraction
        file_path = self.engine.snapshot(table_set, region, user=self.current_user)

        # Build URL of zip file
        rel_path = os.path.relpath(file_path, self.public_dir)
        return urllib.request.pathname2url(os.path.sep + rel_path)

    def prune_snapshots(self):
        """
        Delete snapshots under self.snapshots_dir that are at least 15 minutes old
        """
        # Copied (with mods) from myw_export_csv_controller

        if os.path.exists(self.snapshots_dir):

            # For each file in the directorysnapshot directory ...
            for dirpath, dirnames, filenames in os.walk(self.snapshots_dir):

                # loop through all the directoriesFor each sub-dir ..
                for dirname in dirnames:

                    # get current path of a fileGet tile of last modification
                    file_path = os.path.join(dirpath, dirname)

                    # get file modified date and time
                    file_modified = datetime.datetime.fromtimestamp(os.path.getmtime(file_path))

                    # If the file is old .. delete it
                    if (datetime.datetime.now() - file_modified) > datetime.timedelta(minutes=15):
                        shutil.rmtree(file_path)
