# Copyright: IQGeo Limited 2010-2023

import argparse
import json
import os
import re
import csv

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.core.myw_tabulation import MywTableFormatter
from myworldapp.core.server.database.myw_ogc_datasource_engine import MywOgcDatasourceEngine
from myworldapp.core.server.database.myw_esri_rest_datasource_engine import (
    MywEsriRestDatasourceEngine,
)
from myworldapp.core.server.database.myw_file_datasource_engine import MywFileDatasourceEngine

from .myw_command import MywCommand
from .myw_argparse_help_formatter import MywArgparseHelpFormatter


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

    # Note: Done with separate proc to get the standard args at end

    op_def.add_argument("--verbosity", type=int, metavar="LEVEL", default=2, help="Witterage level")
    op_def.add_argument(
        "--summary", type=int, metavar="LEVEL", default=0, help="Summary output level"
    )

    op_def.add_argument("--username", "-U", type=str, help="Remote user to connect")
    op_def.add_argument("--password", "-P", type=str, help="Password for user")
    op_def.add_argument(
        "--password_stdin", action="store_true", help="Take the password from stdin"
    )
    op_def.add_argument(
        "--auth",
        metavar="TYPE",
        type=str,
        choices=["token", "ntlm"],
        help="Authentication method (Esri only)",
    )
    op_def.add_argument(
        "--no_verify_ssl",
        action="store_true",
        help="Suppress SSL certificate verification (Esri only)",
    )


class MywEdsCommand(MywCommand):
    """
    Command line utility for accessing data from external datasources
    """

    # ==============================================================================
    #                                  SHARED ARGS
    # ==============================================================================

    # Definition of command syntax (gets extended in operation clauses below)
    arg_parser = argparse.ArgumentParser(prog="myw_eds", formatter_class=MywArgparseHelpFormatter)
    arg_parser.add_argument(
        "--version", action="version", version="%(prog)s " + MywCommand.version()
    )
    arg_parser.epilog = "Utility for downloading data from external databases."

    arg_parser.add_argument("source", type=str, help="File or URL to query")
    arg_subparsers = arg_parser.add_subparsers(
        dest="operation", help="Operation to perform", required=True
    )

    # ==============================================================================
    #                                  RUNNING
    # ==============================================================================

    def run_method(self, meth):
        """
        Run method METH
        """

        self.progress = MywSimpleProgressHandler(self.args.verbosity)

        super(MywEdsCommand, self).run_method(meth)

    # ==============================================================================
    #                               OPERATION LIST
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "list", help="Show information about external datasource"
    )
    op_def.add_argument(
        "what",
        choices=["properties", "services", "features", "fields", "records"],
        nargs="?",
        default="features",
        help="Type of information to list",
    )
    op_def.add_argument("names", nargs="?", default="*", help="Feature types to show info for")
    op_def.add_argument("--full", action="store_true", help="Show full details")
    op_def.add_argument(
        "--limit", type=int, metavar="N_RECS", help="Maximum number of records to show"
    )
    op_def.add_argument(
        "--layout",
        type=str,
        choices=MywTableFormatter.layouts,
        default="columns",
        help="Format for ouput",
    )
    _add_standard_args(op_def)

    def operation_list(self):
        """
        Show information about the external datasource
        """

        url = self.args.source

        engine = self.__engine_for_url(url)

        if self.args.what == "properties":
            self.list_properties(engine, self.args.layout, self.args.full)
        elif self.args.what == "services":
            self.list_services(engine, self.args.layout, self.args.full)
        elif self.args.what == "features":
            self.list_features(engine, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "fields":
            self.list_fields(engine, self.args.names, self.args.layout, self.args.full)
        elif self.args.what == "records":
            self.list_records(
                engine, self.args.names, self.args.layout, self.args.full, self.args.limit
            )
        else:
            raise MywInternalError("Bad value:", self.args.what)

    def list_properties(self, engine, layout, full):
        """
        List information about the datasource
        """

        rows = []
        for name, value in list(engine.properties(full).items()):
            rows.append({"property": name, "value": value})

        tab_fmtr = MywTableFormatter("property", "value")
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_services(self, engine, layout, full):
        """
        List information about the datasource
        """

        rows = []
        for name, props in list(engine.services().items()):
            props["service"] = name
            rows.append(props)

        cols = ["service"]
        if full:
            cols += ["get_url", "post_url", "params"]

        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_features(self, engine, name_spec, layout, full):
        """
        List feature types
        """

        # Get data to display
        rows = []
        for feature_type in engine.feature_types(name_spec):
            row = engine.feature_type_info_for(feature_type)

            if full:
                ftr_def = engine.get_feature_type_def(feature_type)
                row["fields"] = len(ftr_def["fields"])

            rows.append(row)

        # Display it
        cols = ["name", ["title", "external_name"], "geom_type"]
        if full:
            cols += ["fields"]
        tab_fmtr = MywTableFormatter(*cols)

        self.print_lines(tab_fmtr.format(rows, layout))

    def list_fields(self, engine, name_spec, layout, full):
        """
        List feature field meta-data
        """

        # Get data to display
        rows = []
        for feature_type in engine.feature_types(name_spec):
            feature_def = engine.get_feature_type_def(feature_type)

            for field_def in feature_def["fields"]:
                field_def["name"] = feature_type + "." + field_def["name"]
                rows.append(field_def)

        # Display it
        cols = ["name", "type"]
        if full:
            cols += ["key"]
        tab_fmtr = MywTableFormatter(*cols)

        self.print_lines(tab_fmtr.format(rows, layout))

    def list_records(self, engine, name_spec, layout, full, limit=None):
        """
        List feature data
        """

        for feature_type in engine.feature_types(name_spec):
            feature_def = engine.get_feature_type_def(feature_type)

            rows = []
            for recs in engine.get_feature_data(feature_type, limit=limit):
                rows += recs

            cols = []
            for field in feature_def["fields"]:
                cols.append(field["name"])

            tab_fmtr = MywTableFormatter(*cols)

            self.print_lines(tab_fmtr.format(rows, layout))
            print()

    def list_layers(self, engine, layout):
        """
        List map layers
        """
        layers = engine.read_layers()
        tab_fmtr = MywTableFormatter("title", "name", "abstract", "crs")
        self.print_lines(tab_fmtr.format(list(layers.values()), layout))

    def list_layergroup(self, engine, layer_group):
        """
        List the contents of a named layer group (i.e. the layers making it up)
        """
        layers = engine.read_layer_def(layer_group)
        tab_fmtr = MywTableFormatter("name", "owsType", "owsURL")
        self.print_lines(tab_fmtr.format(list(layers.values())))

    # ==============================================================================
    #                               OPERATION DUMP
    # ==============================================================================
    op_def = _define_operation(arg_subparsers, "dump", help="Download data to file")
    op_def.add_argument(
        "output_dir", type=str, help="Directory to create files in or name of SQLite tilestore file"
    )
    op_def.add_argument(
        "what",
        choices=["features", "data", "tiles"],
        nargs="?",
        default="features",
        help="Type of information to dump",
    )
    op_def.add_argument("names", type=str, nargs="?", default="*", help="Item to dump")
    op_def.add_argument(
        "--area", type=str, help="Bounds to dump in long/lat degrees e.g. (-192,20):(-176,35)"
    )
    op_def.add_argument("--geom_field", type=str, help="Geometry field on which to apply filter")
    op_def.add_argument(
        "--geom_format",
        choices=["wkt", "wkb", "ewkt"],
        default="wkb",
        help="Format of geometry dumped for features",
    )
    op_def.add_argument(
        "--z_range", type=str, default="10:20", help="Zoom level range to extract tiles for"
    )
    op_def.add_argument(
        "--myw_layer", type=str, help="Name of layer to put tiles into tilestore under"
    )
    op_def.add_argument("--protocol", choices=["ESRI", "OGC"], default="OGC", help="Type of server")
    _add_standard_args(op_def)

    def operation_dump(self):
        """
        Dump information out of External Datasource for loading into myWorld
        """

        url = self.args.source
        path = self.args.output_dir
        spec = self.args.names

        engine = self.__engine_for_url(url)

        bounds = self.parse_bounds_arg(self.args.area) if self.args.area else None

        if self.args.what == "features":
            self.dump_feature_defs(engine, path, spec)

        elif self.args.what == "data":
            self.dump_feature_data(
                engine, path, spec, bounds, self.args.geom_field, self.args.geom_format
            )

        elif self.args.what == "tiles":
            z_min, z_max = self.__parse_z_range()
            self.dump_tiles(engine, url, path, spec, bounds, z_min, z_max)

        elif self.args.what == "layers":
            self.dump_layers(engine, path, spec)

        else:
            self.progress("error", "Dump operation '", self.args.what, "' not supported")

    def dump_feature_defs(self, engine, path, name_spec, force=False):
        """
        Write out feature definitions matching NAME_SPEC

        Optional FORCE means attempt to dump even if feature type is not advertised"""

        if force:
            self.dump_feature_def(engine.get_feature_type_def(name_spec), path)

        else:
            for feature_type in engine.feature_types(name_spec):
                feature_def = engine.get_feature_type_def(feature_type)
                self.dump_feature_def(feature_def, path)

    def dump_feature_def(self, feature_type_def, path, encoding="utf-8"):
        """
        Output the type definition to PATH
        """

        feature_type = feature_type_def["name"]
        path = self.fileNameFor(feature_type, path, ".def")

        self.progress(1, "Creating:", path)
        self.writeJsonFile(feature_type_def, path, encoding)

    def dump_feature_data(self, engine, path, name_spec, bounds, geom_name, geom_format):
        """
        Write out feature data

        ENGINE    - the external data source feature engine
        PATH      - location of output file(s)
        NAME_SPEC - features specified by the user (can be wildcarded)
        BOUNDS    - a spatial filter
        GEOM_NAME - the geometry of the feature(s) to spatially filter against
        """

        for feature_type in engine.feature_types(name_spec):

            if not geom_name:
                geom_name = self.geom_field_for(engine, feature_type)

            myw_feature_type = self.localNameFor(feature_type)

            n_files = 0
            for recs in engine.get_feature_data(feature_type, bounds, geom_name, geom_format):

                n_files += 1
                self.writeCSVfile(myw_feature_type, recs, path, n_files, "utf-8")

    def geom_field_for(self, engine, feature_type):
        """
        Name of the geometry field for FEATURE_TYPE
        """

        feature_def = engine.get_feature_type_def(feature_type)

        for field_def in feature_def["fields"]:
            if field_def["type"] in ["point", "linestring", "polygon"]:
                return field_def["name"]

        return "geom"

    def dump_tiles(self, engine, url, path, spec, bounds, z_min, z_max):
        """
        Download tiles for zoom level Z_Min:Z_MAX
        """

        from myworldapp.core.server.base.tilestore.myw_mw_tile_db import MywMWTileDB

        tile_db = MywMWTileDB(path, "w", progress=self.progress)

        password = self.parsePassword()
        tile_db.importTiles(
            self.args.protocol,
            url,
            self.args.username,
            password,
            self.args.names,
            self.args.myw_layer,
            bounds,
            z_min,
            z_max,
        )

    def __parse_z_range(self):
        """
        Parse a range arg
        """
        # ENH: Report errors cleanly

        v = self.args.z_range.split(":")

        return int(v[0]), int(v[1])

    def dump_layers(self, engine, path, name_spec):
        """
        TODO
        """

        for feature_type in engine.feature_types(name_spec):

            s = engine.get_feature_style(feature_type)
            layer = self.build_vector_layer(feature_type, s, engine)
            file_name = self.localNameFor(feature_type) + ".layer"
            self.writeJsonFile(layer, os.path.join(path, file_name), "utf-8")

    def build_vector_layer(self, feature, style, engine):
        """
        TODO
        """
        layer = {}
        layer["name"] = feature["title"]
        layer["category"] = "overlay"
        layer["datasource"] = "myworld"
        layer["spec"] = {"rendering": "vector", "isStatic": False, "customClass": ""}
        layer["min_scale"] = 0
        layer["max_scale"] = 20
        layer["transparency"] = 0
        fs = {
            "name": self.localNameFor(feature["title"]),
            "field_name": "the_geom",
            "min_select": 1,
            "max_select": 20,
        }
        if style["type"] == "point":
            fs["point_style"] = (
                style["pattern"]
                + ":"
                + self.__convert_colour(style["colour"])
                + ":"
                + str(style["size"])
            )
        elif style["type"] == "line":
            fs["line_style"] = (
                self.__convert_colour(style["colour"])
                + ":"
                + str(style["width"])
                + ":"
                + style["pattern"]
            )
        elif style["type"] == "fill":
            fs["fill_style"] = ""
        layer["feature_types"] = [fs]
        return layer

    def __convert_colour(self, rgba):
        """
        Convert colour to a hex string (removing the alpha for now)
        """
        return "#{}{}{}".format(
            "%0.2X" % int(rgba[0]), "%0.2X" % int(rgba[1]), "%0.2X" % int(rgba[2])
        )

    # ==============================================================================
    #                                     HELPERS
    # ==============================================================================

    def parsePassword(self):
        """
        uses password from argument or stdin depending on command arguments used.

        Returns String password
        """

        """ENH: Duplicate parsePassword in myw_db_command"""

        from myworldapp.core.server.base.core.utils import read_password_from_stdin

        password = self.args.password

        # Warn about using --password
        if self.args.password is not None:
            self.progress(
                "warning", "Using --password via the CLI is insecure. Use --password_stdin"
            )

        if self.args.password_stdin:
            password_as_read = read_password_from_stdin()
            password = password if password_as_read is None else password_as_read
        return password

    def writeJsonFile(self, data, file_name, encoding=None):
        """
        Write DATA (a Dict) to FILE_NAME as JSON
        """
        # TODO - copied (modified) from myw_data_loader
        self.progress(3, "write file {}".format(file_name))
        # Set output options
        indent = 3

        # Write data
        with open(file_name, "w", encoding=encoding) as strm:
            json.dump(data, strm, indent=indent, ensure_ascii=(encoding != "utf-8"))

    def writeCSVfile(self, feature_name, recs, path, file_count, encoding=None):
        """
        Write RECS (an array of Dict's)
        FEATURE - the feature name
        PATH - the location of the file(s) to be dumped
        """
        file_name = os.path.join(path, "{}.{}.csv".format(feature_name, file_count))
        self.progress(2, "Writing {} features to {}".format(len(recs), file_name))
        with open(file_name, "w", encoding=encoding) as strm:
            writer = csv.writer(strm)

            # Build and write a list of *all* properties in the feature list
            self.__write_csv_header(writer, recs[0])

            for feature in recs:
                writer.writerow(list(feature.values()))

    def __write_csv_header(self, csvw, feature_row):
        """ """
        csvw.writerow(list(feature_row.keys()))

    def __engine_for_url(self, url):
        """
        Returns an appropriate engine for URL
        """

        if not url.startswith("http"):
            self.progress(3, "Using FILE protocol")
            engine = MywFileDatasourceEngine(url, progress=self.progress)

        elif "/rest/" in url:

            self.progress(3, "Using REST protocol")
            engine = MywEsriRestDatasourceEngine(
                url,
                username=self.args.username,
                password=self.parsePassword(),
                auth_type=self.args.auth,
                verify_ssl=not self.args.no_verify_ssl,
                progress=self.progress,
            )

        else:
            self.progress(3, "Using OGC protocol")
            engine = MywOgcDatasourceEngine(
                url,
                username=self.args.username,
                password=self.parsePassword(),
                progress=self.progress,
            )

        return engine

    def parse_bounds_arg(self, arg_str):
        """
        Convert string representation of bounding box to a bounds object (if

        Expects string of form:
          (min_x,min_y):(max_x,max_y)

        Returns a list of tuples. Throws MywError if parse fails"""

        match = re.match("^\((.*),(.*)\)\:\((.*),(.*)\)$", arg_str)

        if not match:
            raise MywError("Bad value for argument 'area': " + arg_str)

        values = []
        for part in match.groups():
            try:
                values.append(float(part))
            except ValueError:
                raise MywError("Bad value in argument 'area': " + part)

        return ((values[0], values[1]), (values[2], values[3]))

    def fileNameFor(self, obj_name, output_dir, obj_type):
        """
        Construct name of file to store OBJ_NAME in
        """

        return os.path.join(output_dir, self.localNameFor(obj_name) + obj_type)

    def localNameFor(self, name):
        """
        Construct local name for external name NAME
        """
        # TODO: Duplicated with MywDatasource etc

        reps = r"[\s.,\:]+"
        excludes = r"[\<\>\:\'\/\\|\?\*\(\)\{\}\&\^\%\!\`\+\~\#\[\]\@\"" "]"

        name = name.lower()
        name = re.sub(reps, "_", name)
        name = re.sub(excludes, "", name)

        return name
