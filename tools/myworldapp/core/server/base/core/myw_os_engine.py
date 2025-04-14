###############################################################################
# Engine for performing file system operations
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import tempfile, os, sys, re, subprocess, shutil, glob, fnmatch
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
import pathlib

# Mapping to our names for operating systems
myw_os_types = {"nt": "windows", "posix": "linux"}


class MywOsEngine:
    """
    Engine for performing operating system operations

    Provides protocols for walking trees, zipping files, running
    subprocesses, etc. Wraps calls to os, shutil etc in a
    single API + provides progress reporting."""

    def __init__(self, progress=MywProgressHandler()):
        """
        Init slots of self from command line args CLI_ARGS
        """

        self.progress = progress
        self.os_type = myw_os_types[os.name]
        self.use_shell = self.os_type == "windows"

    # ==============================================================================
    #                             DIRECTORY OPERATIONS
    # ==============================================================================

    def ensure_exists(self, *path, **opts):
        """
        Ensure directory PATH exists (but leave any current contents)

        Returns name of directory"""
        # ENH: Create whole sub-tree, add progress

        ensure_empty = opts.pop("ensure_empty", False)
        if opts:
            raise MywInternalError("Bad option:", list(opts.keys())[0])

        dir = str(os.path.join(*path))

        if ensure_empty:
            self.ensure_empty(*path)
        elif not os.path.exists(dir):
            os.makedirs(dir)

        return dir

    def is_empty(self, *path):
        """
        True if PATH is an emptry directory
        """

        dir = str(os.path.join(*path))

        n_files = len(os.listdir(dir))

        return n_files == 0

    def ensure_empty(self, *path):
        """
        Ensure PATH exists and is empty (removing contents if necessary)

        Returns name of directory ensure_exists"""

        # ENH: Replace by option to
        dir = str(os.path.join(*path))

        if os.path.exists(dir):
            self.progress(4, "Emptying directory:", dir)

            # Delete each file / folder inside of dir instead of just removing dir outright
            # This gets around issues where we can't delete dir, but can delete its contents
            for path in os.listdir(dir):
                full_path = os.path.join(dir, path)
                if os.path.isfile(full_path):
                    os.remove(full_path)
                else:
                    self.remove_tree(full_path)
        else:
            os.mkdir(dir)

        return dir

    def remove_if_exists(self, path):
        """
        Delete file or directory PATH (if it exists)

        Returns True if PATH existed and was deleted, False if it didn't exist
        """
        path = str(path)  # Avoid shutil problems deleting files with non-ascii names

        if os.path.exists(path):

            if os.path.isdir(path):
                self.remove_tree(path)
            else:
                os.remove(path)
            return True

        return False

    def find_dirs(self, root_dir, spec, recurse=False, excludes=[]):
        """
        Yield full paths of directories in ROOT_DIR that match SPEC

        If RECURSE is True, walk the directory tree

        Optional EXCLUDES is a list of fnmatch-style strings
        specifying files to skip"""

        if recurse:

            for dir, dir_names, file_names in os.walk(
                str(root_dir)
            ):  # Unicode forces os utils to return unicode strings
                for name in fnmatch.filter(dir_names, spec):
                    if self.name_matches(name, excludes):
                        continue
                    yield os.path.join(dir, name)

        else:

            glob_spec = os.path.join(root_dir, spec)

            for path in glob.glob(str(glob_spec)):
                name = os.path.basename(path)
                if not os.path.isdir(path):
                    continue
                if self.name_matches(name, excludes):
                    continue

                yield path

    def copy_tree(self, from_dir, to_dir):
        """
        Copy the contents of FROM_DIR to TO_DIR

        TO_DIR is emptied first"""

        if os.path.exists(to_dir):
            shutil.rmtree(to_dir)

        shutil.copytree(from_dir, to_dir)

    def remove_tree(self, path):
        """
        Remove directory PATH (and all its sub-dirs)
        """

        # Workaround for problems with paths >260 on windows (see https://bugs.python.org/issue18199)
        if self.os_type == "windows":
            # ensure Path is absolute (note, this operation requires the path to exist, which is fine.)
            path = str(pathlib.Path(path).resolve(strict=True))

            if not path.startswith("\\\\?\\"):
                # Prefix with the "long path prefix", required for pre-Windows 10 machines (like Server 2012).
                path = "\\\\?\\" + path

        shutil.rmtree(path)

    # ==============================================================================
    #                             FILE OPERATIONS
    # ==============================================================================

    def find_files(self, root_dir, spec, excludes=[]):
        """
        Walk the directory tree ROOT_DIR yielding names of files matching SPEC

        Optional EXCLUDES is a list of fnmatch-style strings
        specifying files to skip"""

        # ENH: Add recurse arg

        for dir, dir_names, file_names in os.walk(root_dir):
            for name in fnmatch.filter(file_names, spec):
                if self.name_matches(name, excludes):
                    continue
                yield os.path.join(dir, name)

    def name_matches(self, name, name_specs):
        """
        True if NAME matches one of the fnmatch specs in NAME_SPECS
        """

        for name_spec in name_specs:
            if fnmatch.fnmatch(name, name_spec):
                return True

        return False

    def remove_matching(self, file_pattern):
        """
        Delete files that match FILE_PATTERN
        """
        for f in glob.glob(str(file_pattern)):
            try:
                os.remove(f)
            except OSError as e:
                self.progress("error", str(e))

    def copy_file(self, from_file, to_file, overwrite=False):
        """
        Copy a file
        """

        self.progress(1, "Copying", from_file, to_file)

        if overwrite:
            # ENH - filter this so that we only remove if a file, not a dir.
            # shutil.copy below accepts a dir, and will copy the from_file with the same name into it.
            self.remove_if_exists(to_file)

        shutil.copy(from_file, to_file)

    # ==============================================================================
    #                               EDITING AND ZIPPING
    # ==============================================================================

    def edit_file(self, path, subs):
        """
        Apply a set of substitutions to a file

        SUBS is a set of replacement strings, keyed by regexps."""

        # Read file into memory
        with open(path, "r") as file:
            lines = file.read().split("\n")

        # Make subsititutions
        for i, line in enumerate(lines):
            for pattern, rep in list(subs.items()):
                line = re.sub(pattern, rep, line)
            lines[i] = line

        # Write it out
        with open(path, "w") as file:
            file.write("\n".join(lines))

    def build_zip(self, zip_file_name, src_dir, dir_names, file_names=[], permissions={}):
        """
        Add files from SRC_DIR to ZIP_FILE
        """

        with self.progress.operation("Building zip:", zip_file_name):
            self.progress(1, "Find files under:", zip_file_name)

            with ZipFile(zip_file_name, "w", ZIP_DEFLATED) as zip_file:

                # For each directory ...add its contents (mapping names)
                for dir_name in dir_names:

                    root_dir = os.path.join(src_dir, dir_name)
                    root_dir = str(root_dir)  # Forces os.walk() to return unicode strings

                    for dir, dir_names, dir_file_names in os.walk(root_dir):
                        for file_name in dir_file_names:
                            file_path = os.path.join(dir, file_name)
                            self.progress(2, "Adding file:", file_path)

                            zip_path = os.path.relpath(file_path, src_dir)
                            info = ZipInfo.from_file(file_path, zip_path)
                            file_permissions = permissions.get(file_path, None)
                            if file_permissions is not None:
                                # In order to set file permissions, we first need to force this file to be zipped using the UNIX system
                                info.create_system = 3
                                no_perms = info.external_attr & (~0o777 << 16)
                                info.external_attr = no_perms | (file_permissions << 16)
                            with open(file_path, "rb") as contents:
                                zip_file.writestr(info, contents.read())

                # For each file add it (mapping names)
                for file_name in file_names:
                    file_path = os.path.join(src_dir, file_name)
                    zip_path = os.path.relpath(file_path, src_dir)
                    zip_file.write(file_path, zip_path)

    # ==============================================================================
    #                              SUBPROCESS OPERATIONS
    # ==============================================================================

    def run(self, *cmd, **opts):
        """
        Spawn a sub-process, showing output as progress.

        Named Arguments:
           use_pipes          report progress from sub-process as it is generated (rather than at end)
           stream             Send output to this stream (rather than returning it)
           map_newlines       If true, map newline sequences to /n (default: true)
           env                environment variables for the sub-process
           filter             A fuction that takes a line of output and returns a log output level for the line
           log_output_level   level at which the sub-process output is logged (Default=1)
           log_command_level  level at which the sub-process invocation is logged (Default=4)

        Returns output from process (or raises MywError)"""

        def default_filter_func(line):
            line = line.lower()
            if re.match(r"\s*\Werror\W", line):
                return "error"
            if re.match(r"\s*\Wwarning\W", line):
                return "warning"
            return log_output_level

        # Get options
        use_pipes = opts.get("use_pipes", False)
        stream = opts.get("stream", None)
        map_newlines = opts.get("map_newlines ", True)
        log_output_level = opts.get("log_output_level", 0)
        log_command_level = opts.get("log_command_level", 4)
        encoding = opts.get("encoding", os.device_encoding(0))
        expected_exit_codes = opts.get("expected_exit_codes", [0])
        output_processor = opts.get("output_processor", None)

        self.progress(log_command_level, "Running command:", *cmd)

        # Build environment settings
        env_vars = opts.get("env", {})
        if env_vars:
            env = os.environ.copy()
            for (name, value) in list(env_vars.items()):
                env[name] = value
        else:
            env = None

        # Build output filter
        filter_func = opts.get("filter", None)
        if filter_func == None:
            filter_func = default_filter_func

        # Convert cmd to unicode
        ucmd = []
        for item in cmd:
            ucmd.append(item.encode(sys.getfilesystemencoding()))

        # Run command
        try:
            if stream != None:
                self._run_to_stream(
                    ucmd, env, map_newlines, stream, encoding, expected_exit_codes, output_processor
                )
                output = None
            elif use_pipes:
                output = self._run_piped(
                    ucmd,
                    env,
                    map_newlines,
                    filter_func,
                    log_output_level,
                    encoding,
                    expected_exit_codes,
                )
            else:
                output = self._run_blocking(
                    ucmd, env, map_newlines, filter_func, log_output_level, encoding
                )

        except subprocess.CalledProcessError as cond:
            output = cond.output
            raise MywError(output)

        return output

    def _run_to_stream(
        self, cmd, env, map_newlines, strm, encoding, expected_exit_codes, output_processor
    ):
        """
        Runs a sub-process sending its output to STRM

        The output is not returned"""

        if output_processor:
            temp_name = None
            with tempfile.NamedTemporaryFile("w", delete=False) as temp:
                temp_name = temp.name
                self._run_to_stream(
                    cmd, env, map_newlines, temp, encoding, expected_exit_codes, None
                )
            with open(temp_name, "r") as temp:
                output_processor(temp, strm)
            os.remove(temp_name)
        else:
            process = subprocess.Popen(
                cmd,
                shell=self.use_shell,
                env=env,
                universal_newlines=map_newlines,
                encoding=encoding,
                stdout=strm,
                stderr=strm,
                **self._subprocess_opts(env),
            )
            process.wait()

            # Check return code
            if process.returncode not in expected_exit_codes:
                raise MywError("Command failed:", cmd)

    def _run_blocking(self, cmd, env, map_newlines, filter_func, log_output_level, encoding):
        """
        Runs a sub-process with its output returned to self as a string

        The output from the spawned process is only displayed after it completes

        The output from the sub-process is also returned"""
        # ENH: Think of a better name :-(

        output = subprocess.check_output(
            cmd,
            shell=self.use_shell,
            env=env,
            universal_newlines=map_newlines,
            encoding=encoding,
            stderr=subprocess.STDOUT,
            **self._subprocess_opts(env),
        )

        for line in output.split("\n"):
            self.__process_output(line, filter_func, log_output_level)

        return output

    def _run_piped(
        self, cmd, env, map_newlines, filter_func, log_output_level, encoding, expected_exit_codes
    ):
        """
        Runs a sub-process with its output sent to self via a pipe.

        This allows for immediate display of the output as the spawn process produces it.

        The output from the sub-process is also returned"""

        # Launch process
        process = subprocess.Popen(
            cmd,
            shell=self.use_shell,
            env=env,
            universal_newlines=map_newlines,
            encoding=encoding,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            **self._subprocess_opts(env),
        )

        # Read output
        output = ""
        for line in iter(process.stdout.readline, ""):
            output += line
            self.__process_output(line, filter_func, log_output_level)

        # Check return code
        process.wait()
        if process.returncode not in expected_exit_codes:
            raise MywError(output)

        return output

    def _subprocess_opts(self, env):
        """
        Get extra options for subprocess() called from ENV

        Hack to allow setting of current working directory"""

        opts = {}

        if env and "CWD" in env:
            opts["cwd"] = env["CWD"]

        return opts

    def __process_output(self, line, filter_func, log_output_level):
        """
        Display a line of output (possibly filtered)
        """

        # Determine level for line
        level = filter_func(line)

        if isinstance(level, int):
            level += log_output_level

        # Log it
        self.progress(level, line.rstrip())


def is_subdirectory(basedir, path, follow_symlinks=True):
    """
    Returns False if a path is outside of a base directory
    """

    # resolves symbolic links
    if follow_symlinks:
        basepath = os.path.realpath(basedir)
        matchpath = os.path.realpath(path)
    else:
        basepath = os.path.abspath(basedir)
        matchpath = os.path.abspath(path)

    p = pathlib.PurePath(matchpath)
    return p.is_relative_to(basepath)
