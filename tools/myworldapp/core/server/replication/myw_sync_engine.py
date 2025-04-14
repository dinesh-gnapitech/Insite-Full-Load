################################################################################
# Superclass for engines performing replication file upload/download
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler


class MywSyncEngine:
    """
    Abstract superclass for replication sync engines

    A sync engine provides an API for registering a replica,
    downloading and uploading files. Provided to allow extracts
    and replicas to sync via VPN or HTTP requests

    Subclasses must implement:
      .register(extract_type,owner,location,n_ids)
      .pendingUpdates(since_id,*path)
      .downloadFile(sync_dir,local_dir,file_name)
      .uploadFile(self,sync_dir,local_dir,file_name)"""

    def __init__(self, progress=MywProgressHandler()):
        """
        Init slots of self
        """

        self.progress = progress

    def ensurePath(self, root, *dirs):
        """
        Create directory tree DIRS (if necessary)

        Returns path to tree"""

        path = root

        for dir in dirs:
            path = os.path.join(path, dir)
            if not os.path.exists(path):
                self.progress(3, "Creating directory", path)
                os.mkdir(path)

        return path
