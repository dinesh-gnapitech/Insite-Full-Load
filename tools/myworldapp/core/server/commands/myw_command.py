################################################################################
# MywCommand
################################################################################
# Copyright: IQGeo Limited 2010-2023

from argparse import ArgumentParser
import json, getpass, socket, sys, re
from typing import Callable
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.system.myw_product import MywProduct


class MywCommand:
    """
    Abstract superclass for engines implementing myWorld command line tools

    Provides .run() plus various helpers.

    Subclasses must implement:
      arg_parser
      operation_xxx()"""

    # Abstract properties to be overridden.
    arg_parser: ArgumentParser = None
    # Note, pylint can't handle MywProgressHandler here, so we use the more general typing.Callable
    progress: Callable = lambda *_: None

    # ==============================================================================
    #                                  RUNNING
    # ==============================================================================

    def run(self, *args):
        """
        Execute the operation specified by ARGS

        ARGS are a list of strings (see self.arg_parser for format)"""

        # Unpick the command line
        self.args = self.arg_parser.parse_args(args)

        # Find method to run
        meth_name = "operation_" + self.args.operation
        meth = getattr(self, meth_name)

        # Run it
        try:
            self.run_method(meth)
        except MywError as cond:
            sys.stdout.flush()
            self.progress("error", cond)
            exit(1)

        exit(0)

    def run_method(self, meth):
        """
        Execute method METH

        Provided to allow subclasses add error handling"""

        meth()

    # ==============================================================================
    #                                  HELPERS
    # ==============================================================================

    @classmethod
    def version(self):
        """
        Core version string
        """

        return MywProduct().module("core").version

    def host_name(self):
        """
        Name of computer on which we are running
        """

        return socket.gethostname()

    def user_name(self):
        """
        Login name of current user
        """

        return getpass.getuser()

    def parse_polygon_arg(self, arg_name, arg_str):
        """
        Returns value of polygon specifier ARG_STR to a Shapely polygon

        ARG_STR is one of:
          (min_x,min_y):(max_x,max_y)   # Bounding box
          <file_path>.json              # File containing a JSON list of coords

        Returns a MywPolygon (or none). Throws MywError if parse fails"""
        # ENH: Support list of coords
        from myworldapp.core.server.base.geom.myw_polygon import MywPolygon

        if not arg_str:
            return None

        # Case: File name
        if arg_str.endswith(".json"):

            try:
                with open(arg_str) as strm:
                    outline = json.load(strm)
                return MywPolygon(outline)

            except Exception as cond:
                raise MywError("Argument", arg_name, ":", "Error reading file", arg_str, ":", cond)

        # Case: Bounds
        else:
            bounds = self.parse_bounds_arg(arg_name, arg_str)

            outline = [
                (bounds[0][0], bounds[0][1]),  # ENH: Encapsulate as object
                (bounds[1][0], bounds[0][1]),
                (bounds[1][0], bounds[1][1]),
                (bounds[0][0], bounds[1][1]),
                (bounds[0][0], bounds[0][1]),
            ]

            return MywPolygon(outline)

    def parse_bounds_arg(self, arg_name, arg_str):
        """
        Convert string representation of bounding box to a bounds object (or None)

        Expects string of form:
          (min_x,min_y):(max_x,max_y)

        Returns a list of tuples. Throws MywError if parse fails"""

        if not arg_str:
            return None

        match = re.match("^\((.*),(.*)\)\:\((.*),(.*)\)$", arg_str)

        if not match:
            raise MywError("Bad value for argument '{}': {}".format(arg_name, arg_str))

        values = []
        for part in match.groups():
            try:
                values.append(float(part))
            except ValueError:
                raise MywError("Bad value in argument '{}': {}".format(arg_name, part))

        return ((values[0], values[1]), (values[2], values[3]))

    def print_lines(self, lines):
        """
        Print multi-line string TEXT, avoiding 'not enough space' errors on windows
        """
        # Workaround for Python issue - see http://bugs.python.org/issue11395

        for line in lines:
            print(line.encode(sys.stdout.encoding, errors="replace").decode(sys.stdout.encoding))
