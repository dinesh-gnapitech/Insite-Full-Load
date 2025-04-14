################################################################################
# Engine for performing replication file upload/download via HTTP requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os
import requests
from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError


class MywHttpSyncEngine:
    """
    Sync engine that operates via myWorld REST API requests

    USERNAME and PASSWORD are used to authenticate the server
    REST requests i.e. identify a myWorld user"""

    def __init__(self, sync_url, username, password, **opts):
        """
        Init slots of self
        """

        super(MywHttpSyncEngine, self).__init__(**opts)

        self.sync_url = sync_url
        self.username = username
        self.password = password

        self.session = requests.Session()
        self.csrf_token = None  # used as flag for lazy connect

    def register(self, extract_type, owner, location, n_ids):
        """
        Register a replica with the master database

        Returns dict giving properties allocated to replica (name, shard, etc)"""

        service = "sync/register/" + extract_type

        resp = self._performGetRequest(service, owner=owner, location=location, n_ids=n_ids)

        return resp.json()

    def pendingUpdates(self, since_id, *path):
        """
        Find updates to load from PATH since update SINCE_ID

        Returns set of full paths, keyed by update_id"""

        service = "sync"
        for item in path:
            service += "/" + item
        service += "/" + "index.json"

        resp = self._performGetRequest(service, since=since_id)

        res = {}
        for (update_id, props) in list(resp.json().items()):
            res[int(update_id)] = props["file"]

        return res

    def downloadFile(self, sync_dir, local_dir, file_name):
        """
        Download FILE_NAME from the sync directory

        Returns name of file created"""

        local_path = os.path.join(local_dir, file_name)

        # Build the request
        service = "sync"
        for item in sync_dir:
            service += "/" + item
        service += "/" + file_name

        with self.progress.operation(
            "Downloading", local_path, "from", self.sync_url + "/" + service
        ):

            # Request the file
            resp = self._performGetRequest(service)

            # Download it
            with open(local_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=512 * 1024):
                    if not chunk:  # discard keep-alives
                        continue
                    f.write(chunk)

        return local_path

    def uploadFile(self, sync_dir, local_dir, file_name):
        """
        Upload file FILE_PATH to the sync directory
        """

        local_path = os.path.join(local_dir, file_name)

        # Build the request
        service = "sync"
        for item in sync_dir:
            service += "/" + item
        service += "/" + file_name

        # Send the file
        with self.progress.operation("Uploading", local_path, "to", self.sync_url + "/" + service):
            self._performPostRequest(service, "file", local_path)

    def updateReplicaStatus(self, replica_id, master_update):
        """
        Update master status meta-data for replica REPLICA_ID
        """

        # Build the request
        service = "sync/{}/status".format(replica_id)
        data = {"master_update": master_update}

        # Send it
        self._performPostRequest(service, "json", data)

    # ==============================================================================
    #                                   HELPERS
    # ==============================================================================

    def _performGetRequest(self, service, **params):
        """
        Send a get request to the server and return the result

        Raises MywError if request fails"""

        # ENH: Use a subclass of MywError

        # Build full request
        req = self.sync_url + "/" + service
        sep = "?"
        for (param, value) in list(params.items()):
            req += "{}{}={}".format(sep, param, value)
            sep = "&"

        # Run it
        try:
            self._ensureConnected()

            self.progress("starting", "Sending GET request:", req)
            resp = self.session.get(req)
            self.progress("finished", "Response:", resp.status_code, "(", resp.reason, ")")

        except Exception as cond:
            raise MywError(str(cond))

        # Check the response
        if resp.status_code != 200:
            msg = "Request failed: {} : {} ({})".format(req, resp.status_code, resp.reason)
            raise MywError(msg)

        return resp

    def _performPostRequest(self, service, data_type, data):
        """
        Perform a POST operation

        DATA_TYPE is one of:
          'file'
          'json'"""

        req = self.sync_url + "/" + service
        headers = {}

        # Get data for payload
        if data_type == "file":
            with open(data, "rb") as file:
                payload = file.read()

        elif data_type == "json":
            # headers['Content-Type'] = 'application/json'
            payload = data  # json.dumps(data)

        else:
            raise MywInternalError("Bad option:", data_type)

        # Post it
        try:
            headers["X-CSRF-Token"] = self._ensureConnected()

            self.progress("starting", "Sending POST request:", req)
            resp = self.session.post(req, data=payload, headers=headers)
            self.progress("finished", "Response:", resp.status_code, "(", resp.reason, ")")

        except Exception as cond:
            raise MywError(str(cond))

        # Check the response
        if resp.status_code != 200:
            msg = "Request failed: {} : {} ({})".format(req, resp.status_code, resp.reason)
            raise MywError(msg)

    def _ensureConnected(self):
        """
        Ensure that we are logged to the master myWorld server

        Returns the cross site forgery protection token to use in subsequent requests"""

        if not self.csrf_token:
            self.csrf_token = self._connect()

        return self.csrf_token

    def _connect(self):
        """
        Login to the master myWorld server

        Returns the cross site forgery protection token to use in subsequent requests"""

        self.progress("starting", "Connecting to", self.sync_url, "as user", self.username)

        data = {"user": self.username, "pass": self.password}

        resp = self.session.post(self.sync_url + "/auth", data=data)

        self.progress("finished", "Response:", resp.status_code, "(", resp.reason, ")")

        if resp.status_code == 404:
            msg = "Cannot connect to {}: Server not found".format(self.sync_url)
            raise MywError(msg)

        elif resp.status_code != 200:
            msg = "Cannot connect to {} as user '{}': Bad username or password".format(
                self.sync_url, self.username
            )
            raise MywError(msg)

        return resp.cookies.get("csrf_token")

    def _disconnect(self):
        """
        Logout from the master myWorld server
        """

        self.csrf_token = None
