################################################################################
# Controller for data upload requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# General imports
import os, traceback, urllib.request, urllib.parse, urllib.error
from pyramid.view import view_config
from pyramid.renderers import render
from base64 import b64decode
import time

from myworldapp.core.server.base.core.myw_os_engine import is_subdirectory
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.database.myw_data_loader import MywDataLoadError
from myworldapp.core.server.database.myw_database import MywDatabase
from myworldapp.core.server.base.core.myw_error import MywInvalidFileTypeError

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywUploadDataController(MywController):
    """
    Controller for the 'upload data' config page
    """

    def __init__(self, request):
        """
        Init slots of self
        """
        super(MywUploadDataController, self).__init__(request)
        self.request = request

        self.db = MywDatabase(Session)

    def index(self):
        """
        redirect to the upload page.
        """
        self.current_user.assertAuthorized(
            self.request, right="manageUpload", redirect_on_fail=True
        )

        template_values = {}
        if "message" in self.request.params:
            template_values["upload_message"] = self.request.params["message"]

        return render("/upload-data.html", template_values)

    @view_config(
        route_name="myw_upload_data_controller.create", request_method="POST", renderer="json"
    )
    def create(self):
        """
        Upload the data file and process it.
        """

        self.current_user.assertAuthorized(self.request, right="manageUpload")

        ok = False
        try:

            # Get load options
            autocreate = self.request.POST["autocreate-table"] == "true"

            file_encoding = None
            if "file-encoding" in self.request.POST:
                file_encoding = self.request.POST["file-encoding"]

            self._validateUploadFile(
                self.request.POST["file_data"], self.request.POST["filename"], file_encoding
            )

            # Store data to local file
            local_filename = self._receiveUploadFile(
                self.request.POST["file_data"], self.request.POST["filename"], file_encoding
            )

            # Load local file
            (n_processed, msg) = self.db.data_loader.loadFile(
                local_filename, autocreate=autocreate, file_encoding=file_encoding
            )
            ok = True

        except MywDataLoadError as cond:
            if "internal_exception" in cond.kwargs:
                # retrieve the inner, inner exception:
                psycopg2_error = cond.kwargs["internal_exception"].orig

                # Build a small, human readable message for the user. Include the human readable message, and table.column
                # (which should match the JSON input.)
                # always present
                summary = psycopg2_error.diag.message_primary

                # may be None
                suffix = []
                if psycopg2_error.diag.table_name:
                    suffix.append(psycopg2_error.diag.table_name)

                if psycopg2_error.diag.column_name:
                    suffix.append(psycopg2_error.diag.column_name)

                if suffix:
                    # If both table and column are present, we'll separate them with a dot.
                    suffix = " ({})".format(".".join(suffix))
                else:
                    suffix = ""

                message = f"{summary}{suffix}"
            else:
                message = ", ".join(cond.args)

            msg = f"Data loading error: {message}"

        except Exception as cond:
            print("myw_upload_data.create()", cond, traceback.format_exc())
            msg = "Unexpected error: " + str(cond)

        finally:
            self.db.commit(ok)

        msg = self.sanitise_error_message(msg)

        return {"success": ok, "msg": msg}

    def _validateUploadFile(self, data, filename, encoding):
        # File extensions we accept over the Web GUI / API:
        # Note: we use a set, as __contains__ is ~3x faster than for a list.
        WHITELIST = {
            "def",
            "config",
            "enum",
            "datasource",
            "layer",
            "layer_group",
            "localisation",
            "private_layer",
            "network",
            "application",
            "role",
            "user",
            "group",
            "table_set",
            "rights",
            "settings",
            "delta",
            "csv",
            "json",
            # ENH: We could also allow KML/KMZ, and OGR shapefiles, but developing a definitive
            # list of extensions for these is tricky, and limiting the web API seems reasonable.
        }

        extension = filename.split(".")[-1]
        if extension not in WHITELIST:
            raise MywInvalidFileTypeError(f"Invalid file extension {extension}.")

        # ENH - check that the contents (`data`) are exected for the given file type.

    def _receiveUploadFile(self, data, filename, encoding):
        """
        Save text DATA to a local file with name FILENAME

        Returns file path to file created"""

        # Create local directory (if necessary)
        settings = self.request.registry.settings
        cache_directory = settings["myw.upload_cache"]
        try:
            os.makedirs(cache_directory)
        except:
            pass

        # Construct unique local name for file (retaining start and extension)
        parts = filename.split(".")
        parts.insert(-1, str(int(time.time())))
        local_filename = ".".join(parts)
        local_path = os.path.join(cache_directory, local_filename)

        # If the local path is outside of the cache directory place the file directly in the cache directory
        if not is_subdirectory(cache_directory, local_path):
            # Log the path traversal
            print("WARNING:", "Directory traversal detected during upload:", local_path)
            local_path = os.path.join(cache_directory, os.path.basename(local_path))

        # Write data to it
        local_file = open(local_path, "wb")
        try:
            data = urllib.parse.unquote(data)  # inverse to javascript's encodeURIComponent
            head, data = data.split(
                ","
            )  # strip heading that gets added by FileReader.readAsDataURL();
            data = b64decode(data)

            local_file.write(data)

        finally:
            local_file.close()

        return local_path
