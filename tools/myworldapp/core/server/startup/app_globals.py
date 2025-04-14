# Copyright: IQGeo Limited 2010-2023

"""The application's Globals object"""

from beaker.cache import CacheManager
from beaker.util import parse_cache_config_options

from shutil import copy
from os import path


class Globals:
    """
    Container for objects available throughout the life of the application
    """

    def __init__(self, config):
        """
        One instance of Globals is created during application
        initialization and is available during requests via the
        'app_globals' variable
        """

        self.cache = CacheManager(**parse_cache_config_options(config))

        # The next section reads a GLOBAL that specifies files that need to be
        # be copied into different locations at startup.  It copies these
        # files into place.
        startup_copies = config.get("myw.startup_copies", [])

        if startup_copies:

            # This file is always in the app/lib directory so we need to backup two
            base_path = path.dirname(__file__) + "\\..\\..\\"

            # Do the copying.
            for partial_source_file, partial_target_directory in list(startup_copies.items()):

                # Build the source and target
                source_file = base_path + partial_source_file
                target_directory = base_path + partial_target_directory

                # Make sure that the source file exists
                if not path.exists(source_file):
                    print(
                        "*** Warning *** Could not find ",
                        source_file,
                        " in order to copy it to ",
                        target_directory,
                    )
                    continue

                # Make sure that the target directory exists.
                if not path.exists(target_directory):
                    print(
                        "*** Warning *** Could not find ",
                        target_directory,
                        " in order to copy ",
                        source_file,
                        " to it",
                    )
                    continue

                # Ok. Copy the file
                copy(source_file, target_directory)
                print("*** Information *** Copied ", source_file, " to ", target_directory)
