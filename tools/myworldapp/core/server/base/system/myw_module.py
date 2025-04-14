# ******************************************************************************
# myw_module
# ******************************************************************************
# Copyright: IQGeo Limited 2010-2023

import os, json, fnmatch


class MywModule:
    """
    Models a myWorld module (including core)

    Provides protocols for obtaining version stamp etc"""

    def __init__(self, name, path):
        """
        Init slots of self

        PATH is the absolute path to self's root"""

        self.name = name
        self.path = path

    @property
    def version(self):
        """
        Version stamp from self's version_info file
        """
        # ENH: Cache this?

        version_info_file = os.path.join(self.path, "version_info.json")

        # Check for no file (can happen in dev env)
        if not os.path.isfile(version_info_file):
            return "dev"

        # Get version stamp from file
        with open(version_info_file) as file:
            version_info = json.load(file)

            if self.name == "core":
                return version_info["myw_version"]
            else:
                return version_info[self.name]

    def set_version(self, version):
        """
        Set version stamp to VERSION

        Should be used on module 'custom' only (to provoke a bust)"""

        version_info_file = os.path.join(self.path, "version_info.json")

        # Get version info from file
        with open(version_info_file) as file:
            version_info = json.load(file)

        # Update it
        version_info[self.name] = version

        # Write it back
        with open(version_info_file, "w") as file:
            json.dump(version_info, file)

    def python_path(self, *rel_path):
        """
        The python module path for a file in self
        """

        path = "myworldapp"

        if self.name == "core":
            path += ".core"
        else:
            path += ".modules." + self.name

        for dir in rel_path:
            path += "." + dir

        return path

    def file(self, *rel_path):
        """
        The absolute path to a path in self
        """

        return os.path.join(self.path, *rel_path)

    def files_matching(self, rel_dir, file_spec):
        """
        The names of files in self FILE_SPEC
        """

        for root, dirnames, filenames in os.walk(self.path):
            for filename in fnmatch.filter(filenames, file_spec):
                yield os.path.join(root, filename)
