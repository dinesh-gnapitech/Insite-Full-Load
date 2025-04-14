# Copyright: IQGeo Limited 2010-2023

import os, argparse, glob, json, zipfile, tempfile, fnmatch, itertools

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.core.myw_tabulation import MywTableFormatter
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.system.myw_code_manager import MywCodeManager
from myworldapp.core.server.base.system.myw_patch_manager import MywPatchManager
from myworldapp.core.server.base.system.myw_patch import MywPatch

from .myw_command import MywCommand
from .myw_argparse_help_formatter import MywArgparseHelpFormatter


class OrderFileNotFoundError(MywError):
    """
    Internal error used by the Install command.
    """

    pass


class MissingOrInvalidPatchFilesError(MywError):
    """
    Error used to accumulate details between different modules about which patches are missing, and then to format
    that as one large error message to the user once all such details have been discovered.
    """

    def __init__(self, missing_patches):
        self.missing_patches = missing_patches

    def __str__(self):
        max_width = max(len(k) for k in list(self.missing_patches.keys()) + ["module"])
        padded_module_literal = "module".ljust(max_width)
        message = """
The following patches are not present for installation, and are not already installed.
Please download them and retry.
{module} patch_id
""".format(
            module=padded_module_literal
        )

        for key, patch_ids in self.missing_patches.items():
            padded_key = key.ljust(max_width)
            message += os.linesep.join([f"{padded_key} {patch_id}" for patch_id in patch_ids])

        return message


def _define_operation(arg_subparsers, operation, help):
    """
    Helper to add definition for an operation
    """

    op_def = arg_subparsers.add_parser(
        operation, help=help, formatter_class=MywArgparseHelpFormatter
    )
    op_def.set_defaults(operation=operation)

    return op_def


def _add_standard_args(op_def):
    """
    Define the 'standard' arguments
    """
    # Note: Done like this to get the standard args at end in help output
    op_def.add_argument(
        "--product",
        type=str,
        default=None,
        help="Product tree to operate on (default: tree of command)",
    )
    op_def.add_argument("--verbosity", type=int, metavar="LEVEL", default=2, help="Witterage level")


class MywProductCommand(MywCommand):
    """
    Engine implementing the product management command line utility
    """

    # ==============================================================================
    #                                 SHARED ARGS
    # ==============================================================================

    # Definition of command syntax (gets extended in operation clauses below)
    arg_parser = argparse.ArgumentParser(
        prog="myw_product", formatter_class=MywArgparseHelpFormatter
    )
    arg_parser.add_argument(
        "--version", action="version", version="%(prog)s " + MywCommand.version()
    )
    arg_parser.epilog = "Utility for managing the myWorld product installation."
    arg_subparsers = arg_parser.add_subparsers(
        dest="operation", help="Operation to perform", required=True
    )

    build_targets = MywCodeManager.libraries + ["all", "core_dev", "applications_dev"]

    def build_libs_for(self, lib):
        """
        Build targets for LIB (handling the 'all' case)
        """

        if lib == "all":
            # exclude 'config' and 'native' as they are built when building 'applications'
            return [lib for lib in self.code_mgr.libraries if lib not in ("config", "native")]

        return [lib]

    # ==============================================================================
    #                                  RUNNING
    # ==============================================================================

    def run_method(self, meth):
        """
        Execute method METH

        Subclassed to report database errors neatly"""

        # Init progress reporter
        self.progress = MywSimpleProgressHandler(self.args.verbosity)

        # Create helper engines
        self.product = MywProduct(self.args.product)
        self.os_engine = MywOsEngine(self.progress)
        self.patch_mgr = MywPatchManager(self.product, self.progress)
        self.code_mgr = MywCodeManager(self.product, self.progress)

        super(MywProductCommand, self).run_method(meth)

    # ==============================================================================
    #                                OPERATION LIST
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "list", help="Show properties of installation or patch file"
    )
    op_def.add_argument(
        "what",
        choices=["versions", "libraries", "patches", "patch"],
        nargs="?",
        default="libraries",
        help="Type of information to list",
    )
    op_def.add_argument("names", type=str, nargs="?", default="*", help="Item to list")
    op_def.add_argument("--full", action="store_true", help="Show all details)")
    op_def.add_argument(
        "--layout",
        type=str,
        choices=MywTableFormatter.layouts,
        default="columns",
        help="Format for output",
    )
    _add_standard_args(op_def)

    def operation_list(self):
        """
        Show summary of database content
        """
        if self.args.what == "versions":
            self.list_versions(self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "libraries":
            self.list_libraries(self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "patches":
            self.list_installed_patches(self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "patch":
            self.list_patch_details(self.args.names, self.args.layout, self.args.full)
        else:
            raise MywInternalError("Bad option: {}".format(self.args.what))

    def list_versions(self, name_spec, layout, full):
        """
        Helper to list installed modules matching NAME_SPEC
        """

        # Get data to display
        rows = []
        for name in self.product.module_names():

            if not fnmatch.fnmatchcase(name, name_spec):
                continue

            row = self.product.module(name)
            rows.append(row)

        # Display it
        cols = [["name", "module"], "version"]
        if full:
            cols += ["path"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_libraries(self, name_spec, layout, full):
        """
        Helper to list status of minified libraries matching NAME_SPEC
        """

        # Get data to display
        rows = []
        for lib in self.code_mgr.libraries:

            if not fnmatch.fnmatchcase(lib, name_spec):
                continue

            row = {"library": lib}

            if self.code_mgr.is_built(lib):
                row.update(self.code_mgr.build_info(lib))
                row["built"] = row.get("date") != None

            rows.append(row)

        # Display it
        cols = ["library", "built", "type"]
        if full:
            cols += ["date", ["location", "location", "{:100}"]]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_installed_patches(self, name_spec, layout, full):
        """
        List installed patches for module NAME_SPEC
        """

        # Get data to display
        rows = []

        for name in self.product.module_names():

            if not fnmatch.fnmatchcase(name, name_spec):
                continue

            installed_patches = self.patch_mgr.installed_patches(name)

            for patch_id, details in list(installed_patches.items()):
                details["patch"] = patch_id
                details["module"] = name
                rows.append(details)

        # Display it
        cols = ["module", "patch", "title"]
        if full:
            cols += ["applied", "user", "conflicts"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_patch_details(self, patch_file_spec, layout, full):
        """
        List details of patch files matching PATCH_FILE_SPEC
        """

        patch_files = self._patch_files_matching(patch_file_spec)

        # Get data to display
        rows = []
        for patch_file in patch_files:
            patch = MywPatch(patch_file)
            rows.append(patch)

        # Display it
        cols = [["id", "patch"], ["module_and_version", "module"], ["title", "title", "{}"]]
        if full:
            cols += ["description", "date_released"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    # ==============================================================================
    #                               OPERATION INCREMENT
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "increment", help="Increment a module version number"
    )
    op_def.add_argument("what", choices=["custom"], help="Module to increment version for")
    _add_standard_args(op_def)

    def operation_increment(self):
        """
        Increment the version number of the custom module

        This provokes a JavaScript bust"""

        module = self.product.module("custom")

        module.set_version(str(int(module.version) + 1))

        self.progress(1, "Set module version:", module.name, module.version)

    # ==============================================================================
    #                               OPERATION FETCH
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "fetch", help="Fetch dependencies from internet")
    op_def.add_argument(
        "what", choices=["node_modules", "pip_packages"], help="Type of dependency to fetch"
    )
    op_def.add_argument(
        "--exclude",
        nargs="*",
        default=[],
        help="python package names to exclude (e.g. gdal, because it is already installed)",
    )
    # User enters the human-friendly name, we know which pip packages those map to.
    optional_pip_packages = {
        "memcached": ["pylibmc"],
        "redis": ["redis"],
        "ldap": ["python-ldap"],
        "oidc": ["oidcmsg", "oidcrp"],
        "saml": ["xmlsec", "python3-saml"],
    }
    op_def.add_argument(
        "--include",
        nargs="*",
        default=[],
        help=f"optional python package sets to include (e.g. {', '.join(optional_pip_packages.keys())})",
    )
    _add_standard_args(op_def)

    def operation_fetch(self):
        """
        Fetch dependencies
        """

        if self.args.what == "node_modules":
            if self.args.include or self.args.exclude:
                raise MywError("fetch node_modules does not support --include or --exclude.")
            self.fetch_node_modules()
        elif self.args.what == "pip_packages":
            self.fetch_pip_packages()
        else:
            raise MywInternalError("Bad option: {}".format(self.args.what))

    def fetch_node_modules(self):
        """
        Fetch node_modules dependencies from internet
        """

        self.code_mgr.fetch_node_modules()

    def fetch_pip_packages(self):
        """
        Fetch node_modules dependencies from internet
        """

        exclude = self.exclude_list(
            self.args.include, self.args.exclude, MywProductCommand.optional_pip_packages
        )

        self.code_mgr.fetch_pip_packages(exclude)

    @staticmethod
    def exclude_list(include, exclude, optional_packages):
        """
        Compute which packages should be filtered out of the requirements.txt, given optional
        package list and the --include and --exclude args.

        include: list of package nicknames (e.g. `"saml"`)
        exclude: list of pip names (e.g. `"gdal"`)
        optional_packages: dictionary mapping nicknames `"saml"` to pip package lists
                            `["xmlsec", "python3-saml"]`.
        """

        # Compute what --include= means in terms of optional packages that are excluded:
        all_optional_packages = set(itertools.chain(*optional_packages.values()))
        included_optional_packages = set(
            itertools.chain(*(optional_packages[nickname] for nickname in include))
        )
        # (set difference operator)
        excluded_optional_packages = all_optional_packages - included_optional_packages

        return exclude + list(excluded_optional_packages)

    # ==============================================================================
    #                               OPERATION BUILD
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "build", help="Build JavaScript code bundles for deployment"
    )
    op_def.add_argument("library", choices=build_targets, help="Library to build")
    op_def.add_argument(
        "--debug", action="store_true", help="Build debug version (map files inline)"
    )
    _add_standard_args(op_def)

    def operation_build(self):
        """
        Build code
        """

        for lib in self.build_libs_for(self.args.library):
            self.code_mgr.build(lib, self.args.debug)

    # ==============================================================================
    #                               OPERATION WATCH
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "watch", help="Run the JavaScript watch process")
    op_def.add_argument("library", choices=build_targets, help="Library to build")
    op_def.add_argument(
        "--debug", action="store_true", help="Watch debug version (map files inline)"
    )
    _add_standard_args(op_def)

    def operation_watch(self):
        """
        Start the JavaScript incremental build helper
        """

        self.code_mgr.watch(self.args.library, self.args.debug)

    # ==============================================================================
    #                                OPERATION CLEAR
    # ==============================================================================
    op_def = _define_operation(arg_subparsers, "clear", help="Delete output from a build operation")
    op_def.add_argument("library", choices=build_targets, help="Library to clear")
    _add_standard_args(op_def)

    def operation_clear(self):
        """
        Clear output from build
        """

        for lib in self.build_libs_for(self.args.library):
            if self.code_mgr.is_built(lib):
                self.code_mgr.clear(lib)

    # ==============================================================================
    #                                OPERATION INSTALL
    # ==============================================================================

    patch_order_file = "patch_list.txt"

    op_def = _define_operation(arg_subparsers, "install", help="Install one or more patches.")

    op_def.add_argument(
        "patch_file",
        type=str,
        help="Patch file to install (can be wildcard), or a directory containing patch files and a "
        + f"{patch_order_file} file, and subdirectories of the same.",
    )
    op_def.add_argument("--dry_run", action="store_true", help="Just show what would be done")
    op_def.add_argument(
        "--rebuild", action="store_true", help="Rebuild javascript libraries after install"
    )
    op_def.add_argument("--force", action="store_true", help="Overwrite local changes")
    op_def.add_argument("--diff_tool", type=str, default=None, help="Tool to display conflicts")
    _add_standard_args(op_def)

    def operation_install(self):
        """
        Install patches
        """

        # Find patches to install
        patch_files = self._patch_files_matching(self.args.patch_file)

        # If all patches are up to date / already installed, we may get an empty list.
        if not patch_files:
            return

        # Install them
        changed_files = []
        caught_exception = None
        for patch_file in patch_files:
            try:
                changed_files += self._install_patch(
                    patch_file, self.args.dry_run, self.args.diff_tool, self.args.force
                )
                self.progress(1, "")
            except MywError as e:
                # If we hit an error while installing, we stop here in the chain.
                caught_exception = e
                break

        # Work out what needs rebuilding
        libs = set()
        for changed_file in changed_files:
            for lib in self.code_mgr.libraries_for(changed_file):
                libs.add(lib)

        # Build it (in build order)
        if libs:
            with self.progress.operation("Checking dependencies..."):
                if "node_modules" in libs:
                    if self.args.rebuild:
                        self.code_mgr.fetch_node_modules()
                    else:
                        self.progress(1, "Requires fetch:", "node_modules")

            with self.progress.operation("Checking libraries..."):
                for lib in self.code_mgr.libraries:
                    if not lib in libs:
                        continue
                    if not self.code_mgr.is_built(lib):
                        continue

                    if self.args.rebuild:
                        self.progress(1, "Rebuilding library:", lib)
                        self.code_mgr.build(lib)
                    else:
                        self.progress(1, "Library requires rebuild:", lib)

        # Tidy up
        # ENH: Find a neater way
        self.os_engine.remove_if_exists(self.patch_mgr.scratch_dir)

        if caught_exception is not None:
            raise caught_exception

    def _install_patch(self, patch_file, dry_run, diff_tool=None, force=False):
        """
        Install a patch

        Returns list of files modified"""

        patch = MywPatch(patch_file)
        patch_mgr = self.patch_mgr

        with self.progress.operation(patch.id, ":", patch.module_and_version, ":", patch.title):

            # Show patch content
            # self.progress(1,patch.module_and_version,":",patch.title)
            for change, src_file in patch.changes():
                self.progress(1, change, self.product.full_path_for(src_file))

            # Check it can be installed
            (ok, reason) = patch_mgr.check_patch(patch)
            if not ok:
                self.progress("warning", patch.id, ":", reason)
                return []

            # Find conflicts
            conflict_files = patch_mgr.find_install_conflicts(patch)

            # Warn about conflicts
            for (src_file, conflict) in list(conflict_files.items()):
                if conflict == "missing":
                    self.progress("warning", patch.id, ":", src_file, ":", "Target file missing")
                else:
                    self.progress(
                        "warning",
                        patch.id,
                        ":",
                        src_file,
                        ":",
                        "Target file not as expected (contains local changes?)",
                    )
                    if self.args.diff_tool:
                        self._show_source_differences(patch, src_file, diff_tool)

            # Prevent overwrites (unless forcing)
            if conflict_files and not force:
                return []

            # Check for dry run
            if dry_run:
                self.progress(1, "OK to apply")
                return []

            # Make the change
            return patch_mgr.apply_patch(patch)

    def _show_source_differences(self, patch, src_file, diff_tool):
        """
        Show differences between the installed version of SRC_FILE and the expected version in PATCH
        """

        tmp = tempfile.gettempdir()

        with zipfile.ZipFile(patch.zip_file) as patch_zip:
            expected_src_file = patch_zip.extract("old/" + src_file, tmp)

            self.os_engine.run(diff_tool, self.product.full_path_for(src_file), expected_src_file)

    def _patch_files_matching(self, file_spec):
        """
        Returns a sorted list of patch file names matching FILE_SPEC
        """

        already_installed_files = []

        if os.path.isdir(file_spec):
            sorted_files, already_installed_files = self._parse_patch_directory(file_spec)
        else:
            # Find matching files
            file_names = glob.glob(file_spec)  # ENH: Use os_engine

            # Search for a patch_order file among the glob matches:
            order_file = None
            patch_files = []
            for fn in file_names:
                if os.path.basename(fn) == self.patch_order_file:
                    order_file = fn
                else:
                    patch_files.append(fn)

            if order_file is not None:
                sorted_files, already_installed_files = self._parse_patch_order_file(
                    order_file, patch_files
                )
            else:
                sorted_files = sorted(patch_files)

        if not sorted_files:
            if already_installed_files:
                # All modules are up to date according to patch_order.txt files.
                self.progress(1, "All modules already up to date")
                return sorted_files
            else:
                raise MywError("File(s) not found:", file_spec)

        # Select those which are valid patches
        patch_file_names = []
        for file_name in sorted_files:

            (is_patch, reason) = self.patch_mgr.is_patch(file_name)

            if is_patch:
                patch_file_names.append(file_name)
            else:
                self.progress("warning", "Not a valid patch:", file_name, "({})".format(reason))

        return patch_file_names

    def _parse_patch_directory(self, dir_name, top_level=True):
        """
        Check if a directory contains patches for installation with a patch_order.txt.

        If no patch_order.txt is not found in dir_name, behaviour depends on top_level recurse into subdirectories.
         * if top_level=True, we recurse into subdirectories.
         * else, we exit early, with empty lists.

        It will call _parse_patch_order_file, so if a required patch file is missing it will also throw an error.

        Returns: tuple([file_to_install, ], [patch_id_already_installed, ])"""

        order_file = os.path.sep.join([dir_name, self.patch_order_file])
        subdir_names = [
            path for path in glob.glob(os.path.sep.join([dir_name, "*"])) if os.path.isdir(path)
        ]
        if os.path.isfile(order_file):
            # Invoke the full patch discovery at this level, using the order file:
            file_names = glob.glob(os.path.sep.join([dir_name, "*.mpf"]))
            patches_to_install, patches_already_installed = self._parse_patch_order_file(
                order_file, file_names + subdir_names
            )
        elif top_level:
            # no order file at top level is not an error, we at least process subdirectories:
            (
                patches_to_install,
                patches_already_installed,
                missing_patches,
            ) = self._process_subdirectories(subdir_names)

            if missing_patches:
                # Raises the missing patches.
                raise MissingOrInvalidPatchFilesError(missing_patches)
        else:
            # Bail out and record no files if no order file in a subdirectory.
            return [], []

        return patches_to_install, patches_already_installed

    def _parse_patch_order_file(self, order_file, file_names):
        """
        Parse patch_order.txt file, to determine which patches should be installed in what order. Takes into account
        installed patches, and throws a helpful error (MissingOrInvalidPatchFilesError) if any are missing that are
        needed.

        order_file should be a patch_list.txt path which exists as a file.

        file_names should be a list of fs objects (files & directories) which match the request
        the user has made.

        Note: this method calls itself (via _process_subdirectories, _parse_patch_directory) recursively when it
        encounters subdirectories, to handle patches for different modules.

        Returns: tuple([file_to_install, ], [patch_id_already_installed, ])"""

        # Separate the input into patch files and subdirectories.
        patch_file_names = []
        subdir_names = []
        for file in file_names:
            if os.path.isdir(file):
                subdir_names.append(file)
            else:
                patch_file_names.append(file)
        file_names = patch_file_names
        # Ensure we hit subdirs in a deteministic order.
        # ENH: sort by the module name each affects, if it has a patch_list.txt.
        subdir_names.sort()

        files_to_install = []
        patches_already_installed = []

        target_module, expected_patches = self._read_order_file(order_file)

        installed_patches = self.patch_mgr.installed_patches(target_module)

        patches_available, patches_rejected = self._validate_available_patch_files(
            file_names, target_module
        )

        missing_patches = {target_module: []}

        for patch_id in expected_patches:
            if patch_id in installed_patches:
                # already installed, take no action.
                patches_already_installed.append(patch_id)

            elif patch_id in patches_available:
                files_to_install.append(patches_available[patch_id])

            else:
                if patch_id in patches_rejected:
                    # We will give the user a message if one of the bad patch files is listed for installation.
                    self.progress("warning", patches_rejected[patch_id])
                missing_patches[target_module].append(patch_id)

        if not missing_patches[target_module]:
            missing_patches = {}

        subdir_ready, subdir_installed, subdir_missing = self._process_subdirectories(subdir_names)

        files_to_install.extend(subdir_ready)
        patches_already_installed.extend(subdir_installed)
        missing_patches.update(subdir_missing)

        if missing_patches:
            # Raises the missing patches from this module and any subdirectories.
            raise MissingOrInvalidPatchFilesError(missing_patches)

        return files_to_install, patches_already_installed

    def _read_order_file(self, order_file):
        """
        Parse the patch file itself, retrieving the module name and ordered list of expected patches.

        returns tuple(target_module, ordered_patch_ids)"""

        ordered_patch_ids = []
        target_module = None
        try:
            for line_ in open(order_file, "r", encoding="utf-8").read().split("\n"):
                line = line_.strip()

                # Ignore blank lines in the order file
                if not line:
                    continue

                if target_module is None:
                    target_module = line
                else:
                    ordered_patch_ids.append(line)
        except Exception as cond:
            raise MywError(f"Error reading {order_file}: {cond}")

        if target_module is None:
            raise MywError(f"Invalid patch list file: {order_file}")

        return target_module, ordered_patch_ids

    def _validate_available_patch_files(self, files, target_module):
        """
        For each file, check whether it's a valid patch for target_module

        returns tuple({patch_id: valid_patch_file_path}, {patch_id: reason_file_is_invalid}),
        each file passed in is in one dictionary or the other."""

        # map patch_id to file path for install
        available = {}
        # map patch_id to reason for rejection
        rejected = {}
        for name in files:
            patch_id = os.path.basename(name).replace(".mpf", "")
            try:
                module = json.loads(zipfile.ZipFile(name).read("patch_info.json"))["module"]
                if module == target_module:
                    available[patch_id] = name
                else:

                    rejected[
                        patch_id
                    ] = f"ignoring {name} because it is for the wrong module ({module})"
            except KeyError:
                # Any patch file with no "module" key is not available for install, it will error out if you try.
                rejected[patch_id] = f"skipping {name} because no module in the info json"
            except (IOError, zipfile.BadZipfile):
                rejected[patch_id] = f"skipping {name} because it is not a zipfile."

        return available, rejected

    def _process_subdirectories(self, subdir_names):
        """
        For each subdirectory, discover all patches to be installed, patches already installed, and discover any missing patches, cumulatively.

        returns tuple of:
         * files_to_install (as [filepath, ]),
         * patches_already_installed (as [patch_id, ])
         * missing_patches (as {module: [patch_id, ]})"""

        files_to_install = []
        patches_already_installed = []
        missing_patches = {}

        for subdir in subdir_names:
            try:
                new_files, installed_subdir_patches = self._parse_patch_directory(
                    subdir, top_level=False
                )

                files_to_install.extend(new_files)
                patches_already_installed.extend(installed_subdir_patches)

            except MissingOrInvalidPatchFilesError as cond:
                # Accumulate the missing patches from each module we parse.
                missing_patches.update(cond.missing_patches)

        return files_to_install, patches_already_installed, missing_patches

    # ==============================================================================
    #                              OPERATION UNINSTALL
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "uninstall", help="Back out a patch")
    op_def.add_argument("patch_id", type=str, help="Patch to uninstall")
    op_def.add_argument("--dry_run", action="store_true", help="Just show what would be done")
    op_def.add_argument("--force", action="store_true", help="Overwrite local changes")
    _add_standard_args(op_def)

    def operation_uninstall(self):
        """
        Install updates/patches
        """

        patch = self._find_installed_patch_by_id(self.args.patch_id)
        conflict_files = self.patch_mgr.find_uninstall_conflicts(patch)

        # We backup files while uninstalling, so a force option was added.

        if conflict_files:
            for (src_file, conflict) in list(conflict_files.items()):
                if conflict == "missing":
                    self.progress("warning", patch.id, ":", src_file, ":", "Target file missing")
                else:
                    self.progress(
                        "warning",
                        patch.id,
                        ":",
                        src_file,
                        ":",
                        "Target file not as expected (contains local changes?)",
                    )

        if conflict_files and not self.args.force:
            return

        self.patch_mgr.uninstall_patch(patch, self.args.dry_run)

    def _find_installed_patch_by_id(self, patch_id):
        # Find module patch was applied to
        module = self.patch_mgr.module_for(patch_id)

        # Check for not installed
        if not module:
            raise MywError("Patch is not installed:", patch_id)

        patch_dir = self.product.module(module).file("installed_patches")
        patch_zip_path = os.path.join(patch_dir, patch_id + ".mpf")

        return MywPatch(patch_zip_path)
