# ******************************************************************************
# myw_code_manager
# ******************************************************************************
# Copyright: IQGeo Limited 2010-2023

import os
import re
import shutil
import tempfile
from datetime import datetime
import json
import pathlib

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.system.myw_patch_manager import MywPatchManager


class MywCodeManager:
    """
    Engine for minifying and packaging code
    """

    def __init__(self, product, progress=MywProgressHandler()):
        """
        Init slots of self

        PRODUCT is the MywProduct whose code we manage"""

        self.product = product
        self.progress = progress
        self.os_engine = MywOsEngine(progress)

    bundle_libs = ["base", "config", "client", "applications", "native"]
    libraries = bundle_libs + ["code_package"]

    # ==============================================================================
    #                                   TOP LEVEL API
    # ==============================================================================

    def libraries_for(self, file_name):
        """
        The libraries in which file_name is included (if any)

        Returns a (possibly empty) list of libraries (in build order)"""

        libraries = []

        if self.affects_node_modules(file_name):
            libraries.append("node_modules")

        libraries += self.bundle_libs_for(file_name)

        if self.in_code_package(file_name):
            libraries.append("code_package")

        return libraries

    def fetch_node_modules(self):
        """
        Fetch node modules using npm
        """
        # ENH: Find a way to report what packages have been fetched.
        with self.progress.operation("Downloading node modules"):
            self.npm_install(self.product.myworldapp_dir, install_peers=True)

            for dir in self.package_json_folders_in_dir(self.product.modules_dir):
                self.npm_install(dir)

            self.progress(1, "Done")

    def fetch_pip_packages(self, excludes):
        """
        Fetch python packages using pip
        """
        # ENH: support installing modules' pip packages?
        with self.progress.operation("Downloading pip packages"):

            if excludes:
                self.progress(3, f"excluding ({', '.join(excludes)})")
            else:
                self.progress(3, "not excluding any packages.")

            require_file = os.path.join(self.product.root_dir, "WebApps", "requirements.txt")

            # Ensures that if excludes was an iterator, it is now a list we can loop over mutliple
            # times, as well as converting to lower case for simple comparison.
            excludes_lowered = [excl.lower() for excl in excludes]
            remove_tempfile = False

            try:
                if excludes_lowered:
                    require_file = self.temp_require_file(require_file, excludes_lowered)
                    remove_tempfile = True

                legacy_install_location = os.getenv("MYW_PYTHON_SITE_DIRS").split(";")[0]

                self.check_writable(legacy_install_location)
                self.pip_install(require_file, legacy_install_location)
            except MywError as e:
                if "did not run successfully" in e.msg or "compilation terminated" in e.msg:
                    raise MywError(
                        "Pip packages could not be installed, check dependencies (see Installation and Configuration guide)."
                    )
                else:
                    raise e
            finally:
                if remove_tempfile:
                    os.remove(require_file)
            self.progress(1, "Done")

    def temp_require_file(self, require_file, excludes):
        """
        Create a temporary copy of the requirements.txt (at require_file), excluding packages
        listed in excludes.
        """
        fp, filtered_requirements_filepath = tempfile.mkstemp(suffix="requirements.txt")
        with open(fp, "w", encoding="utf-8") as destfile:
            with open(require_file, "r", encoding="utf-8") as srcfile:
                self.filter_requirements(srcfile, destfile, excludes)
        return filtered_requirements_filepath

    @staticmethod
    def filter_requirements(srcfile, destfile, excludes):
        """
        Copy srcfile into destfile, filtering out any lines which start with the excludes.

        srcfile and destfile should be file-like in text mode.

        We assume that excludes is an object we can iterate over repeatedly (e.g. a list), and that
        the strings in it are lower case.
        """

        def do_exclude(requirement):
            return not any(requirement.lower().startswith(excl) for excl in excludes)

        destfile.writelines(filter(do_exclude, srcfile))

    def build(self, library, debug=False):
        """
        Build bundle or code package
        """

        if library == "code_package":
            self.build_code_package()
        else:
            self.build_bundle_lib(library, debug)

    def clear(self, library):
        """
        Discard bundle or code package
        """

        if library == "code_package":
            self.clear_code_package()
        else:
            self.clear_bundle_lib(library)

    def is_built(self, library):
        """
        True if file for LIBRARY exists
        """

        return "date" in self.build_info(library)

    def build_info(self, library):
        """
        Stats on the current build of LIBRARY (if it exists)

        Returns a dict with keys:
        """

        if library == "code_package":
            return self.code_package_build_info()
        else:
            return self.bundle_lib_build_info(library)

    # ==============================================================================
    #                                   BUNDLE BUILDING
    # ==============================================================================

    @property
    def bundles_dir(self):
        """Root location of bundle files"""
        return os.path.join(self.product.core_dir, "..", "public", "bundles")

    def build_bundle_lib(self, library, debug):
        """
        Build bundles for deployment

        DEBUG determines if the dev or production version is built"""

        # Find NPM script to run
        (npm_command, build_type) = self.npm_command_for(library, debug)

        # Do the operation
        with self.progress.operation("Building library:", library, build_type):

            script_args = [
                "--no-color",
                "--stats",
                "errors-warnings",
                "--mode",
                "development" if debug else "production",
            ]

            self.os_engine.run(
                "npm",
                "--prefix",
                self.product.myworldapp_dir,
                "run",
                npm_command,
                "--no-fund",
                "--silent",
                "--",
                *script_args,
                filter=self.npm_output_filter,
                use_pipes=True,
                log_command_level=2,
            )

    def watch(self, library, debug=False):
        """
        Run webpack watch for JavaScript LIBRARY

        Never terminates"""

        # Find NPM script to run
        (npm_command, build_type) = self.npm_command_for(library, debug)

        # Force timestamps in log output
        self.progress.show_time = True

        # Start the process (filtering output)
        with self.progress.operation("Watching files under", self.product.myworldapp_dir):

            self.progress(1, "Build type:", library, build_type)
            self.progress(1, "Launching processes")

            script_args = [
                "--no-color",
                "--stats",
                "errors-warnings",
                "--watch",
                "--mode",
                "development" if debug else "production",
            ]

            self.os_engine.run(
                "npm",
                "--prefix",
                self.product.myworldapp_dir,
                "run",
                "--no-fund",
                npm_command,
                "--",
                *script_args,
                filter=self.npm_output_filter,
                use_pipes=True,
                log_command_level=2,
            )

    def npm_output_filter(self, line):
        """
        Returns verbosity level for npm output LINE
        """

        if re.match(r"Webpack is watching the files", line, re.IGNORECASE):
            return 4  # Startup messages
        if re.match(r"Version: webpack", line, re.IGNORECASE):
            return 2

        if re.match(r"> ", line, re.IGNORECASE):
            return 4
        if re.match(r"clean-webpack-plugin\: .* has been removed", line, re.IGNORECASE):
            return 4
        if re.match(r"\s*Child\s", line, re.IGNORECASE):
            return 2

        if re.match(r".*?Asset.*?Size.*?Chunks.*?Chunk Names", line, re.IGNORECASE):
            return 2  # Build output
        if re.match(r".*\[emitted\]", line, re.IGNORECASE):
            return 2
        if re.match(r".*\[built\]", line, re.IGNORECASE):
            return 3
        if re.match(r"\s*Entrypoint", line, re.IGNORECASE):
            return 3
        if re.match(r"\s*Built at:", line, re.IGNORECASE):
            return 3
        if re.match(r"\s*\|?\s*(?:\+ )?\d+\s*(?:hidden)?\s*(?:module|asset)", line, re.IGNORECASE):
            return 3
        if re.match(r".*?Time:\s\d+", line, re.IGNORECASE):
            return 3
        if re.match(r".*?Hash:\s[\w]+", line, re.IGNORECASE):
            return 3
        if re.match(r".*?DeprecationWarning:", line):
            return 3
        if re.match(r".*?\(Use `node --trace-deprecation ...` to", line, re.IGNORECASE):
            return 3
        if re.match(r".*webpack compiled successfully\s", line, re.IGNORECASE):
            return 3

        if re.match(r"^.*Browserslist: caniuse-lite is outdated. Please run:", line):
            return 4
        if re.match(r"^.*npx browserslist@latest --update-db", line):
            return 4
        if re.match(r"^.*Why you should do it regularly:", line):
            return 4
        if re.match(
            r"^.*https://github.com/browserslist/browserslist#browsers-data-updating", line
        ):
            return 4

        if re.match(r"\s*error\W", line, re.IGNORECASE):
            return "error"  # Errors
        if re.match(r"\s*\Wwarning\W", line, re.IGNORECASE):
            return "warning"

        return 1

    def npm_command_for(self, library, debug):
        """
        Helper to get command for building LIBRARY

        Returns:
         npm_command
         build_type"""

        # NPM Scripts to run (see package.json)
        npm_commands = {
            "base": "build-base",
            "config": "build-config",
            "client": "build-client",
            "applications": "build-applications",
            "native": "build-native",
            "core_dev": "build-core-dev",
            "applications_dev": "build-applications-dev",
            "all": "build",
        }

        # Find NPM script to run
        npm_command = npm_commands.get(library)

        # Check for not found
        if not npm_command:
            raise MywInternalError("Bad option:", library)

        # Set build type
        if debug:
            build_type = "(debug)"
        else:
            build_type = "(production)"

        return npm_command, build_type

    def bundle_libs_for(self, file_name):
        """
        The bundle libraries in which file_name is included (if any)

        Returns a (possibly empty) list of libraries"""

        # Note: Implementation could be a bit more strict .. but this is safe

        file_name = file_name.lower().replace("\\", "/")
        if "webapps/myworldapp/core/config" in file_name:
            return ["config"]

        if "webapps/myworldapp/core/client/main.standard.js" in file_name:
            return ["applications"]
        if "webapps/myworldapp/core/client/base" in file_name:
            return ["base", "client", "config"]  # these bandles all import from base
        if "webapps/myworldapp/core/client/pages" in file_name:
            return ["base"]
        if "webapps/myworldapp/core/client" in file_name:
            return ["client"]

        if "webapps/myworldapp/core/lib" in file_name:
            return ["base", "client"]

        if "webapps/myworldapp/core/native" in file_name:
            return ["native"]

        if re.search("webapps/myworldapp/modules/.*/public", file_name):
            return ["applications"]
        if re.search("webapps/myworldapp/modules/.*/config", file_name):
            return ["config"]

        return []

    def bundle_lib_build_info(self, library):
        """
        Info about the current build of LIBRARY (a dict)

        If no key 'date' library is not built"""

        info = {"location": os.path.join(self.bundles_dir, library)}

        for file_name in self.bundle_lib_files(library):
            info["date"] = datetime.fromtimestamp(os.stat(file_name).st_mtime)

            if file_name.endswith(".map"):
                info["type"] = "production"

        if ("date" in info) and not ("type" in info):
            info["type"] = "debug"

        return info

    def clear_bundle_lib(self, library):
        """
        Delete the build output for LIBRARY (if it exists)
        """

        self.progress(1, "Deleting library:", library)

        for file_name in self.bundle_lib_files(library):
            self.os_engine.remove_if_exists(file_name)

    def bundle_lib_files(self, library):
        """
        Names of the current built files for LIBRARY
        """

        if library == "config":  # ENH: Fix bundle dir name and remove this
            library = "configuration"

        library_dir = os.path.join(self.bundles_dir, library)

        for file_name in self.os_engine.find_files(library_dir, "*"):
            yield file_name

    def bundle_path_for(self, bundle_file, extension=".js"):
        """
        Returns relative URL to the bundle for BUNDLE_FILE

        BUNDLE_FILE is a relative path to a JavaScript application definition
        e.g main.standard.js or modules/telco/js/main.telco.js"""

        # Extract app name from file path
        js_file_path = bundle_file.split("/")
        js_file_name = js_file_path[-1]
        app_name = ".".join(js_file_name.split(".")[1:-1])

        # Handle application in module
        if js_file_path[0] == "modules":
            module_name = js_file_path[1]
            app_name = module_name + "." + app_name

        # Build path
        bundle_name = app_name + ".module" + extension
        return "/".join(["bundles", "applications", bundle_name])

    def js_bundle_path_for(self, bundle_file):
        return self.bundle_path_for(bundle_file, ".js")

    def css_bundle_path_for(self, bundle_file):
        css_file = self.bundle_path_for(bundle_file, ".bundle.css")
        css_path = os.path.join(self.product.core_dir, "public", css_file)
        if os.path.exists(css_path):
            return css_file
        else:
            return None

    # ==============================================================================
    #                                    CODE PACKAGE
    # ==============================================================================

    @property
    def code_file(self):
        """
        Location of code package
        """
        return os.path.join(self.product.myworldapp_dir, "dist", "code.zip")

    def in_code_package(self, file_name):
        """
        True if FILE_NAME is included the distribution code package
        """

        file_name = file_name.lower().replace("\\", "/")

        if "/public/" in file_name:
            return True
        if "/client/" in file_name:
            return True
        if "/native/" in file_name:
            return True

        return False

    def build_code_package(self):
        """
        Build the client code distribution package (for code replication)
        """

        with self.progress.operation("Building code package"):

            # Get location of input
            core_public = os.path.join(self.product.core_dir, "..", "public")

            # Check we have pre-requisites
            for library in ["client", "applications", "native"]:
                if not self.is_built(library):
                    raise MywError("Bundle not built:", library)

            # Setup temp folder
            temp_root = tempfile.gettempdir()
            temp_dir = os.path.join(temp_root, "myw_code_package")
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)  # ENH: Use self.os_engine
            self.progress(2, "Temp directory:", temp_dir)

            # Add core source files
            with self.progress.operation("Adding core files..."):
                for dir in ["bundles/client", "bundles/styles", "locales"]:
                    self.progress(1, "Adding", dir)
                    src = os.path.join(core_public, dir)
                    dst = os.path.join(temp_dir, dir)
                    shutil.copytree(src, dst)  # ENH: Use self.os_engine

            # Add module files
            with self.progress.operation("Adding modules files..."):
                for module in self.product.modules(False):
                    src = module.file("public")
                    if os.path.exists(src):
                        self.progress(1, "Adding", os.path.join(module.name, "public"))
                        dst = os.path.join(temp_dir, "modules", module.name)
                        shutil.copytree(src, dst)  # ENH: Use self.os_engine

            # Add native JS files
            with self.progress.operation("Adding native files..."):
                src = os.path.join(self.product.core_dir, "native", "nativeApp.html")
                dst = os.path.join(temp_dir, "nativeApp.html")
                shutil.copy(src, dst)  # ENH: Use self.os_engine

            # Add application bundles
            with self.progress.operation("Adding application bundles..."):
                dir = "applications"
                src = os.path.join(core_public, "bundles", dir)
                dst = os.path.join(temp_dir, "bundles", dir)
                shutil.copytree(src, dst)  # ENH: Use self.os_engine

            # Add native bundles
            with self.progress.operation("Adding native bundle..."):
                dir = "native"
                src = os.path.join(core_public, "bundles", dir)
                dst = os.path.join(temp_dir, "bundles", dir)
                shutil.copytree(src, dst)  # ENH: Use self.os_engine

            # Add core version info
            src = os.path.join(self.product.core_dir, "version_info.json")
            dst = os.path.join(temp_dir, "version_info.json")
            self.bundle_version_info(src, dst)
            # shutil.copy(src, dst)

            # Zip files into target directory
            self.progress(1, "Creating", self.code_file, "...")
            self.os_engine.ensure_exists(os.path.dirname(self.code_file))
            shutil.make_archive(self.code_file[:-4], "zip", temp_dir)

    def bundle_version_info(self, src, dst):
        with open(src, "r") as inf:
            version_info = json.load(inf)
        version_info["module_info"] = self.get_module_info()
        with open(dst, "w") as of:
            json.dump(version_info, of)

    def get_module_info(self):
        modules = {}
        patch_mgr = MywPatchManager(self.product)
        for name in self.product.module_names():

            module = self.product.module(name)

            installed_patches = patch_mgr.installed_patches(name)
            patches = []
            for patch_id, details in list(installed_patches.items()):
                details["patch"] = patch_id
                patches.append(details)

            module_data = {"version": module.version, "patches": patches}
            modules[name] = module_data

        return modules

    def code_package_build_info(self):
        """
        Info about the current build of the code package (a dict)

        If no key 'date' library is not built"""

        info = {"location": self.code_file}

        if os.path.exists(self.code_file):
            info["date"] = datetime.fromtimestamp(os.stat(self.code_file).st_mtime)

        return info

    def clear_code_package(self):
        """
        Delete the client code distribution package (if it exists)
        """

        self.progress(1, "Deleting code package")

        deleted = self.os_engine.remove_if_exists(self.code_file)

        if deleted:
            self.progress(3, "Removed", self.code_file)

        return deleted

    # ==============================================================================
    #                                  DEPENDENCIES
    # ==============================================================================

    def check_writable(self, dir_name):
        directory = pathlib.Path(dir_name).resolve(strict=False)
        test_file = directory.joinpath("write_test.txt")
        try:
            # Ensure the dir exists, and try to add a file.
            directory.mkdir(mode=0o755, parents=True, exist_ok=True)
            test_file.touch(mode=0o755, exist_ok=True)
            # Also remove the file (this for the case where it already existed, but we still don't
            # have permission.)
            test_file.unlink()
        except PermissionError:
            raise MywError(
                f"Insufficient permissions for package directory {directory}. Please fix permissions, or install as super user."
            )

    def affects_node_modules(self, file_name):
        file_name = file_name.lower().replace("\\", "/")
        return "webapps/myworldapp/package.json" in file_name

    def package_json_folders_in_dir(self, dir_name):
        for root, dirs, files in os.walk(dir_name):
            for file in files:
                if file == "package.json" and "node_modules" not in root:
                    yield root

    def npm_install(self, dir, install_peers=False):
        # Proc giving verbosity level for npm output
        def filter_proc(line):
            if re.match(r"npm WARN", line):
                return 2
            if re.match(r"up to date in", line):
                return 4

            if re.match(r".*postinstall*", line):
                return 4
            if re.match(r"^.?.?\> ", line):
                return 4

            if re.match(r"^.*Thank you for using core-js", line):
                return 4
            if re.match(r"^.*Please consider supporting of core-js", line):
                return 4
            if re.match(r"^.*Also, the author of core-js .* good job", line):
                return 4
            if re.match(r".*\>.* https://opencollective.com/core-js", line):
                return 4
            if re.match(r".*\>.* https://www.patreon.com/zloirock", line):
                return 4
            if re.match(r".*\>.* https://patreon.com/zloirock", line):
                return 4
            if re.match(r".*\>.* https://paypal.me/zloirock", line):
                return 4
            if re.match(r".*\>.* bitcoin:", line):
                return 4
            if re.match(r"^.*Thank you for installing .*EJS.*:", line):
                return 4

            if re.match(r"\s*\Werror\W", line.lower()):
                return "error"  # Errors
            if re.match(r"\s*\Wwarning\W", line.lower()):
                return "warning"
            return 1

        # Set directory in which command will run
        env = {"CWD": dir}
        self.progress(1, "Target:", dir)
        self.os_engine.run(
            "npm", "set", "audit", "false", env=env, use_pipes=True, log_command_level=4
        )

        npm_install_args = ["--no-fund", "--quiet"]

        # npm 7+ requires --legacy-peer-deps to prevent auto install of peer dependencies
        if not install_peers:
            npm_install_args.append("--legacy-peer-deps")

        self.os_engine.run(
            "npm",
            "install",
            *npm_install_args,
            env=env,
            filter=filter_proc,
            use_pipes=True,
            log_command_level=2,
            encoding="utf8",
        )

    def pip_install(self, requirements_file, install_dir):
        """
        Perform the pip install.

        Ensure you have checked that the install_dir is ready for install with check_writable.
        """
        # Set directory in which command will run
        working_dir = os.path.dirname(requirements_file)
        env = {"CWD": working_dir}
        self.progress(1, "Target:", install_dir)
        self.os_engine.run(
            "pip",
            "install",
            "-r",
            requirements_file,
            "--target",
            install_dir,
            "--quiet",
            "--quiet",  # passing twice gives us only ERROR and CRITICAL output.
            env=env,
            use_pipes=True,
            log_command_level=2,
            log_output_level=4,  # Quiet down the output, especially in the case of pip errors.
            encoding="utf8",
        )
