from os import path
import json, time
from pyramid.view import view_config
from pyramid.response import FileResponse
import pyramid.httpexceptions as exc

from myworldapp.core.server.controllers.base.myw_controller import MywController
from myworldapp.core.server.base.core.utils import serveDownload
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.database.myw_database import MywDatabase
from myworldapp.core.server.models.myw_extract_key import MywExtractKey


class MywExtractDownloadController(MywController):
    """
    Controller for database extract download related requests
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        MywController.__init__(self, request)

        self.db = MywDatabase(Session)

    @view_config(
        route_name="myw_extract_download_controller.list", request_method="GET", renderer="json"
    )
    def list(self):
        """
        Returns a list of extracts that the current user has access to and their options
        """
        if not self.enabled:
            raise exc.HTTPNotFound()

        if self.authenticate:
            self.current_user.assertAuthorized(self.request)

        extracts = self._getAccessibleExtracts()

        # Process all fetched records into a format that the native client can use
        ret = {}
        for extract in extracts:
            expiry_time = extract["expiry_time"]
            if expiry_time is not None:
                expiry_time = int(time.mktime(expiry_time.timetuple()))

            name = extract["folder_name"] or extract["name"]
            ret[name] = {
                "extract_type": extract["name"],
                "expiry_time": expiry_time,
                "writable_by_default": extract["writable_by_default"],
            }

        return ret

    @view_config(route_name="myw_extract_download_controller.metadata", request_method="GET")
    def metadata(self):
        """
        Fetches the contents of the metadata.json file for the specified extract
        """
        folder_name = self.request.matchdict["folder_name"]

        if not self.enabled:
            print("Extract download via server not enabled")
            raise exc.HTTPNotFound()

        if self.authenticate:
            self.current_user.assertAuthorized(self.request)

        downloadFile = self._get_path_for(folder_name, "metadata.json")
        if not path.exists(downloadFile):
            print("Path does not exist:", downloadFile)
            raise exc.HTTPNotFound()

        return FileResponse(downloadFile)

    @view_config(route_name="myw_extract_download_controller.file", request_method="GET")
    def file(self):
        """
        Streams the contents of a file from requested database, or throws a 404 error if file doesn't exist
        """
        folder_name = self.request.matchdict["folder_name"]
        filename = self.request.matchdict["filename"]

        if not self.enabled:
            raise exc.HTTPNotFound()

        if self.authenticate:
            self.current_user.assertAuthorized(self.request)

        downloadFile = self._get_path_for(folder_name, filename)
        serveDownload(self.request, downloadFile)
        return self.request.response

    @view_config(
        route_name="myw_extract_download_controller.key", request_method="GET", renderer="string"
    )
    def key(self):
        """
        Streams the contents of a file from requested database, or throws a 404 error if file doesn't exist
        """
        folder_name = self.request.matchdict["folder_name"]

        if not self.enabled:
            raise exc.HTTPNotFound()

        if self.authenticate:
            self.current_user.assertAuthorized(self.request)

        extract_key_record = Session.query(MywExtractKey).get(folder_name)
        if not extract_key_record:
            raise exc.HTTPNotFound()  # Could be a 403, but this should be more secure

        return extract_key_record["extract_key"]

    # ==============================================================================
    #                    HELPER FUNCTIONS / SHARED FUNCTIONALITY
    # ==============================================================================

    @property
    def enabled(self):
        """
        Returns True if downloads have been enabled (via replication.download_root setting)
        """
        download_root = self.db.setting("replication.download_root")
        return download_root != ""

    @property
    def download_root(self):
        """
        Returns the configured download root directory (via replication.download_root setting)
        """
        return self.db.setting("replication.download_root")

    @property
    def authenticate(self):
        """
        Returns True if authentication is required
        """
        anonymous = self.db.setting("replication.anonymous_downloads")
        return anonymous != True

    def _getAccessibleExtracts(self):
        """
        Returns a list of extracts and their options that this user has access to
        """
        return self.current_user.extractsConfig()

    def _ensureUserCanAccessExtract(self, extract_type):
        """
        Throws a 401 error if the user cannot access the specified extract
        """
        extracts = self._getAccessibleExtracts()
        extract_types = [rec["name"] for rec in extracts]

        if extract_type not in extract_types:
            raise exc.HTTPUnauthorized()

    def _get_path_for(self, folder_name, filename):
        """
        Fetches the path to the database filename, ensuring user has appropriate access
        """
        if not self.enabled:
            raise exc.HTTPBadRequest("Extracts download path is not defined or doesn't exist")

        extractDir = path.join(self.download_root, folder_name)

        extract_type = None
        try:
            metadata_path = path.join(extractDir, "metadata.json")
            with open(metadata_path) as json_file:
                metadata = json.load(json_file)
                extract_type = metadata["extract_type"]
        except:
            print("Unable to read metadata.json in ", extractDir)
            raise exc.HTTPBadRequest("Unable to read metadata.json")

        # check if user has access to this extract type
        self._ensureUserCanAccessExtract(extract_type)

        return path.join(extractDir, filename)
