################################################################################
# Progress message handlers for myWorld engines
################################################################################
# Copyright: IQGeo Limited 2010-2023

import sys, os, re, json, threading
from datetime import datetime
from collections import OrderedDict
from contextlib import contextmanager
from myworldapp.core.server.base.core.myw_tabulation import MywTableFormatter


class MywProgressHandler:
    """
    Superclass for engine progress message handlers

    Receives messages from engines via __call__(level,*msg)

    Default implementation does nothing"""

    level = 1

    def __call__(self, level, *msg, **counts):
        """
        Write progress output (if requested)

        LEVEL is one of:
         <integer> : Verbosity level
         'starting': Start of operation
         'finished': End of operation
         'warning' : Non-fatal warning encountered
         'error'   : Non-fatal error encountered

        COUNTS gives number of objects processed (for 'finished' messages)"""

        pass

    @contextmanager
    def operation(self, *msg):
        """
        A context manager wrapping 'starting' .. 'finished' calls

        Yields a COUNTS dict that can be populated by caller"""

        counts = {}
        try:
            self("starting", *msg)

            counts = OrderedDict()
            yield counts

        finally:
            self("finished", **counts)


class MywSimpleProgressHandler(MywProgressHandler):
    """
    Progress handler that prints messages if priority is high enough

    Also gathers statistics on operations"""

    # ENH: Support passing a format string + args

    def __init__(self, level, prefix="", out=None):
        """
        Init slots of self
        """

        self.level = level
        self.prefix = prefix
        self.stat_stack = []
        self.show_thread = False
        self.show_time = False
        self.out = out or sys.stdout

        self.starting_operation(["Total"])

    @property
    def op_level(self):
        """
        Currently level of operation nesting
        """

        return len(self.stat_stack) - 1

    @property
    def current_stat(self):
        """
        Statistics entry for the current operation (a dict)
        """
        return self.stat_stack[-1]

    def __call__(self, level, *msg, **data):
        """
        Show progress output (if appropriate)

        LEVEL is one of:
         <integer> : Verbosity level
         'starting': Start of operation
         'finished': End of operation
         'warning' : Non-fatal warning encountered
         'error'   : Non-fatal error encountered

        Optional DATA gives:
          Counts of objects processed (for level 'finished')
          Traceback object (for level 'warning' and 'error')"""

        traceback = data.pop("traceback", None)

        # Show message
        if level == "warning":
            self.write_line(0, 0, "***Warning***", *msg)
            self.current_stat["warnings"].append(msg)

        elif level == "error":
            self.write_line(0, 0, "***Error***", *msg)
            self.current_stat["errors"].append(msg)

        elif level == "starting":
            self.write_line(self.op_level, self.op_level + 1, *msg)
            self.starting_operation(msg)

        elif level == "finished":
            if msg:
                self.write_line(self.op_level, self.op_level + 1, *msg)
            self.finished_operation(msg, data)

        else:
            self.write_line(self.op_level, self.op_level + level, *msg)

        # Show traceback (if provided)
        if traceback:
            self.write_line(0, 0, traceback.format_exc())

    def starting_operation(self, msg):
        """
        Called when starting a new operation
        """

        # Create statistics item
        strs = self.format_message(msg).splitlines()

        stat = {
            "name": strs[0],
            "start": datetime.now(),
            "warnings": [],
            "errors": [],
            "child_stats": [],
        }

        # Add it as child of the current operation
        if len(self.stat_stack) > 0:
            self.stat_stack[-1]["child_stats"].append(stat)

        # Make it the current operation
        self.stat_stack.append(stat)

    def finished_operation(self, msg, counts):
        """
        Called when current operation has completed

        COUNTS may optionally give number of objects processed
        """

        # Set statistics
        self.current_stat["end"] = datetime.now()
        self.current_stat["counts"] = OrderedDict(counts)

        # End operation
        self.stat_stack.pop()

    def print_statistics(self, level):
        """
        Complete root operation and print the statistics stored on SELF

        Note: Modifies the stats tree ... so should not be called more than once"""

        # Finish root operation
        root_stat = self.stat_stack[0]
        self.finished_operation([], {})

        # Propagate changes up the tree
        self.aggregate_statistics(root_stat)

        # Get statistics as list
        rows = self.tabulate_statistics(root_stat, level - 1)
        counts = root_stat["counts"]

        # Display it
        cols = (
            [["operation", "operation", "{}"], "time"]
            + list(counts.keys())
            + ["rate", "warnings", "errors"]
        )
        tab_fmtr = MywTableFormatter(*cols)
        tab_fmtr.col_formats["time"] = "{:3.2f}s"
        tab_fmtr.col_formats["rate"] = "{:3.0f}"

        print()
        self.print_lines(tab_fmtr.format(rows, "columns"))
        print()

    def aggregate_statistics(self, stat):
        """
        Propagate statistics up the sub-trees of STAT (recursive)
        """

        # Avoid problems with unterminated operations (should never happen)
        if not "end" in stat:
            print("Statistics item incomplete:", stat["name"])
            stat["end"] = datetime.now()
            stat["counts"] = OrderedDict()

        # For each subtree ...
        for child_stat in stat["child_stats"]:

            # Propagate stats up subtree
            self.aggregate_statistics(child_stat)

            # Update error counts
            stat["warnings"] += child_stat["warnings"]
            stat["errors"] += child_stat["errors"]

            # Update other counts
            counts = stat["counts"]
            for prop, child_count in list(child_stat["counts"].items()):

                if child_count != None:
                    counts[prop] = counts.get(prop, 0) + child_count

    def tabulate_statistics(self, stat, max_level, level=0):
        """
        Returns statistics from tree STAT as a list (recursive)
        """

        rows = []

        if level > max_level:
            return rows

        # Compute basic stats for item
        name = (level) * " " + self.tidy_operation_name(stat["name"])
        n_sec = (stat["end"] - stat["start"]).total_seconds()
        counts = stat["counts"]

        # Add basic stats
        row = {}
        row["operation"] = name
        row["time"] = n_sec

        # Add counts (and rate, if appropriate)
        for prop, count in list(counts.items()):
            if count != None:
                row[prop] = count

            if len(counts) == 1 and count and n_sec > 0.005:
                row["rate"] = count / n_sec

        # Add warnings count (substititing none for 0)
        row["warnings"] = len(stat["warnings"]) or None
        row["errors"] = len(stat["errors"]) or None

        rows.append(row)

        # Add stats rows for children (recursive)
        for child_stat in stat["child_stats"]:
            rows += self.tabulate_statistics(child_stat, max_level, level + 1)

        return rows

    def tidy_operation_name(self, name):
        """
        Build operation name from message string
        """

        # Convert full path names to just the basename
        # ENH: This REGEX is Windows specific and assumes a drive letter rather than a UNC path
        # It is more restrictive in the leafname than it could be.
        # Note the use of a "raw" string for (relative) readability.
        regex = r'[a-zA-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[a-zA-Z0-9._-]*'

        # because the match object contain positions in the original string we have to process them in reverse
        for match in reversed([match for match in re.finditer(regex, name)]):
            name = (
                name[: match.start()]
                + os.path.basename(name[match.start() : match.end()])
                + name[match.end() :]
            )

        # Strip out "..." ENH: generalise to any number of multiple . characters
        pattern = re.compile(r"(\.\.\.)")
        name = pattern.sub("", name)

        return name

    def write_line(self, indent_level, msg_level, *msg):
        """
        Write message (if appropriate)
        """

        # Check for not of interest
        if msg_level > self.level:
            return

        # For each line of output
        for msg_line in self.format_message(msg).splitlines():

            # Write Thread info, if not in Mainthread
            if (
                self.show_thread or self.level > 5
            ) and threading.current_thread().name != "MainThread":
                self.write("{} ".format(threading.current_thread().name))

            # Write timestamp
            if self.show_time or self.level > 5:
                time_str = datetime.now().strftime("%H:%M:%S")
                self.write("[", time_str, "] ")

            # Write prefix (used to identify trace lines etc)
            self.write(self.prefix)

            # Write rest of line
            self.write("  " * indent_level)
            self.write(msg_line)
            self.write("\n")

        self.out.flush()

    def write(self, *items):
        """
        Write items to STDOUT (handling unicode errors)
        """
        # Workaround for unicode errors writing to Apache log stream

        for item in items:
            try:
                self.out.write(item)

            except UnicodeEncodeError:
                item_asc = str(item).encode("ascii", errors="replace").decode()
                self.out.write(item_asc)

    def format_message(self, msg):
        """
        Returns MSG as a unicode string (handling errors)

        MSG is a list of objects"""

        msg_str = ""
        sep = ""

        for item in msg:

            # Handle ident hook
            if hasattr(item, "__ident__"):
                try:
                    item = item.__ident__()
                except Exception:
                    pass

            # Get item as string
            if not isinstance(item, str):
                item = "{}".format(item)  # PYTHON3: Handle errors?

            # Add separator
            if item != "=":
                msg_str += sep

            # Add text
            msg_str += item

            # Set next separator
            if item.endswith("="):
                sep = ""
            else:
                sep = " "

        return msg_str

    def print_lines(self, lines):
        """
        Print multi-line string TEXT, avoiding 'not enough space' errors on windows
        """
        # Workaround for Python issue - see http://bugs.python.org/issue11395
        # ENH: Share with myw_command
        for line in lines:
            print(line)

        self.out.flush()

    def warnings(self, stat=None):
        """
        Warnings for the current operation (and sub-ops)
        """

        if stat == None:
            stat = self.current_stat

        warnings = []

        # Add warnings from this stat
        for msg in stat["warnings"]:
            warnings.append("***Warning*** " + self.format_message(msg))

        # Add warnings from children
        for child_stat in stat["child_stats"]:
            warnings += self.warnings(child_stat)

        return warnings


class MywLazyJsonFormatter:
    """
    Helper for formatting JSON on demand in progress messages
    """

    def __init__(self, json_dict):
        """
        Init slots of self
        """
        self.json_dict = json_dict

    def __str__(self):
        """
        Self's data as a multi-line string
        """

        return json.dumps(self.json_dict, indent=3)
