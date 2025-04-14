################################################################################
# Engine for loading and dumping data database objects
################################################################################
# Copyright: IQGeo Limited 2010-2023

import sys
import glob
import os
import re
import traceback
import json
import ast
import codecs
from datetime import datetime
from collections import OrderedDict
from decimal import Decimal
from sqlalchemy import types as sqa_types
from sqlalchemy.exc import DataError

from myworldapp.core.server.base.core.myw_error import MywDataLoadError, MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.utils import interpret_data_error

from myworldapp.core.server.io.myw_feature_istream import MywFeatureIStream
from myworldapp.core.server.io.myw_feature_ostream import MywFeatureOStream
from myworldapp.core.server.io.myw_csv_feature_ostream import MywCsvFeatureOStream
from myworldapp.core.server.io.myw_csv_feature_istream import MywCsvFeatureIStream


from myworldapp.core.server.dd.myw_dd import MywDD
from myworldapp.core.server.dd.myw_feature_descriptor import MywFeatureDescriptor

from myworldapp.core.server.base.core.utils import filter_by_key


class MywJsonEncoder(json.JSONEncoder):
    """
    Extended JSON encoder handling PostgreSQL types
    """

    def default(self, obj):
        """
        Returns value to output for OBJ
        """

        # Handle dates etc
        if hasattr(obj, "isoformat"):
            return obj.isoformat()

        # Handle values from fixed point decimal fields
        # ENH: Upgrade to simplejson 3.3.1 and remove this
        if isinstance(obj, Decimal):
            return float(obj)

        return super(MywJsonEncoder, self).default(obj)


class MywDataLoader:
    """
    Engine for loading and dumping data from database

    Provides protocols for loading and dumping feature data,
    feature definitions, enum definitons etc.
    """

    def __init__(self, db, progress=MywProgressHandler()):
        """
        Init slots of self

        DB is a myw_session_database. Optional
        PROGRES_PROC(level,*msg) is a callback for progress messages"""

        self.db = db
        self.progress = progress
        self.dd = MywDD(self.db.session, progress=progress)

    # ==============================================================================
    #                                    FILE LOADING
    # ==============================================================================

    def loadFiles(self, dir_name, file_spec, **opts):
        """
        Convenience wrapper to load a set of files from DIR_NAME

        FILE_SPEC is a fnmatch-style string"""

        full_file_spec = os.path.join(dir_name, file_spec)
        file_paths = glob.glob(str(full_file_spec))

        for file_path in sorted(file_paths):
            self.loadFile(file_path, **opts)

    def loadFile(
        self,
        filepath,
        rename=None,
        reload=False,
        update=False,
        force=False,
        file_encoding=None,
        localiser=None,
        date_format=None,
        timestamp_format=None,
        **data_opts,
    ):
        """
        Load a file, determining its type from its extension

        For details of DATA_OPTS see loadFeatures

        Returns:
          N_RECS  Number of records processed
          MSG     String summarising what was done"""

        # Process file (based on extension)
        parts = os.path.basename(filepath).split(".")
        ext = parts[-1]
        file_name = parts[0]
        deletions = (len(parts) > 1) and ("deletions" in parts[1:])

        try:
            if ext in ["def", "config"]:
                n_processed = self.loadFeatureTypeDefs(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    force=force,
                    file_encoding=file_encoding,
                    localiser=localiser,
                    date_format=date_format,
                    timestamp_format=timestamp_format,
                )
                msg = "{} feature type(s) defined".format(n_processed)

            elif ext == "enum":
                names = self.loadEnumerators(
                    filepath,
                    rename=rename,
                    reload=(reload or update),
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} enumerator(s) defined".format(n_processed)

            elif ext == "datasource":
                names = self.loadDatasourceDefinitions(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} datasource(s) defined".format(n_processed)

            elif ext == "layer":
                names = self.loadLayerDefinitions(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} layer(s) defined".format(n_processed)

            elif ext == "layer_group":
                names = self.loadLayerGroupDefinitions(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} layer group(s) defined".format(n_processed)

            elif ext == "localisation":
                self.loadLocalisationDefinition(filepath, file_name, file_encoding=file_encoding)
                n_processed = 1
                msg = "{} localisation file(s) defined".format(n_processed)

            elif ext == "private_layer":
                names = self.loadPrivateLayerDefinitions(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} layer(s) defined".format(n_processed)

            elif ext == "network":
                names = self.loadNetworkDefinitions(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} network(s) defined".format(n_processed)

            elif ext == "application":
                names = self.loadApplications(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} application(s) defined".format(n_processed)

            elif ext == "role":
                names = self.loadRoles(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} role(s) defined".format(n_processed)

            elif ext == "user":
                names = self.loadUsers(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} user(s) defined".format(n_processed)

            elif ext == "group":
                names = self.loadGroups(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} group(s) defined".format(n_processed)

            elif ext == "table_set":
                names = self.loadTableSets(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} table set(s) defined".format(n_processed)

            elif ext == "rights":
                names = self.loadRights(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} right(s) defined".format(n_processed)

            elif ext == "settings":
                names = self.loadSettings(
                    filepath,
                    rename=rename,
                    reload=reload,
                    update=update,
                    file_encoding=file_encoding,
                    localiser=localiser,
                )
                n_processed = len(names)
                msg = "{} setting(s) loaded".format(n_processed)

            elif ext == "delta" and deletions:
                n_processed = self.deleteDeltas(filepath, file_encoding=file_encoding)
                msg = "{} record(s) deleted".format(n_processed)

            elif ext == "delta":
                (n_d_insert, n_d_update, n_b_insert, n_b_update) = self.loadDeltas(
                    filepath,
                    reload=reload,
                    update_sequence=data_opts.get("update_sequence", False),
                    file_encoding=file_encoding,
                )
                n_processed = n_d_insert + n_d_update + n_b_insert + n_b_update
                msg = "{} record(s) processed : delta ({} insert, {} update) : base ({} insert, {} update)".format(
                    n_processed, n_d_insert, n_d_update, n_b_insert, n_b_update
                )

            elif deletions:
                n_processed = self.deleteFeatures(
                    filepath, file_encoding=file_encoding, delta=data_opts.get("delta")
                )
                msg = "{} record(s) deleted".format(n_processed)

            else:
                (n_inserted, n_updated, n_skipped) = self.loadFeatures(
                    filepath,
                    rename=rename,
                    reload=reload,
                    file_encoding=file_encoding,
                    date_format=date_format,
                    timestamp_format=timestamp_format,
                    **data_opts,
                )
                n_processed = n_inserted + n_updated + n_skipped
                msg = "{} record(s) processed ({} inserted, {} updated, {} skipped)".format(
                    n_processed, n_inserted, n_updated, n_skipped
                )
        except DataError as e:
            raise MywError(interpret_data_error(e))

        return n_processed, msg

    # ==============================================================================
    #                        FEATURE TYPE LOAD AND DUMP
    # ==============================================================================

    def loadFeatureTypeDefs(
        self,
        filepath,
        rename=None,
        reload=False,
        update=False,
        force=False,
        file_encoding=None,
        localiser=None,
        date_format=None,
        timestamp_format=None,
    ):
        """
        Create myWorld feature types from the definition(s) in file FILEPATH

        File contains a JSON feature type definition (or list of
        such definitions). See doc for definition of format"""

        feature_defs = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for feature_def in feature_defs:
            if rename:
                feature_def["name"] = rename

            # ENH: Report missing name neatly
            datasource = (
                feature_def.get("datasource") or "myworld"
            )  # ENH: EXTDD: Encapsulate using MywFeatureDesc
            feature_type = feature_def["name"]
            feature_rec = self.dd.featureTypeRec(datasource, feature_type)

            # Drop existing definition (if requested)
            # ENH: Check that the new definition is complete first!
            if feature_rec and reload:
                self.dropFeatureType(feature_rec, force)
                self.db.commit()  # Workaround to ensure SQLAlchemy sees table has gone
                feature_rec = None

            # Check for cannot create (allowing load of .config files without --update)
            if feature_rec and not update and ("fields" in feature_def):
                raise MywError("Feature type already exists:", feature_rec)

            # Create or mutate it
            if not feature_rec:
                feature_rec = self.createFeatureType(feature_def)
            else:
                self.alterFeatureType(feature_rec, feature_def, date_format, timestamp_format)

        return len(feature_defs)

    def createFeatureType(self, feature_def):
        """
        Create myWorld feature type from dict FEATURE_DEF
        """

        with self.progress.operation("Defining feature type:", feature_def.get("name")):

            try:
                feature_desc = MywFeatureDescriptor.fromDef(feature_def, add_defaults=True)
                return self.dd.createFeatureType(feature_desc, warnings_progress=self.progress)

            except MywError:
                raise

            except KeyError as e:
                raise MywDataLoadError(
                    "Feature type definition failed: KeyError: " + str(e), internal_exception=e
                )

            except (KeyboardInterrupt, SystemExit, MemoryError):
                raise

            except Exception as e:
                print()
                traceback.print_exc(file=sys.stdout)
                print()
                raise MywDataLoadError(
                    "Feature type definition failed: " + str(e), internal_exception=e
                )

    def alterFeatureType(self, feature_rec, props, date_format, timestamp_format):
        """
        Mutate a myWorld feature type to shape defined in dict PROPS

        DATE_FORMAT and TIMESTAMP_FORMAT are required for mutation from string data"""

        with self.progress.operation("Updating feature type:", feature_rec):

            try:
                feature_desc = self.dd.featureTypeDescriptor(feature_rec)
                feature_desc.update(props, add_defaults=True)
                return self.dd.alterFeatureType(
                    feature_rec, feature_desc, date_format, timestamp_format
                )

            except MywError:
                raise

            except KeyError as e:
                traceback.print_exc(file=sys.stdout)
                raise MywDataLoadError(
                    "Feature mutation failed: KeyError: " + str(e), internal_exception=e
                )

            except (KeyboardInterrupt, SystemExit, MemoryError):
                raise

            except Exception as e:
                print()
                traceback.print_exc(file=sys.stdout)
                print()
                raise MywDataLoadError("Feature mutation failed: " + str(e), internal_exception=e)

    def dropFeatureType(self, feature_rec, force):
        """
        Drop a feature type
        """

        # Discard data
        if feature_rec.datasource_name == "myworld" and not self.dd.featureTableIsEmpty(
            feature_rec.feature_name
        ):

            if not force:
                raise MywDataLoadError("Table", feature_rec, "is not empty")

            self.progress(1, "Truncating", feature_rec)
            self.dd.emptyFeatureTable(feature_rec.feature_name)

        # Drop the table and associated metadata
        self.progress(1, "Dropping feature type:", feature_rec)
        self.dd.dropFeatureType(feature_rec)

    def dumpFeatureTypeChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .def files for the feature types identified in CHANGES

        CHANGES is a dict of change types, keyed by fully-qualified
        feature name (as returned by MywDatabase.configChanges())"""

        n_written = 0
        for (feature_name, change_type) in list(changes.items()):

            (datasource, feature_type) = feature_name.split("/", 1)

            if change_type in ["insert", "update"]:
                feature_rec = self.dd.featureTypeRec(datasource, feature_type)
                self.dumpFeatureType(output_dir, feature_rec, file_encoding=file_encoding)
                n_written += 1

            else:
                self.warning(
                    "Deletion of feature type", feature_type, "ignored"
                )  # ENH: dump deletions

        return n_written

    def dumpFeatureType(self, output_dir, feature_rec, file_encoding=None):
        """
        Write myWorld .def file for FEATURE_REC to OUTPUT_DIR
        """

        # Get definition
        feature_desc = self.db.dd.featureTypeDescriptor(feature_rec)

        # Write it to file
        self.dumpFeatureTypeDefinition(
            output_dir, feature_desc.definition(), file_encoding=file_encoding
        )

    def dumpFeatureTypeDefinition(
        self, output_dir, feature_def, file_encoding=None, with_datasource=False
    ):
        """
        Write myWorld .def file for FEATURE_DEF to OUTPUT_DIR

        If optional WITH_DATASOURCE is True, always include name of datasource in file name (even for myworld)"""

        # ENH: Replace WITH_DATASOURCE by separate dirs for each datasource in sync packages

        # Construct file name
        if feature_def["datasource"] == "myworld" and not with_datasource:
            feature_ident = feature_def["name"]
        else:
            feature_ident = feature_def["datasource"] + "/" + feature_def["name"]

        file_name = self.fileNameFor(output_dir, feature_ident, ".def")

        # Write it to file
        self.progress(1, "Creating", file_name, "...")
        self.writeJsonFile(feature_def, file_name, encoding=file_encoding)

        return file_name

    # ==============================================================================
    #                              FEATURE DATA LOAD AND DUMP
    # ==============================================================================

    def loadFeatures(
        self,
        filepath,
        autocreate=False,
        key_field=None,
        rename=None,
        reload=False,
        file_encoding=None,
        date_format=None,
        timestamp_format=None,
        coord_sys=None,
        geom_heuristics=False,
        skip_bad_records=True,
        update_sequence=False,
        direct=False,
        delta="",
    ):
        """
        Loads features from file FILEPATH

        Determines feature type from file name.

        If optional AUTOCREATE is true, create feature type if it
        doesn't already exist. If optional RELOAD is true, and the
        feature type already exists, truncate before loading

        Returns vector:
          [0] number of records inserted
          [1] number of records updated
          [2] number of records skipped due to errors"""

        feature_type = os.path.basename(filepath).split(".")[0].lower()
        source_feature = feature_type
        if rename:
            feature_type = rename

        # Create table (if requested)
        feature_rec = self.dd.featureTypeRec("myworld", feature_type)
        if autocreate and not feature_rec:
            feature_rec = self.createFeatureTypeFrom(
                feature_type,
                source_feature,
                filepath,
                file_encoding=file_encoding,
                key_field=key_field,
                geom_heuristics=geom_heuristics,
            )

        # Check for doesn't exist
        if not feature_rec:
            raise MywDataLoadError("No such feature type: ", feature_type)

        # Check for can't handle
        # ENH: Return file_max_id from direct load and remove this
        if direct and update_sequence:
            raise MywError("Direct load does not support sequence update")

        # Get feature table
        table = self.db.view(delta).table(feature_type, versioned_only=True)

        # Discard existing data (if requested)
        if reload:
            # ENH: This duplicates code on myw_dd
            self.progress(1, "Truncating", feature_type)
            table.truncate()

        # Load data
        # ENH: If loading into empty table, disable triggers and build index records later (for speed)
        if direct and not delta:
            # ENH: Warn about bad format, non-WGS84 coord system, ..
            table_desc = table.descriptor.tableDescriptor()
            res = self.db.db_driver.loadFeaturesFrom(
                table_desc, filepath, file_encoding, date_format, timestamp_format
            )
        else:
            res = self.loadFeaturesFrom(
                table,
                filepath,
                file_encoding,
                date_format,
                timestamp_format,
                coord_sys,
                geom_heuristics=geom_heuristics,
                skip_bad_records=skip_bad_records,
            )

        # Update ID generator sequence (if requested)
        if update_sequence:
            self._updateIdSequenceIfNecessary(table.descriptor, res[3])

        return res[0:3]

    def createFeatureTypeFrom(
        self,
        feature_type,
        source_feature,
        filepath,
        file_encoding=None,
        key_field=None,
        geom_heuristics=False,
    ):
        """
        Creates a feature type for the data in file FILEPATH

        Returns a MywDDFeature record"""

        # Deal with defaults
        key_field = key_field or "id"

        # Get definition from file
        with self.featureIStreamFor(
            filepath,
            key_field,
            "the_geom",
            file_encoding=file_encoding,
            geom_heuristics=geom_heuristics,
        ) as strm:
            feature_def = strm.featureDef(source_feature)
            feature_def["name"] = feature_type

        # Add a key field (if necessary)
        feature_desc = MywFeatureDescriptor.fromDef(feature_def, add_defaults=True)
        if not feature_desc.key_field_name:

            if key_field in feature_desc.fields:
                self.progress(2, "Setting as key field:", key_field)
                feature_desc.fields[key_field].key = True
            else:
                self.progress(2, "Adding key field:", key_field)
                feature_desc.addField(key_field, "integer", key=True, generator="sequence")

        return self.createFeatureType(feature_desc.definition())  # ENH: Support pass in descriptor

    def loadFeaturesFrom(
        self,
        table,
        filepath,
        file_encoding=None,
        date_format=None,
        timestamp_format=None,
        coord_sys=None,
        key_field=None,
        geom_heuristics=False,
        skip_bad_records=True,
    ):
        """
        Loads features from file FILEPATH

        TABLE is a MywFeatureTable

        Returns vector:
          [0] number of records inserted
          [1] number of records updated
          [2] number of records skipped due to errors
          [3] highest key value encountered in file (None if key not integer)"""

        # Say what we are doing
        if table.versioned:
            self.progress(3, "Loading data into delta", table.delta)

        # Convert date/time formats to form expected by myw_feature_mixin
        if date_format:
            date_format = self.python_datetime_format_for(date_format)
        if timestamp_format:
            timestamp_format = self.python_datetime_format_for(timestamp_format)

        # Get special fields
        key_field_name = table.descriptor.key_field_name
        primary_geom_name = table.descriptor.primary_geom_name
        db_coord_sys = table.coord_sys

        # Determine if updating key high water mark makes sense
        key_is_integer = table.descriptor.fields[key_field_name].type == "integer"

        # Load data
        stats = {"insert": 0, "update": 0, "skip": 0}
        max_key_val = 0
        with self.featureIStreamFor(
            filepath,
            key_field_name,
            primary_geom_name,
            file_encoding=file_encoding,
            geom_heuristics=geom_heuristics,
        ) as strm:

            # Get version lock (would be obtained by triggers anyway but done here to show progress)
            # ENH: only get lock if tracking changes on this table
            self.db.db_driver.acquireVersionStampLock()

            # Get coordinate system from file (if necessary)
            if not coord_sys:
                coord_sys = strm.coordSystem()  # pylint: disable=assignment-from-none

            # If we will apply a transform .. inform user
            if coord_sys and (coord_sys != db_coord_sys):
                self.progress(1, "Transforming data from coordinate system:", coord_sys)

            # Check for any fields that aren't in the feature model
            if hasattr(strm, "findUnmodelledFields"):
                unmodelled_fields = strm.findUnmodelledFields(table)
                if unmodelled_fields:
                    self.progress(
                        "warning",
                        table.descriptor,
                        "does not contain the following fields:",
                        ", ".join(unmodelled_fields),
                    )

            # For each feature in file ...
            for feature in strm:
                self.progress(8, "Processing input feature:", feature)

                # Create or update record (handling errors)
                (change_type, key_val) = self._loadFeature(
                    table,
                    key_field_name,
                    feature,
                    date_format,
                    timestamp_format,
                    coord_sys,
                    skip_bad_records,
                )

                # Update stats
                stats[change_type] += 1

                # Update ID high water mark
                if key_is_integer and key_val:
                    max_key_val = max(max_key_val, int(key_val))

        return stats["insert"], stats["update"], stats["skip"], max_key_val

    def _loadFeature(
        self,
        table,
        key_field_name,
        feature,
        date_format,
        timestamp_format,
        coord_sys,
        skip_bad_records,
    ):
        """
        Create or update a feature record from dict FEATURE, handling errors

        Returns:
          CHANGE_TYPE
          REC_ID"""

        key_val = feature.get(key_field_name)

        try:

            # Get existing record (if there is one)
            rec = None
            if key_val is not None:
                rec = table.get(key_val)

            # Prevent problems with null value in key
            # ENH: Move to featureTable .. or featureModel
            if (not key_val) and (key_field_name in feature):
                del feature[key_field_name]

            # Create or update it
            if rec is None:
                rec = table.insert(
                    feature,
                    date_format=date_format,
                    timestamp_format=timestamp_format,
                    coord_sys=coord_sys,
                )
                change_type = "insert"
            else:
                rec = table.updateFrom(
                    key_val,
                    feature,
                    date_format=date_format,
                    timestamp_format=timestamp_format,
                    coord_sys=coord_sys,
                )
                change_type = "update"

            # Run triggers etc
            self.db.session.flush()

            return change_type, key_val

        except (ValueError, UnicodeWarning) as cond:
            ftr_ident = "{}({})".format(table.feature_type, key_val)

            if skip_bad_records and isinstance(cond, ValueError):
                self.warning(ftr_ident, ":", cond)
                return "skip", None

            raise MywDataLoadError(ftr_ident, cond)

        return change_type, key_val

    def deleteFeatures(self, filepath, file_encoding=None, delta=""):
        """
        Deletes the myWorld feature records that are listed in FILEPATH

        Assumes all records are from the same table. Table name is obtained from the file name"""

        feature_type = os.path.basename(filepath).split(".")[0]
        table = self.db.view(delta).table(feature_type)

        n_deleted = 0

        with self.featureIStreamFor(
            filepath, "id", "the_geom", file_encoding=file_encoding
        ) as strm:

            # lock will be obtained by triggers anyway but by obtaining it here we can get some logging details if something goes wrong
            # ENH: only get lock if tracking changes on this table
            self.db.db_driver.acquireVersionStampLock()

            # Delete features
            for feature in strm:

                if table.deleteById(feature["id"]):
                    n_deleted += 1

        return n_deleted

    def python_datetime_format_for(self, format):
        """
        Convert a myWorld date/time format specifier to Python format

        The myWorld format is actually just a subset of the Postgres format - see:
          http://www.postgresql.org/docs/8.2/static/functions-formatting.html
        except that HH is interpretted (by us) as a 24 hour clock

        ENH: Support more formats"""

        # Convert date elements
        format = format.replace("YYYY", "%Y")
        format = format.replace("YY", "%y")
        format = format.replace("MM", "%m")
        format = format.replace("DD", "%d")

        # Convert time elements
        format = format.replace("HH", "%H")
        format = format.replace("MI", "%M")
        format = format.replace("SS", "%S")
        format = format.replace("FF", "%f")

        return format

    def dumpFeatureChanges(
        self,
        output_dir,
        feature_type,
        changes,
        delta=None,
        pred=None,
        file_encoding=None,
        file_format="json",
        file_options={},
        max_recs_per_file=None,
    ):
        """
        Write selected data from feature type to file

        CHANGES defines the records to write. It consists of a list
        of change types, keyed by record ID (as returned by MywDatabase.featureChanges())

        Optional PRED is a MywDbPredicate further limiting which records are output

        Writes data to a pair of JSON files (inserts/updates and deletes) as per the ETL export mechanism.

        Returns number of records written"""

        # Find features to export
        changed_ids, deleted_ids = self._splitChanges(changes)

        # Write inserts and updates
        n_ftrs = self.dumpFeatures(
            output_dir,
            feature_type,
            delta=delta,
            pred=pred,
            file_encoding=file_encoding,
            file_format=file_format,
            file_options=file_options,
            feature_ids=changed_ids,
            max_recs_per_file=max_recs_per_file,
        )

        # Write deletes
        n_ftrs += self.dumpFeatureDeletions(
            output_dir,
            feature_type + ".deletions",
            deleted_ids,
            file_encoding=file_encoding,
            file_format=file_format,
            file_options=file_options,
        )

        # ENH: Return file names

        return n_ftrs

    def dumpFeatures(
        self,
        output_dir,
        feature_type,
        delta=None,
        pred=None,
        feature_ids=None,
        file_encoding=None,
        file_format="json",
        file_options={},
        max_recs_per_file=None,
    ):
        """
        Write data for feature type to file (if there is any)

        If optional FEATURE_IDS is give, write only those records

        Returns number of records written"""

        # For each chunk of feature records ..
        n_ftrs = 0
        for (recs, chunk) in self._featureRecChunks(
            feature_type, delta, feature_ids, pred, chunk_size=max_recs_per_file
        ):

            # Write to file
            file_base_name = "{}.{}".format(feature_type, chunk)
            self._writeFeatures(
                output_dir, file_base_name, recs, file_encoding, file_format, file_options
            )

            # Update count
            n_ftrs += len(recs)

        return n_ftrs

    def dumpFeatureDeletions(
        self, output_dir, feature_type, feature_ids, file_encoding, file_format, file_options
    ):
        """
        Write list of deleted feature IDs to file

        Returns number of records written"""

        # Build records to output
        recs = []
        for id in feature_ids:
            recs.append({"id": id})

        n_ftrs = len(recs)

        # Avoid creating empty files
        if n_ftrs > 0:
            file_name = feature_type + ".deletions"
            self._writeFeatures(
                output_dir, feature_type, recs, file_encoding, file_format, file_options
            )

        return n_ftrs

    def _splitChanges(self, changes):
        """
        Splits list CHANGES into inserts/updates and deletions

        CHANGES is a list of change type, keyed by record id

        Returns:
          CHANGED_IDS  Ids of records that has change type 'insert' or 'update'
          DELETED_IDS  Ids of records that has change type 'delete'"""

        changed_ids = []
        deleted_ids = []

        for (id, op) in list(changes.items()):
            if op == "delete":
                deleted_ids.append(id)
            else:
                changed_ids.append(id)

        if len(changes) < 100:  # Hack to keep tests repeatable
            changed_ids = sorted(changed_ids)
            deleted_ids = sorted(deleted_ids)

        return changed_ids, deleted_ids

    def _writeFeatures(self, output_dir, file_name, recs, file_encoding, file_format, file_options):
        """
        Write a set of feature records to file

        FILE_FORMAT is "json" or "csv" """

        # Extract options
        file_options = file_options.copy()
        include_fields = file_options.pop("include_fields", None)
        exclude_fields = file_options.pop("exclude_fields", None)

        # Construct file name
        file_name = os.path.join(output_dir, file_name + "." + file_format)

        # Say what we are about to do
        n_ftrs = len(recs)

        # Get fields to write
        a_rec = recs[0]
        if isinstance(a_rec, dict):
            field_descs = a_rec  # Use first record as stand-in for field descriptions
        else:
            field_descs = a_rec._descriptor.storedFields()

        # Apply include/exclude lists
        if include_fields:
            f = lambda k: k in include_fields
            field_descs = filter_by_key(f, field_descs)

        if exclude_fields:
            f = lambda k: k not in exclude_fields
            field_descs = filter_by_key(f, field_descs)

        if not field_descs:
            return

        # Write features
        self.progress(1, "Creating {} ({} features) ...".format(file_name, n_ftrs))

        with self.featureOStreamFor(
            file_name, field_descs, file_encoding=file_encoding, file_options=file_options
        ) as strm:
            for rec in recs:
                strm.writeFeature(rec)

    def _featureRecChunks(
        self, feature_type, delta=None, feature_ids=None, pred=None, chunk_size=None
    ):
        """
        Generator yielding sets of feature records from table FEATURE_TYPE

        If FEATURE_IDS is supplied, just yield features with those IDs
        If REGION_GEOM is supplied, just yield features that intersect that geometry

        Yields:
          RECS   List of records
          CHUNK  Chunk number (counts from 1)"""

        # Deal with defaults
        chunk_size = chunk_size or 10000

        # Init
        chunk = 1
        recs = []

        # Yield chunks
        for rec in self._featureRecs(feature_type, delta, feature_ids, pred):
            recs.append(rec)

            if len(recs) >= chunk_size:
                yield (recs, chunk)
                chunk += 1
                recs = []

        # Yield final chunk
        if recs:
            yield (recs, chunk)

    def _featureRecs(self, feature_type, delta, feature_ids=None, pred=None):
        """
        Generator yielding the feature records from table FEATURE_TYPE

        If FEATURE_IDS is supplied, just yield features with those IDs
        If REGION_GEOM is supplied, just yield features that intersect that geometry"""

        # Get the base query
        if delta:
            tab = self.db.view(delta)[feature_type]
            model = tab.delta_model
            query = tab._delta_recs.filter(model.myw_change_type != "delete")  # ENH: Encapsulate
        else:
            tab = self.db.tables[feature_type]
            model = tab.model
            query = self.db.session.query(model)

        # Add the filters
        if feature_ids != None:
            query = query.filter(model._key_column().in_(feature_ids))

        if feature_ids == None or len(feature_ids) < 100:  # Hack to keep tests repeatable
            query = query.order_by(model._key_column())

        if pred is not None:
            query = query.filter(pred.sqaFilter(model.__table__))

        # Prevent memory exhaustion on very large tables
        query = self.db.session.myw_db_driver.optimizeLargeQuery(query)

        # Yield the records
        for rec in query:
            yield rec

    # ==============================================================================
    #                             DELTA LOAD AND DUMP
    # ==============================================================================

    def loadDeltas(self, filepath, reload=False, update_sequence=False, file_encoding=None):
        """
        Load delta and base records from file FILEPATH
        """
        # ENH: Support update_sequence, reload, direct, ...?

        feature_type = os.path.basename(filepath).split(".")[0].lower()

        # Get special fields
        feature_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        feature_desc = self.db.dd.featureTypeDescriptor(feature_rec)
        key_field_name = feature_desc.key_field_name
        primary_geom_name = feature_desc.primary_geom_name
        models = self.db.dd.featureModelsFor(feature_type)

        # Determine if updating key high water mark makes sense
        key_is_integer = feature_desc.fields[key_field_name].type == "integer"

        # Init stats
        max_key_val = 0
        stats = {"delta": {"insert": 0, "update": 0}, "base": {"insert": 0, "update": 0}}

        # Load data
        with MywCsvFeatureIStream(
            filepath,
            key_field_name,
            primary_geom_name,
            encoding=file_encoding,
            progress=self.progress,
        ) as strm:

            # Get version lock (would be obtained by triggers anyway but done here to show progress)
            # ENH: only get lock if tracking changes on this table
            self.db.db_driver.acquireVersionStampLock()

            for feature in strm:
                delta = feature["myw_delta"]
                key_val = feature[key_field_name]
                change_type = feature["myw_change_type"]

                self.progress(8, "Processing input delta:", delta, key_val, change_type)

                # Determine target table
                if feature["myw_change_type"] == "base":
                    rec_type = "base"
                else:
                    rec_type = "delta"

                model = models[rec_type]

                # Get existing record (if there is one)
                rec = (
                    self.db.session.query(model)
                    .filter((model.myw_delta == delta) & (model._key_column() == key_val))
                    .first()
                )

                # Create detached record (if necessary)
                if not rec:
                    rec = model()
                    rec.myw_delta = delta
                    if rec_type == "delta":
                        rec.myw_change_type = change_type
                    self.db.session.add(rec)
                    stats[rec_type]["insert"] += 1
                else:
                    stats[rec_type]["update"] += 1

                # Set values
                rec.updateFromDict(feature)

                # Update ID high water mark
                if key_is_integer and key_val:
                    max_key_val = max(max_key_val, int(key_val))

                # Provoke any insert error
                self.db.session.flush()

        # Update sequence
        if update_sequence:
            self._updateIdSequenceIfNecessary(feature_desc, max_key_val)

        return (
            stats["delta"]["insert"],
            stats["delta"]["update"],
            stats["base"]["insert"],
            stats["base"]["update"],
        )

    def deleteDeltas(self, filepath, file_encoding=None):
        """
        Deletes the myWorld delta records that are listed in FILEPATH

        Feature type is determines from file name"""

        feature_type = os.path.basename(filepath).split(".")[0]
        models = self.db.dd.featureModelsFor(feature_type)

        # Init stats
        stats = {"delta": 0, "base": 0}

        with MywCsvFeatureIStream(filepath, "id", "the_geom", encoding=file_encoding) as strm:

            # Get version lock (would be obtained by triggers anyway but done here to show progress)
            # ENH: only get lock if tracking changes on this table
            self.db.db_driver.acquireVersionStampLock()

            # Delete features
            for feature in strm:
                self.progress(8, "Processing delta deletion:", feature)

                schema = feature["schema"]
                delta = feature["myw_delta"]
                key_val = feature["id"]

                model = models[schema]
                rec = self.db.session.query(model).get((delta, key_val))

                if rec:
                    self.progress(7, "Deleting delta record:", rec)
                    self.db.session.delete(rec)
                    self.db.session.flush()
                    stats[schema] += 1

        return stats["delta"] + stats["base"]

    def dumpDeltaChanges(
        self, output_dir, feature_type, delta_changes, base_changes, pred=None, file_encoding=None
    ):
        """
        Write myWorld .delta files for changed delta records CHANGES

        CHANGES is a list of changes types, keyed by (delta,id) tuples"""
        # ENH: Support chunking?

        file_options = {"geom_encoding": "wkb"}

        # Separate into insert/update/deletes
        (delta_changed_ids, delta_deleted_ids) = self._splitChanges(delta_changes)
        (base_changed_ids, base_deleted_ids) = self._splitChanges(base_changes)

        delta_recs = self.db._deltaRecsFor(feature_type, pred=pred, schema="delta")
        base_recs = self.db._deltaRecsFor(feature_type, pred=pred, schema="base")
        # ENH: If delta_recs and base_recs are empty here (e.g. if all delta changes are excluded
        # by the pred) we could return and avoid spurious empty files in the export.

        # Get field descriptors
        feature_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        feature_desc = self.db.dd.featureTypeDescriptor(feature_rec)
        field_descs = feature_desc.tableDescriptor("delta").columns
        delta_model = self.db.dd.featureModel(feature_type, "delta")
        base_model = self.db.dd.featureModel(feature_type, "base")

        # Write inserts and updates
        if delta_changed_ids or base_changed_ids:
            file_name = self.fileNameFor(output_dir, feature_type, ".delta")
            self.progress(1, "Creating", file_name, "...")

            n_recs = 0
            with MywCsvFeatureOStream(
                file_name, field_descs, encoding=file_encoding, **file_options
            ) as strm:

                # ENH: Faster to construct DB query?
                for delta, id in delta_changed_ids:
                    rec = delta_recs.filter(
                        (delta_model.myw_delta == delta) & (delta_model._key_column() == id)
                    ).first()
                    if rec:
                        strm.writeFeature(rec)
                        n_recs += 1

                for delta, id in base_changed_ids:
                    rec = base_recs.filter(
                        (base_model.myw_delta == delta) & (base_model._key_column() == id)
                    ).first()
                    if rec:
                        rec.myw_change_type = "base"
                        strm.writeFeature(rec)
                        n_recs += 1

        # Write deletes
        if delta_deleted_ids or base_deleted_ids:
            file_name = self.fileNameFor(output_dir, feature_type, ".deletions.delta")
            self.progress(1, "Creating", file_name, "...")

            n_recs = 0
            field_descs = ["schema", "myw_delta", "id"]
            with MywCsvFeatureOStream(
                file_name, field_descs, encoding=file_encoding, **file_options
            ) as strm:

                for delta, id in delta_deleted_ids:
                    rec = {"schema": "delta", "myw_delta": delta, "id": id}
                    strm.writeFeature(rec)

                for delta, id in base_deleted_ids:
                    rec = {"schema": "base", "myw_delta": delta, "id": id}
                    strm.writeFeature(rec)

        return len(delta_changes) + len(base_changes)

    def dumpDeltas(self, output_dir, feature_type, name_spec, pred=None, file_encoding=None):
        """
        Write myWorld .delta file for deltas matching NAME_SPEC
        """
        # ENH: Support chunking?
        # ENH: Avoid creating empty files

        file_options = {"geom_encoding": "wkb"}

        # Construct file name
        file_name = self.fileNameFor(output_dir, feature_type, ".delta")
        self.progress(1, "Creating", file_name, "...")

        # Get field descriptors
        feature_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        feature_desc = self.db.dd.featureTypeDescriptor(feature_rec)
        field_descs = feature_desc.tableDescriptor("delta").columns

        # Write records
        n_recs = 0
        with MywCsvFeatureOStream(
            file_name, field_descs, encoding=file_encoding, **file_options
        ) as strm:

            # Write delta records
            for rec in self.db._deltaRecsFor(
                feature_type, name_spec, pred=pred, schema="delta", ordered=True
            ):
                strm.writeFeature(rec)
                n_recs += 1

            # Write base records
            for rec in self.db._deltaRecsFor(
                feature_type, name_spec, pred=pred, schema="base", ordered=True
            ):
                rec.myw_change_type = "base"
                strm.writeFeature(rec)
                n_recs += 1

        return n_recs

    def _updateIdSequenceIfNecessary(self, feature_desc, max_id):
        """
        Update the ID generator for a feature type after loading records

        MAX_ID is the highest ID encounted in the file"""

        # ENH: Move to MywDatabase or MywDD?

        feature_type = feature_desc.name
        key_field = feature_desc.key_field_name

        # Check for ID not generated
        if not feature_desc.fields[key_field].generator == "sequence":
            return

        # Get current value
        seq_next = self.db.db_driver.sequenceValue("data", feature_type, key_field)

        # Check for already high enough
        if seq_next > max_id:
            return

        # Update it
        seq_name = "{}.{}".format(feature_type, key_field)
        seq_next = max_id + 1

        self.progress(1, "Updating sequence", seq_name, "to", seq_next)
        self.db.db_driver.setSequenceValue("data", feature_type, key_field, seq_next)

    # ==============================================================================
    #                             ENUMERATOR LOAD AND DUMP
    # ==============================================================================

    def loadEnumerators(
        self, filepath, rename=None, reload=False, file_encoding=None, localiser=None
    ):
        """
        Creates myworld enumerators from the json definitions in FILEPATH

        if optional RELOAD is true, and an enumerator already exists, it is deleted before loading the new definition

        The file should contain json with keys 'name', 'description' and 'values'

        Returns names of enumerators read"""

        enum_definitions = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for enum_definition in enum_definitions:
            if rename:
                enum_definition["name"] = rename
            self.createEnumerator(enum_definition, reload)

        return [enum_def["name"] for enum_def in enum_definitions]

    def createEnumerator(self, enum_def, reload=False):
        """
        Creates an enumerator from ENUM_DEF

        enum_def is a dictionary with keys:
            name
            description
            values

        Throws MywError if enumerator already exists (unless RELOAD is true)"""

        # ENH: As a single transaction

        name = enum_def["name"]

        if self.dd.enumeratorExists(name):

            if not reload:
                raise MywError("Enumerator already exists: " + name)

            self.progress(1, "Dropping enumerator:", name)
            self.dd.dropEnumerator(name)

        self.progress(1, "Defining enumerator:", name)
        self.dd.createEnumerator(name, enum_def.get("description", ""), enum_def["values"])

        if reload:
            # rebuild triggers and search strings affected by this enumerator
            self.dd.rebuildForEnumChange(name)

    def dumpEnumeratorChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .enum files for the enumerators identified in CHANGES

        CHANGES is a dict of change types, keyed by enumerator name (as returned by MywDatabase.configChanges())"""

        n_written = 0
        for (enum_name, change_type) in list(changes.items()):

            if change_type in ["insert", "update"]:
                self.dumpEnumerator(output_dir, enum_name, file_encoding=file_encoding)
                n_written += 1

            else:
                self.warning("Deletion of enumerator", enum_name, "ignored")  # ENH: dump deletions

        return n_written

    def dumpEnumerator(self, output_dir, enum_name, file_encoding=None):
        """
        Write myWorld .enum file for ENUM_NAME to file FILEPATH
        """

        # Construct file name
        file_name = self.fileNameFor(output_dir, enum_name, ".enum")
        self.progress(1, "Creating", file_name, "...")

        # Get definition
        enum_def = self.db.dd.enumeratorDef(enum_name)

        # Write it to file
        self.writeJsonFile(enum_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                              DATASOURCE LOAD AND DUMP
    # ==============================================================================

    def loadDatasourceDefinitions(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Creates myworld datasources from the json definitions in FILEPATH

        If optional RELOAD is true, and an datasource already exists, it
        is deleted before loading the new definition

        Returns names of datasources loaded"""

        datasource_defs = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for datasource_def in datasource_defs:
            if rename:
                datasource_def["name"] = rename
            self.createDatasource(datasource_def, reload, update)

        return [datasource_def["name"] for datasource_def in datasource_defs]

    def createDatasource(self, datasource_def, reload=False, update=False):
        """
        Creates a datasource from DATASOURCE_DEF

        DATASOURCE_DEF is a dict, as created by DatasourceDef()

        Throws MywError if the datasource already exists (unless RELOAD is true)"""

        datasource_name = datasource_def["name"]

        if not self.db.dd.datasourceExists(datasource_name):

            self.progress(1, "Defining datasource:", datasource_name)
            self.db.dd.createDatasource(datasource_def)

        else:

            if update:
                self.progress(1, "Updating datasource:", datasource_name)
                self.db.dd.updateDatasource(datasource_name, datasource_def)

            elif reload:
                self.progress(1, "Reloading datasource", datasource_name)
                self.db.dd.dropDatasource(datasource_name)
                self.db.dd.createDatasource(datasource_def)

            else:
                raise MywError("Datasource already exists: " + datasource_name)

    def dumpDatasourceChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .datasource files for the datasrouces identified in CHANGES

        CHANGES is a list of change types, keyed by datasource name (as returned by MywDatabase.configChanges())"""

        n_written = 0
        for (datasource_name, change_type) in list(changes.items()):

            if change_type in ["insert", "update"]:
                self.dumpDatasourceDefinition(
                    output_dir, datasource_name, file_encoding=file_encoding
                )
                n_written += 1

            else:
                self.warning(
                    "Deletion of datasource", datasource_name, "ignored"
                )  # ENH: dump deletions

        return n_written

    def dumpDatasourceDefinition(self, output_dir, datasource, file_encoding=None):
        """
        Write myWorld .datasource file for DATASOURCE to OUTPUT_DIR
        """

        # Construct file name
        file_name = self.fileNameFor(output_dir, datasource, ".datasource")
        self.progress(1, "Creating", file_name, "...")

        # Get definition
        datasource_def = self.db.dd.datasourceDef(datasource)

        # Write it to file
        self.writeJsonFile(datasource_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                                LAYER LOAD AND DUMP
    # ==============================================================================

    def loadLayerDefinitions(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Creates myworld layers from the json definitions in FILEPATH

        If optional RELOAD is true, and an layer already exists, it
        is deleted before loading the new definition

        Returns names of layers read"""

        layer_definitions = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for layer_definition in layer_definitions:
            if rename:
                layer_definition["name"] = rename
            self.createLayer(layer_definition, reload, update)

        return [layer_def["name"] for layer_def in layer_definitions]

    def createLayer(self, layer_definition, reload=False, update=False):
        """
        Creates an layer from LAYER_DEFINITION

        LAYER_DEFINITION is a dict, as created by LayerDef()

        Throws MywError if layer already exists (unless RELOAD is true)"""

        layer_name = layer_definition["name"]

        if not self.db.config_manager.layerExists(layer_name):

            self.progress(1, "Defining layer:", layer_name)
            self.db.config_manager.createLayer(layer_definition)

        else:

            if update:
                self.progress(1, "Updating layer:", layer_name)
                self.db.config_manager.updateLayer(layer_name, layer_definition)

            elif reload:
                self.progress(1, "Reloading layer", layer_name)
                self.db.config_manager.dropLayer(layer_name)
                self.db.config_manager.createLayer(layer_definition)

            else:
                raise MywError("Layer already exists: " + layer_name)

    def dumpLayerChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .layer files for the layers identified in CHANGES

        CHANGES is a list of change types, keyed by layer name (as returned by MywDatabase.configChanges())"""

        n_written = 0
        for (layer_name, change_type) in list(changes.items()):

            if change_type in ["insert", "update"]:
                self.dumpLayerDefinition(output_dir, layer_name, file_encoding=file_encoding)
                n_written += 1

            else:
                self.warning("Deletion of layer", layer_name, "ignored")  # ENH: dump deletions

        return n_written

    def dumpLayerDefinition(self, output_dir, layer, file_encoding=None):
        """
        Write myWorld .layer file for LAYER to OUTPUT_DIR
        """

        # Construct file name
        file_name = self.fileNameFor(output_dir, layer, ".layer")
        self.progress(1, "Creating", file_name, "...")

        # Get definition
        layer_def = self.db.config_manager.layerDef(layer)

        # In the event that we have an ESRI drawing_info present for the features, remove them here
        if layer_def.get("feature_types", None) is not None:
            for feature_type in layer_def["feature_types"]:
                if feature_type.get("drawing_info", None) is not None:
                    feature_type.pop("drawing_info")

        # Write it to file
        self.writeJsonFile(layer_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                                LOCALISATION LOAD AND DUMP
    # ==============================================================================

    def loadLocalisationDefinition(self, filepath, language, file_encoding=None):
        """
        Loads localisation data to relevant myWorld Data
        """

        localisation_data = self.loadJsonFile(filepath, file_encoding)
        self.db.localisation_manager.applyLocalisationData(localisation_data, language)

    def dumpLocalisation(self, output_dir, file_encoding=None, language=None):
        """
        Write myWorld .localisation file for language to OUTPUT_DIR
        """

        # Construct file name
        if language is None:
            language = self.db.dd.languages[0]

        self.progress(1, language, "...")
        file_name = self.fileNameFor(output_dir, language, ".localisation")
        self.progress(1, "Creating", file_name, "...")

        # Get data
        localisation_data = self.db.localisation_manager.localisationData(language)

        # Write it to file
        self.writeJsonFile(localisation_data, file_name, encoding=file_encoding)

    # ==============================================================================
    #                                LAYER GROUP LOAD AND DUMP
    # ==============================================================================

    def loadLayerGroupDefinitions(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Creates myworld layer groups from the json definitions in FILEPATH

        If optional RELOAD is true, and an layer group already exists, it
        is deleted before loading the new definition

        Returns names of layer groups read"""

        group_definitions = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for group_definition in group_definitions:
            if rename:
                group_definition["name"] = rename
            self.createLayerGroup(group_definition, reload, update)

        return [group_def["name"] for group_def in group_definitions]

    def createLayerGroup(self, group_definition, reload=False, update=False):
        """
        Creates an layer from GROUP_DEFINITION

        GROUP_DEFINITION is a dict, as created by LayerGroupDef()

        Throws MywError if layer already exists (unless RELOAD is true)"""

        group_name = group_definition["name"]

        if not self.db.config_manager.layerGroupExists(group_name):

            self.progress(1, "Defining layer group:", group_name)
            self.db.config_manager.createLayerGroup(group_definition)

        else:

            if update:
                self.progress(1, "Updating layer group:", group_name)
                self.db.config_manager.updateLayerGroup(group_name, group_definition)

            elif reload:
                self.progress(1, "Reloading layer group", group_name)
                self.db.config_manager.dropLayerGroup(group_name)
                self.db.config_manager.createLayerGroup(group_definition)

            else:
                raise MywError("Layer group already exists: " + group_name)

    def dumpLayerGroupChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .layer_group files for the layer groups identified in CHANGES

        CHANGES is a list of change types, keyed by layer name (as returned by MywDatabase.configChanges())"""

        n_written = 0
        for (name, change_type) in list(changes.items()):

            if change_type in ["insert", "update"]:
                self.dumpLayerGroupDefinition(output_dir, name, file_encoding=file_encoding)
                n_written += 1

            else:
                self.warning("Deletion of layer group", name, "ignored")  # ENH: dump deletions

        return n_written

    def dumpLayerGroupDefinition(self, output_dir, name, file_encoding=None):
        """
        Write myWorld .layer_group file for NAME to OUTPUT_DIR
        """

        # Construct file name
        file_name = self.fileNameFor(output_dir, name, ".layer_group")
        self.progress(1, "Creating", file_name, "...")

        # Get definition
        group_def = self.db.config_manager.layerGroupRec(name).serialise()

        # Write it to file
        self.writeJsonFile(group_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                             PRIVATE LAYER LOAD AND DUMP
    # ==============================================================================

    def loadPrivateLayerDefinitions(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Creates definitions of used-defined layers from the json definitions in FILEPATH

        If optional RELOAD is true, and an layer already exists, it
        is deleted before loading the new definition

        Returns names of layers read"""

        layer_definitions = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for layer_definition in layer_definitions:
            if rename:
                layer_definitions["name"] = rename
            self.createPrivateLayer(layer_definition, reload, update)

        return [layer_def["name"] for layer_def in layer_definitions]

    def createPrivateLayer(self, layer_definition, reload=False, update=False):
        """
        Creates a used-defined layer from LAYER_DEFINITION

        LAYER_DEFINITION is a dict, as created by MywPrivateLayer.definition()

        Throws MywError if layer already exists (unless RELOAD is true)"""

        owner = layer_definition["owner"]
        name = layer_definition["name"]

        layer_id = owner + ":" + name

        if not self.db.config_manager.privateLayerExists(layer_id):

            self.progress(1, "Defining user layer:", layer_id)
            self.db.config_manager.createPrivateLayer(layer_definition)

        else:

            if update:
                self.progress(1, "Updating user layer:", layer_id)
                self.db.config_manager.updatePrivateLayer(layer_id, layer_definition)

            elif reload:
                self.progress(1, "Reloading user layer", layer_id)
                self.db.config_manager.dropPrivateLayer(layer_id)
                self.db.config_manager.createPrivateLayer(layer_definition)

            else:
                raise MywError("User layer already exists: " + layer_id)

    def dumpPrivateLayerChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .private_layer files for the layers identified in CHANGES

        CHANGES is a list of change types, keyed by group id (as returned by MywDatabase.configChanges())"""

        n_written = 0
        for (rec_id, change_type) in list(changes.items()):

            if change_type in ["insert", "update"]:
                layer_rec = self.db.config_manager.privateLayerRec(rec_id)
                self.dumpPrivateLayer(output_dir, layer_rec, file_encoding=file_encoding)
                n_written += 1

            else:
                self.warning("Deletion of private layer", rec_id, "ignored")  # ENH: dump deletions

        return n_written

    def dumpPrivateLayer(self, output_dir, layer_rec, file_encoding=None):
        """
        Write myWorld .private_layer file for to OUTPUT_DIR
        """

        file_name = self.fileNameFor(output_dir, layer_rec.id, ".private_layer")
        self.progress(1, "Creating", file_name, "...")

        # Get PrivateLayer
        group_def = layer_rec.definition()

        # Write it to file
        self.writeJsonFile(group_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                                NETWORK LOAD AND DUMP
    # ==============================================================================

    def loadNetworkDefinitions(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Creates myworld networks from the json definitions in FILEPATH

        If optional RELOAD is true, and an network already exists, it
        is deleted before loading the new definition

        Returns names of networks read"""

        network_definitions = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for network_definition in network_definitions:
            if rename:
                network_definition["name"] = rename
            self.createNetwork(network_definition, reload, update)

        return [network_def["name"] for network_def in network_definitions]

    def createNetwork(self, network_definition, reload=False, update=False):
        """
        Creates an network from NETWORK_DEFINITION

        NETWORK_DEFINITION is a dict, as created by NetworkDef()

        Throws MywError if network already exists (unless RELOAD is true)"""

        network_name = network_definition["name"]

        if not self.db.config_manager.networkExists(network_name):

            self.progress(1, "Defining network:", network_name)
            self.db.config_manager.createNetwork(network_definition)

        else:

            if update:
                self.progress(1, "Updating network:", network_name)
                self.db.config_manager.updateNetwork(network_name, network_definition)

            elif reload:
                self.progress(1, "Reloading network", network_name)
                self.db.config_manager.dropNetwork(network_name)
                self.db.config_manager.createNetwork(network_definition)

            else:
                raise MywError("Network already exists: " + network_name)

    def dumpNetworkChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .network files for the networks identified in CHANGES

        CHANGES is a list of change types, keyed by network name (as returned by MywDatabase.configChanges())"""

        n_written = 0
        for (network_name, change_type) in list(changes.items()):

            if change_type in ["insert", "update"]:
                self.dumpNetworkDefinition(output_dir, network_name, file_encoding=file_encoding)
                n_written += 1

            else:
                self.warning("Deletion of network", network_name, "ignored")  # ENH: dump deletions

        return n_written

    def dumpNetworkDefinition(self, output_dir, network, file_encoding=None):
        """
        Write myWorld .network file for NETWORK to OUTPUT_DIR
        """

        # Construct file name
        file_name = self.fileNameFor(output_dir, network, ".network")
        self.progress(1, "Creating", file_name, "...")

        # Get definition
        network_def = self.db.config_manager.networkDef(network)

        # Write it to file
        self.writeJsonFile(network_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                              APPLICATION LOAD AND DUMP
    # ==============================================================================

    def loadApplications(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Creates myWorld applications from the json definitions in FILEPATH

        If optional RELOAD is true, and an application already exists, it
        is deleted before loading the new definition

        Returns names of applications read"""
        application_definitions = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for application_definition in application_definitions:
            if rename:
                application_definition["name"] = rename
            self.createApplication(application_definition, reload, update)

        return [application_def["name"] for application_def in application_definitions]

    def createApplication(self, application_definition, reload=False, update=False):
        """
        Create an application from APPLICATION_DEFINITION

        Throw mywError if application already exists and RELOAD is FALSE"""
        application_name = application_definition["name"]

        if not self.db.config_manager.applicationExists(application_name):

            self.progress(1, "Defining application:", application_name)
            self.db.config_manager.createApplication(application_definition)

        else:

            if not reload and not update:
                raise MywError("Application already exists: " + application_name)

            if update:
                self.progress(1, "Updating application:", application_name)
                self.db.config_manager.updateApplication(application_name, application_definition)

            elif reload:
                self.progress(1, "Reloading application:", application_name)
                self.db.config_manager.dropApplication(application_name)
                self.db.config_manager.createApplication(application_definition)

    def dumpApplicationChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .application files for the applications identified in CHANGES

        CHANGES is a dict of change types, keyed by application name (as returned by MywDatabase.configChanges())"""

        n_written = 0
        for (application_name, change_type) in list(changes.items()):

            if change_type in ["insert", "update"]:
                self.dumpApplication(output_dir, application_name, file_encoding=file_encoding)
                n_written += 1

            else:
                self.warning(
                    "Deletion of application", application_name, "ignored"
                )  # ENH: dump deletions

        return n_written

    def dumpApplication(self, output_dir, application, file_encoding=None):
        """
        Write myWorld .application file for APPLICATION to OUTPUT_DIR
        """

        file_name = self.fileNameFor(output_dir, application, ".application")
        self.progress(1, "Creating", file_name, "...")

        # Get Application
        application_def = self.db.config_manager.applicationDef(application)

        # Write it to file
        self.writeJsonFile(application_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                              ROLE LOAD AND DUMP
    # ==============================================================================

    def loadRoles(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Creates myWorld roles from the json definitions in FILEPATH

        If optional RELOAD is true, and role already exists, it
        is deleted before loading the new definition

        Returns names of role read"""
        role_definitions = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for role_definition in role_definitions:
            if rename:
                role_definition["name"] = rename
            self.createRole(role_definition, reload, update)

        return [role_def["name"] for role_def in role_definitions]

    def createRole(self, role_def, reload=False, update=False):
        """
        Create a role from ROLE_DEF
        """
        role_name = role_def["name"]

        if not self.db.config_manager.roleExists(role_name):

            self.progress(1, "Defining role:", role_name)
            self.db.config_manager.createRole(role_def, self.progress)

        else:

            if not reload and not update:
                raise MywError("Role already exists: " + role_name)

            if update:
                self.progress(1, "Updating role:", role_name)
                self.db.config_manager.updateRole(role_name, role_def)

            elif reload:
                self.progress(1, "Reloading role:", role_name)
                self.db.config_manager.dropRole(role_name)
                self.db.config_manager.createRole(role_def, self.progress)

    def dumpRoleChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .role files for the roles identified in CHANGES

        CHANGES is a list of change types, keyed by role name"""

        n_written = 0
        for (role_name, change_type) in list(changes.items()):

            if change_type in ["insert", "update"]:
                self.dumpRole(output_dir, role_name, file_encoding=file_encoding)
                n_written += 1

            else:
                self.warning("Deletion of role", role_name, "ignored")  # ENH: dump deletions

        return n_written

    def dumpRole(self, output_dir, role, file_encoding=None):
        """
        Write myWorld .role file for ROLE to OUTPUT_DIR
        """
        file_name = self.fileNameFor(output_dir, role, ".role")
        self.progress(1, "Creating", file_name, "...")

        # Get Role
        role_def = self.db.config_manager.roleDef(role)

        # Write it to file
        self.writeJsonFile(role_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                              USER LOAD AND DUMP
    # ==============================================================================

    def loadUsers(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Creates myWorld users from the json definitions in FILEPATH

        If optional RELOAD is true, and user already exists, it
        is deleted before loading the new definition

        Returns names of user read"""

        user_defs = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for user_def in user_defs:
            if rename:
                user_defs["name"] = rename
            self.createUser(user_def, reload, update)

        return [user_def["username"] for user_def in user_defs]

    def createUser(self, user_def, reload=False, update=False):
        """
        Create a user from USER_DEF
        """
        user_name = user_def["username"]

        if not self.db.config_manager.userExists(user_name):

            self.progress(1, "Defining user:", user_name)
            self.db.config_manager.createUser(user_def)

        else:

            if not reload and not update:
                raise MywError("User already exists: " + user_name)

            if update:
                self.progress(1, "Updating user:", user_name)
                self.db.config_manager.updateUser(user_name, user_def)

            elif reload:
                self.progress(1, "Reloading user:", user_name)
                self.db.config_manager.dropUser(user_name)
                self.db.config_manager.createUser(user_def)

    def dumpUser(self, output_dir, user, file_encoding=None):
        """
        Write myWorld .user file for USER to OUTPUT_DIR
        """
        file_name = self.fileNameFor(output_dir, user, ".user")
        self.progress(1, "Creating", file_name, "...")

        # Get User
        user_def = self.db.config_manager.userDef(user)

        # Write it to file
        self.writeJsonFile(user_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                              GROUP LOAD AND DUMP
    # ==============================================================================

    def loadGroups(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Creates myWorld user groups from the json definitions in FILEPATH

        Optional reload ignored

        Returns names of groups read"""

        group_defs = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for group_def in group_defs:
            if rename:
                group_defs["name"] = rename
            self.createGroup(group_def, reload, update)

        return [group_def["name"] for group_def in group_defs]

    def createGroup(self, group_def, reload=False, update=False):
        """
        Create a group from GROUP_DEF
        """

        owner = group_def["owner"]
        name = group_def["name"]

        group_id = owner + ":" + name

        if not self.db.config_manager.groupExists(group_id):

            self.progress(1, "Defining group:", group_id)
            self.db.config_manager.createGroup(group_def)

        else:

            if not reload and not update:
                raise MywError("Group already exists: " + group_id)

            if update:
                self.progress(1, "Updating group:", group_id)
                self.db.config_manager.updateGroup(group_id, group_def)

            elif reload:
                self.progress(1, "Reloading group:", group_id)
                self.db.config_manager.dropGroup(group_id)
                self.db.config_manager.createGroup(group_def)

    def dumpGroupChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .group files for the user groups identified in CHANGES

        CHANGES is a list of change types, keyed by group id (as returned by MywDatabase.configChanges())"""

        n_written = 0
        for (name, change_type) in list(changes.items()):

            if change_type in ["insert", "update"]:
                group_rec = self.db.config_manager.groupRec(name)
                self.dumpGroup(output_dir, group_rec, file_encoding=file_encoding)
                n_written += 1

            else:
                self.warning("Deletion of group", name, "ignored")  # ENH: dump deletions

        return n_written

    def dumpGroup(self, output_dir, group_rec, file_encoding=None):
        """
        Write myWorld .group file for GROUP to OUTPUT_DIR
        """

        file_name = self.fileNameFor(output_dir, group_rec.id, ".group")
        self.progress(1, "Creating", file_name, "...")

        # Get Group
        group_def = group_rec.definition()

        # Write it to file
        self.writeJsonFile(group_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                              TABLE SET LOAD AND DUMP
    # ==============================================================================

    def loadTableSets(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Creates myWorld table sets from the json definitions in FILEPATH

        If optional RELOAD is true, and table_set already exists, it
        is deleted before loading the new definition

        Returns names of table sets read"""

        table_set_defs = self.loadJsonFile(filepath, file_encoding, localiser, True)

        for table_set_def in table_set_defs:
            if rename:
                table_set_defs["name"] = rename
            self.createTableSet(table_set_def, reload, update)

        return [table_set_def["name"] for table_set_def in table_set_defs]

    def createTableSet(self, table_set_def, reload=False, update=False):
        """
        Create a table_set from TABLE_SET_DEF
        """

        table_set_name = table_set_def["name"]

        if not self.db.config_manager.tableSetExists(table_set_name):

            self.progress(1, "Defining table set:", table_set_name)
            self.db.config_manager.createTableSet(table_set_def)

        else:

            if not reload and not update:
                raise MywError("Table set already exists: " + table_set_name)

            if update:
                self.progress(1, "Updating table set:", table_set_name)
                self.db.config_manager.updateTableSet(table_set_name, table_set_def)

            elif reload:
                self.progress(1, "Reloading table set:", table_set_name)
                self.db.config_manager.dropTableSet(table_set_name)
                self.db.config_manager.createTableSet(table_set_def)

    def dumpTableSetChanges(self, output_dir, changes, file_encoding=None):
        """
        Write .table_set files for the table_sets identified in CHANGES

        CHANGES is a list of change types, keyed by table_set name"""

        n_written = 0
        for (table_set_id, change_type) in list(changes.items()):

            if change_type in ["insert", "update"]:
                self.dumpTableSet(output_dir, table_set_id, file_encoding=file_encoding)
                n_written += 1

            else:
                self.warning(
                    "Deletion of table_set", table_set_id, "ignored"
                )  # ENH: dump deletions

        return n_written

    def dumpTableSet(self, output_dir, table_set, file_encoding=None):
        """
        Write myWorld .table_set file for TABLE_SET to OUTPUT_DIR
        """

        file_name = self.fileNameFor(output_dir, table_set, ".table_set")
        self.progress(1, "Creating", file_name, "...")

        # Get definition
        table_set_def = self.db.config_manager.tableSetDef(table_set)

        # Write it to file
        self.writeJsonFile(table_set_def, file_name, encoding=file_encoding)

    # ==============================================================================
    #                              RIGHTS AND LOAD
    # ==============================================================================

    def loadRights(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Load rights from the json file FILEPATH

        If optional RELOAD is true, and right already exists, it
        is deleted before loading the new definition

        Returns names of rights read"""

        # Note: RELOAD ignored

        # Read new defintions
        rights = self.loadJsonFile(filepath, file_encoding, localiser, False)

        # Create or update rights
        for name, right_def in list(rights.items()):
            if rename:
                name = rename

            # Get existing definition (if there is one)
            rec = self.db.rightRec(name)

            # Add or update
            if not rec:
                self.progress(3, "Defining right:", name)
                self.db.addRight(name, right_def["description"], right_def.get("config", False))

            else:
                if not update:
                    raise MywError("Right already exists: " + name)

                self.progress(3, "Updating right:", name)
                rec.description = right_def["description"]
                rec.config = right_def.get("config", False)

        return list(rights.keys())

    # ==============================================================================
    #                              SETTINGS DUMP AND LOAD
    # ==============================================================================

    def loadSettings(
        self, filepath, rename=None, reload=False, update=False, file_encoding=None, localiser=None
    ):
        """
        Load settings from the json definition in FILEPATH

        If optional RELOAD is true, and setting already exists, it
        is deleted before loading the new definition

        Returns names of settings read"""

        # Read new settings
        settings = self.loadJsonFile(filepath, file_encoding, localiser, False)

        # Remove existing ones (if requested)
        if reload:
            for name in self.db.settings():
                self.db.setSetting(name, None)

        # Set new values
        for name, value in list(settings.items()):
            if rename:
                name = rename

            if self.db.setting(name) == None:

                self.progress(3, "Defining setting:", name)
                self.db.setSetting(name, value)

            else:
                if not update:
                    raise MywError("Setting already exists: " + name)

                self.progress(3, "Updating setting:", name)
                self.db.setSetting(name, value)

        return list(settings.keys())

    def dumpSettingChanges(self, output_dir, changes, file_encoding=None, excludes=[]):
        """
        Write .settings file for the settings identified in CHANGES

        CHANGES is a list of change types, keyed by setting name

        Optional EXCLUDES is a list of setting names to ignore (used in replication)"""

        # Get data to dump
        settings = OrderedDict()
        for (name, change_type) in list(changes.items()):

            if name in excludes:
                continue

            if change_type in ["insert", "update"]:
                self.progress(3, "Dumping value for setting:", name)
                settings[name] = self.db.setting(name)
            else:
                self.warning("Deletion of setting", name, "ignored")

        # Avoiding empty files ..
        if settings:

            # Construct file name
            file_name = os.path.join(output_dir, "system.settings")
            self.progress(1, "Creating", file_name, "...")

            # Write data
            self.writeJsonFile(settings, file_name, encoding=file_encoding)

        return len(settings)

    def dumpSettings(self, output_dir, name_spec, file_encoding=None):
        """
        Write myWorld .settings file for NAMES to OUTPUT_DIR
        """

        # Construct file name
        file_name = os.path.join(output_dir, "system.settings")
        self.progress(1, "Creating", file_name, "...")

        # Get data to dump
        settings = OrderedDict()
        for name in self.db.settings(name_spec):
            self.progress(3, "Dumping value for setting:", name)
            settings[name] = self.db.setting(name)

        # Write it to file
        self.writeJsonFile(settings, file_name, encoding=file_encoding)

        return len(settings)

    # ==============================================================================
    #                                    HELPERS
    # ==============================================================================
    # ENH: (?)Better on MywDatabase

    def loadSystemData(self, table_name, filepath, reload=False):
        """
        Load data from CSV file FILEPATH into system table TABLE_NAME
        """
        # Used in DevDB build

        import codecs, csv

        timestamp_format = "%Y-%m-%d %H:%M:%S.%f"

        model = self.db.db_driver.rawModelFor("myw", table_name)

        # Remove existing data (if requested)
        if reload:
            self.db.session.query(model).delete()

        # Load records
        max_id = 0
        with codecs.open(filepath, "r") as strm:
            csv_reader = csv.DictReader(strm)

            for det_rec in csv_reader:

                # Build record
                # ENH: Implement MywModelMixin.updateFromDict()
                rec = model()

                for name, value in list(det_rec.items()):
                    col = model.__table__.columns[name]

                    if isinstance(col.type, (sqa_types.Float, sqa_types.Integer)):
                        value = col.type.python_type(value)

                    elif isinstance(col.type, (sqa_types.Boolean)):
                        value = ast.literal_eval(value)

                    elif isinstance(col.type, sqa_types.TIMESTAMP):
                        value = datetime.strptime(value, timestamp_format)

                    setattr(rec, name, value)

                    if name == "id" and isinstance(value, int):
                        max_id = max(max_id, value)

                # Insert it
                self.db.session.add(rec)

        if max_id:
            self.db.session.myw_db_driver.setSequenceValue("myw", table_name, "id", max_id + 1)

        self.db.session.commit()

    def loadJsonFile(self, file_name, encoding=None, localiser=None, as_array=False):
        """
        Get contents of JSON file FILE_NAME (mapping errors)

        If AS_ARRAY is true, and the file contains just one object,
        wrap that object in a list"""

        try:
            with codecs.open(file_name, "r", encoding) as json_stream:
                data = json.load(json_stream)

        except (LookupError) as e:
            raise MywDataLoadError("Error reading file '{}': {}".format(file_name, str(e)))

        except (UnicodeDecodeError, ValueError) as e:
            raise MywDataLoadError("Error reading file '{}': {}".format(file_name, str(e)))

        if localiser:
            data = localiser.replaceTags("install", data)

        if as_array and isinstance(data, dict):
            data = [data]

        return data

    def writeJsonFile(self, data, file_name, encoding=None):
        """
        Write DATA to FILE_NAME as JSON
        """

        # Set output options
        indent = 3

        # Write data
        with open(file_name, "w", encoding=encoding) as strm:
            json.dump(
                data, strm, indent=indent, cls=MywJsonEncoder, ensure_ascii=(encoding != "utf-8")
            )

    def fileNameFor(self, output_dir, obj_name, obj_type):
        """
        Construct name of file to store OBJ_NAME in
        """

        reps = r"[\s.,\:/]+"
        excludes = r"[\<\>\:\'\/\\|\?\*\(\)\{\}\&\^\%\!\`\+\~\#\[\]\@\"" "]"

        base_name = obj_name.lower()
        base_name = re.sub(reps, "_", base_name)
        base_name = re.sub(excludes, "", base_name)

        return os.path.join(output_dir, base_name + obj_type)

    def featureIStreamFor(
        self, filepath, key_name, primary_geom_name, file_encoding=None, geom_heuristics=False
    ):
        """
        Returns feature input stream for reading file FILEPATH

        Determines stream type based on file extension"""

        return MywFeatureIStream.streamFor(
            filepath,
            key_name,
            primary_geom_name,
            encoding=file_encoding,
            geom_heuristics=geom_heuristics,
            progress=self.progress,
        )

    def featureOStreamFor(self, filepath, field_names, file_encoding=None, file_options={}):
        """
        Returns feature output stream for writing file FILEPATH
        """
        # ENH: Move to base

        # Convert time formats to internal form
        # ENH: Move down into streams?
        file_options = file_options.copy()

        if "date_format" in file_options:
            file_options["date_format"] = self.python_datetime_format_for(
                file_options["date_format"]
            )

        if "timestamp_format" in file_options:
            file_options["timestamp_format"] = self.python_datetime_format_for(
                file_options["timestamp_format"]
            )

        # Build stream (type based on file extension)
        return MywFeatureOStream.streamFor(
            filepath, field_names, encoding=file_encoding, **file_options
        )

    def warning(self, *msg):
        """
        Display a warning message
        """

        self.progress("warning", *msg)
