# ******************************************************************************
# myw_product
# ******************************************************************************
# Copyright: IQGeo Limited 2010-2023

import os

from myworldapp.core.server.base.core.myw_error import MywError

from .myw_module import MywModule


class MywProduct:
    """
    Engine for accessing server configuration parameters
    """

    def __init__(self, root_dir=None):
        """
        Init slots of self
        """

        # Deal with defaults
        if not root_dir:
            root_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "..")

        # Set slots
        self.root_dir = os.path.abspath(root_dir)

        # Construct root paths
        self.myworldapp_dir = os.path.join(self.root_dir, "WebApps", "myworldapp")
        self.core_dir = os.path.join(self.myworldapp_dir, "core")
        self.modules_dir = os.path.join(self.myworldapp_dir, "modules")

    # ==============================================================================
    #                                   MODULE ACCESS
    # ==============================================================================

    def modules(self, include_core=True):
        """
        Yields MywModule object for each installed module
        """

        for module_name in self.module_names(include_core=include_core):
            yield self.module(module_name)

    def module_names(self, include_core=True):
        """
        Names of installed modules
        """

        names = []

        for name in os.listdir(self.modules_dir):
            if name == "__pycache__":
                continue

            path = os.path.join(self.modules_dir, name)
            if os.path.isdir(path):
                names.append(name)

        names.sort()

        if include_core:
            names = ["core"] + names

        return names

    def moduleOf(self, file_name):
        """
        MywModule object in which FILE_NAME sits

        FILE_NAME must be a full path"""

        bits = os.path.normpath(file_name).replace("\\", "/").lower().split("/")

        i_bit = len(bits) - 2
        while i_bit >= 0:
            if bits[i_bit] == "modules":
                return self.module(bits[i_bit + 1])
            i_bit -= 1

        return self.module("core")

    def module(self, name, check_exists=False):
        """
        MywModule object for NAME
        """

        if name == "core":
            path = self.core_dir
        else:
            path = os.path.join(self.modules_dir, name)

        if check_exists and not os.path.exists(path):
            raise MywError("No such module:", name)

        return MywModule(name, path)

    def full_path_for(self, src_file):
        """
        The full path to SRC_FILE in self's product
        """

        # ENH: Make consistent with module.file()

        return os.path.normpath(os.path.join(self.root_dir, src_file))
