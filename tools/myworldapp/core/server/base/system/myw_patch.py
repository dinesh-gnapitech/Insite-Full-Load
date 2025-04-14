# ==============================================================================
# myw_patch
# ==============================================================================
# Copyright: IQGeo Limited 2010-2023

import os, zipfile, json
from myworldapp.core.server.base.core.myw_error import MywError


class MywPatch:
    """
    Models a myWorld patch (a zip file containing patch_info.json + old and new source)

    Provides protocols for yielding meta-data and source file from the patch zip"""

    def __init__(self, patch_file):
        """
        Init slots of self
        """

        self.zip_file = patch_file
        self.id = os.path.basename(patch_file).split(".")[0]

        # Get properties
        patch_info = self._read_patch_info(patch_file)

        try:
            self.module = patch_info.pop("module")
            self.target = patch_info.pop("target")
            self.title = patch_info.pop("title")
            self.description = patch_info.pop("description", "")
            self.date_released = patch_info.pop("date_released")
        except KeyError as cond:
            raise MywError(self.id, ":", "Missing property in patch_info.json", ":", cond)

        if patch_info:
            raise MywError(
                self.id, ":", "Unknown property in patch_info.json", ":", list(patch_info.keys())[0]
            )

        (self.old_files, self.new_files) = self._read_source_lists(patch_file)

    @property
    def module_and_version(self):
        """
        A string indentifying self's target module
        """

        return "{}({})".format(self.module, self.target)

    def meta_data(self):
        """
        Meta-data for self
        """

        info = self._read_patch_info(self.zip_file)
        info["id"] = self.id

        return info

    def _read_patch_info(self, patch_file):
        """
        Get meta-data from PATCH_FILE
        """

        try:
            with zipfile.ZipFile(patch_file, "r") as patch_zip:
                with patch_zip.open("patch_info.json", "r") as patch_info:
                    return json.load(patch_info)

        except (IOError, KeyError) as cond:
            raise MywError(self.id, ":", cond)

    def _read_source_lists(self, patch_file):
        """
        Names of source files from the 'old' and 'new' trees
        """

        old_file_names = []
        new_file_names = []

        with zipfile.ZipFile(patch_file, "r") as patch_zip:
            for file_name in patch_zip.namelist():

                if file_name.startswith("old/"):
                    old_file_names.append(file_name[4:])
                elif file_name.startswith("new/"):
                    new_file_names.append(file_name[4:])
                elif file_name != "patch_info.json":
                    raise MywError(self.id, ":", "Unexpected file in zip", ":", file_name)

        return sorted(old_file_names), sorted(new_file_names)

    def changes(self, change_codes="AMD"):
        """
        Source changes made by self

        Yields tuples of the form:
          CHANGE_CODE  A, M or D  (add, modify or delete)
          FILE_NAME    File that is changed"""

        # Yield mods and adds
        for file_name in self.new_files:
            if file_name in self.old_files:
                if "M" in change_codes:
                    yield "M", file_name
            else:
                if "A" in change_codes:
                    yield "A", file_name

        # Yield deletes
        for file_name in self.old_files:
            if not file_name in self.new_files:
                if "D" in change_codes:
                    yield "D", file_name
