################################################################################
# Superclass for controllers that manage access to a single table
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json, geojson
import pyramid.httpexceptions as exc

from myworldapp.core.server.dd.myw_reference import MywReference
from myworldapp.core.server.auth.myw_current_user import MywCurrentUser
from myworldapp.core.server.base.core.myw_os_engine import is_subdirectory


class MywController:
    """
    Superclass for controllers that manage access to myworld data

    Provides a MywCurrentUser object for use in request authorisation (see .current_user)"""

    def __init__(self, request):
        """
        Initialize slots if self
        """

        self.request = request
        self.current_user = MywCurrentUser(request.session, request.registry.settings)

    def get_param(
        self, request, name, type=str, list=False, default=None, mandatory=False, values=None
    ):
        """
        Helper to get request parameter NAME, cast to TYPE

        TYPE is a class or special type name ('json', 'geojson' or 'reference').
        VALUES defines permitted values.
        """
        # ENH: Provide mechanism to define arg signature (like argparse)

        # Get value (if present)
        val = request.params.get(name)

        # Check for missing value
        if val in ("", None):
            if not mandatory:
                return default
            print("Malformed request:", request.url, ":", "Missing parameter", ":", name)
            raise exc.HTTPBadRequest()

        # Cast and validate
        if list:
            vals = []
            for item in val.split(","):
                vals.append(self._cast_param(request, name, item, type, values))

            return vals

        else:
            return self._cast_param(request, name, val, type, values)

    def sanitise_error_message(self, message):
        """
        Helper to strip insecure data from errors, e.g. server paths.

        MESSAGE is the error that the server has generated so far.
        """

        # Sanitise error messages for absolute paths:
        web_root_dir = self.request.registry.settings["pyramid.paths"]["root"]
        upload_cache_dir = self.request.registry.settings["myw.upload_cache"]

        # Note, we will only overwrite the message if we detect an FS path in it.
        normalised_message = self.normalise_paths_in_message(message)

        if not is_subdirectory(web_root_dir, upload_cache_dir):
            # Also obfuscate location of the upload cache, if it's not a subdir of WEBROOT.
            if upload_cache_dir in normalised_message:
                message = normalised_message.replace(upload_cache_dir, "UPLOAD_CACHE")

        if web_root_dir in normalised_message:
            message = normalised_message.replace(web_root_dir, "WEBROOT")

        return message

    def _cast_param(self, request, name, val, type, permitted_values):
        """
        Returns VAL cast to TYPE (a class or special type name)
        """

        try:
            if type == bool:
                cast_val = self._as_bool(val)
            elif type == "json":
                cast_val = json.loads(val)
            elif type == "geojson":
                cast_val = geojson.loads(val, object_hook=(geojson.GeoJSON.to_instance))
            elif type == "reference":
                cast_val = MywReference.parseUrn(val, error_if_bad=True)
            elif type == "coords":
                cast_val = self._as_coords(val)
            else:
                cast_val = type(val)

        except ValueError as cond:
            print("Malformed request:", request.url, ":", "Parameter", name, ":", val, ":", cond)
            raise exc.HTTPBadRequest()

        # Check enum constraint (if given)
        if permitted_values and not cast_val in permitted_values:
            print(
                "Malformed request:",
                request.url,
                ":",
                "Bad value for parameter",
                name,
                ":",
                val,
                ":",
                "Permitted",
                permitted_values,
            )
            raise exc.HTTPBadRequest()

        return cast_val

    def _as_coords(self, val):
        """
        Casts string VAL to a list of xy tuples (or raises error)
        """

        vals = val.split(",")
        n_vals = len(vals)

        # Check we have a list of pairs
        if (n_vals % 2) != 0:
            raise ValueError("Expected X,Y pairs")

        # Cast to coords
        coords = []
        for i in range(0, n_vals, 2):
            x = float(vals[i])
            y = float(vals[i + 1])
            coords.append((x, y))

        return coords

    def _as_bool(self, val):
        """
        Casts string VAL to a boolean (or raises error)
        """

        bool_strs = {"true": True, "false": False}

        val = val.lower()
        if not val in bool_strs:
            raise ValueError("Bad value for boolean")

        return bool_strs[val]

    @staticmethod
    def normalise_paths_in_message(path):
        """Sometimes error messages will contain paths, and Windows paths can sometimes end up
        with extra backslashes. This function very carefully doesn't care if the string is a
        valid path, it just blindly removes any double-backslashes until only one remains in
        that position. Useful for comparisons when sanitising error messages."""
        while "\\\\" in path:
            path = path.replace("\\\\", "\\")

        return path
