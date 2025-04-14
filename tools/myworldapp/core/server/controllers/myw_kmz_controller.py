###############################################################################
# KMZ controller
###############################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import urllib.request, urllib.parse, urllib.error
import json
import tempfile
import hashlib
import os
import shutil
import zipfile
import base64
from pyramid.view import view_config
import pyramid.httpexceptions as exc
from contextlib import closing

from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.core.utils import serveDownload
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_datasource import MywDatasource
from myworldapp.core.server.models.myw_layer import MywLayer
from myworldapp.core.server.models.myw_private_layer import MywPrivateLayer

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywKmzController(MywController):
    """
    Controller for handling tunnelled requests for KMZ data
    """

    def __init__(self, request):
        """
        Initialize self
        """

        MywController.__init__(self, request)

        settings = request.registry.settings
        trace_level = settings.get("myw.kmz.options", {}).get("log_level", 0)

        self.progress = MywSimpleProgressHandler(trace_level, "INFO: KMZ: ")

    def _get_layer_rec(self, layer_name, layer_owner):
        # Unpick args
        self.progress(3, "Getting KMZ for:", layer_name, "owner=", layer_owner)

        # Get layer record
        if layer_owner:
            layer_id = layer_owner + ":" + layer_name
            layer_rec = Session.query(MywPrivateLayer).get(layer_id)
        else:
            # ENH: Get from config cache
            layer_rec = Session.query(MywLayer).filter(MywLayer.name == layer_name).first()

        if layer_rec is None:
            self.progress(1, "No such layer:", layer_name, layer_owner)
            raise exc.HTTPNotFound()
        else:
            return layer_rec

    def _get_latest_folder(self, directory):
        # Returns the last created folder in this directory, deletes all others
        dirs_in_folder = []
        for f in os.listdir(directory):
            abs_path = os.path.join(directory, f)
            if os.path.isdir(abs_path):
                dirs_in_folder.append(abs_path)

        newest_dir = None
        newest_dir_date = None
        for directory in dirs_in_folder:
            if newest_dir is None:
                newest_dir = directory
                newest_dir_date = os.stat(newest_dir).st_mtime
            else:
                dir_date = os.stat(directory).st_mtime
                if dir_date > newest_dir_date:
                    shutil.rmtree(newest_dir)
                    newest_dir = directory
        return newest_dir

    def _get_kmz_file_contents(self, kmz_file, file_in_kmz):
        # Determine if we should re-cache the file and if it exists at all
        temp_directory = tempfile.gettempdir()
        cached_folder_name = os.path.join(
            temp_directory, hashlib.md5(kmz_file.encode("utf-8")).hexdigest()
        )
        cached_folder_exists = os.path.exists(cached_folder_name)
        cached_folder_size_name = None
        extract_to_folder = None
        download_file = None

        if cached_folder_exists:
            cached_folder_size_name = self._get_latest_folder(cached_folder_name)

        try:
            with closing(urllib.request.urlopen(kmz_file)) as connection:
                file_size = connection.headers["content-length"]
                extract_to_folder = os.path.join(cached_folder_name, file_size)
                # If it doesn't exist, download it then delete the old version if it exists
                if not os.path.exists(extract_to_folder):
                    # Download to a temp file
                    temp_file_id, download_file = tempfile.mkstemp()
                    with open(download_file, "wb") as out:
                        CHUNK_SIZE = 16 * 1024
                        # Perform the file download
                        while True:
                            chunk = connection.read(CHUNK_SIZE)
                            if not chunk:
                                break
                            out.write(chunk)

                    # Extract to the cache folder
                    with zipfile.ZipFile(download_file) as zip_file:
                        zip_file.extractall(extract_to_folder)

                    # Delete the old cached folder if it exists
                    if cached_folder_size_name is not None:
                        shutil.rmtree(cached_folder_size_name)

                    cached_folder_size_name = extract_to_folder

        except urllib.error.URLError as cond:
            # In the event that we can't connect, used the cached version if it exists
            if not cached_folder_exists:
                self.progress(
                    1,
                    "Get KMZ failed, couldn't fetch and no cached version exists:",
                    kmz_file,
                    cond,
                )
                raise exc.HTTPNotFound()
            else:
                self.progress(1, "Get KMZ failed, falling back to cached version")

        requested_file = os.path.join(cached_folder_size_name, file_in_kmz)
        if os.path.exists(requested_file) and os.path.isfile(requested_file):
            serveDownload(self.request, requested_file)
            return self.request.response
        else:
            raise exc.HTTPNotFound()

    @view_config(route_name="myw_kmz_controller.get_kmz_layer", request_method="GET")
    def get_kmz_layer(self):
        """
        Get a file in the KMZ file referenced by the KMZ datasource and a specific filename (used when testing)
        """
        layer_name = self.request.matchdict["layer_name"]
        return self._get_kmz_layer_file(layer_name, None)

    @view_config(route_name="myw_kmz_controller.get_kmz_layer_file", request_method="GET")
    def get_kmz_layer_file(self):
        """
        Get a file in the KMZ file referenced by the KMZ datasource (used in app)
        """
        layer_name = self.request.matchdict["layer_name"]
        file_in_kmz = self.request.matchdict["file_in_kmz"]

        return self._get_kmz_layer_file(layer_name, file_in_kmz)

    @view_config(route_name="myw_kmz_controller.get_kmz_file", request_method="GET")
    def get_kmz_file(self):
        """
        Get a file in the KMZ file referenced by the KMZ datasource (used in config)
        """
        self.current_user.assertAuthorized(self.request)
        kmz_file = self.request.matchdict["kmz_file"]
        file_in_kmz = self.request.matchdict["file_in_kmz"]

        kmz_file = base64.b64decode(kmz_file).decode("utf-8")
        file_in_kmz = base64.b64decode(file_in_kmz).decode("utf-8")

        return self._get_kmz_file_contents(kmz_file, file_in_kmz)

    def _get_kmz_layer_file(self, layer_name, file_in_kmz):
        self.current_user.assertAuthorized(self.request)
        layer_owner = self.get_param(self.request, "owner")
        layer_rec = self._get_layer_rec(layer_name, layer_owner)
        layer_spec = json.loads(layer_rec.spec)
        if (
            "isKmz" not in layer_spec
            or not layer_spec["isKmz"]
            or "fileInKmz" not in layer_spec
            or "kmzFile" not in layer_spec
        ):
            self.progress(1, "Layer does not have KMZ info specified:", layer_rec)
            raise exc.HTTPBadRequest()

        # Make sure the requested datasource exists
        datasource_rec = (
            Session.query(MywDatasource)
            .filter(MywDatasource.name == layer_rec.datasource_name)
            .first()
        )

        if datasource_rec is None:
            self.progress(1, "No such datasource:", datasource_rec)
            raise exc.HTTPNotFound()

        datasource_spec = json.loads(datasource_rec.spec)
        if "baseUrl" not in datasource_spec:
            self.progress(1, "Datasource has no base URL specified:", datasource_rec)
            raise exc.HTTPBadRequest()

        url = datasource_spec["baseUrl"]
        if not url.endswith("/"):
            url += "/"
        kmz_file = url + layer_spec["kmzFile"]
        if file_in_kmz is None:
            file_in_kmz = layer_spec["fileInKmz"]
        else:
            file_in_kmz = base64.b64decode(file_in_kmz).decode("utf-8")
        return self._get_kmz_file_contents(kmz_file, file_in_kmz)
