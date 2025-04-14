################################################################################
# Engine for creating a spatial extract
################################################################################
# Copyright: IQGeo Limited 2010-2023

import base64, json
from collections import OrderedDict
from datetime import datetime
from decimal import Decimal

from geoalchemy2 import Geometry
from sqlalchemy import JSON


from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.tilestore.myw_tile_db import MywTileDB
from myworldapp.core.server.base.db.myw_sqlite_db_server import MywSqliteDbServer
from myworldapp.core.server.database.myw_raw_database import MywRawDatabase


class MywExtractEngine:
    """
    Engine for creating an extract of a myWorld database to sqlite
    """

    def __init__(self, master_db, progress=MywProgressHandler(), encryption_key=None):
        """
        Init slots of self
        """

        self.master_db = master_db
        self.progress = progress
        self.encryption_key = encryption_key

    # ==============================================================================
    #                                 EXTRACTION
    # ==============================================================================

    def extract(self, extract_db_name, extract_dir, extract_filter):
        """
        Create a SQLite extract

        EXTRACT_FILTER is a MywExtractFilter controlling what gets extracted.

        Returns:
         EXTRACT_DB          A MywRawDatabase
         TILE_FILE_MAPPINGS  Paths to generated tile files"""

        # Build tile file mappings and check files can be created (here, to get errors early)
        tile_file_mappings = extract_filter.tileFileMappings(self.master_db, extract_dir)

        # Extract database
        extract_db = self.extractDatabase(extract_db_name, extract_filter)

        # Extract tile files
        self.extractTileFiles(extract_dir, tile_file_mappings, extract_filter)

        return extract_db, tile_file_mappings

    def extractDatabase(self, extract_db_name, extract_filter):
        """
        Create a SQLite extract database

        EXTRACT_FILTER is a MywExtractFilter controlling what get extracted

        Returns extract_db, extract_tile_specs"""

        # ENH: Just take name of directory, add code package, ...
        extract_db_server = MywSqliteDbServer(
            progress=self.progress, encryption_key=self.encryption_key
        )

        # Create database
        with self.progress.operation("Creating database", extract_db_name, "..."):

            # Initialise + create SQLite specific tables
            self.progress(1, "Initialising database")
            extract_db_server.create(extract_db_name)
            extract_db_session = extract_db_server.openSecondarySession(extract_db_name)
            extract_db = MywRawDatabase(extract_db_session, progress=self.progress)
            extract_db.db_driver.encryption_key = self.encryption_key

            master_db_driver = self.master_db.db_driver
            extract_db_driver = extract_db.db_driver

            # Create system tables
            self.createSystemTables(master_db_driver, extract_db_driver)
            self.copySystemRecords(master_db_driver, extract_db_driver)

            # Copy master feature tables
            self.createFeatureTables(master_db_driver, extract_db_driver, "data")
            self.copyFeatureRecords(master_db_driver, extract_db_driver, "data", extract_filter)
            self.buildIndexRecords(master_db_driver, extract_db_driver, "data")
            self.addFeatureTriggers(master_db_driver, extract_db_driver, "data")

            # Copy delta tables
            self.createFeatureTables(master_db_driver, extract_db_driver, "delta")
            if extract_filter.include_deltas:
                self.copyFeatureRecords(
                    master_db_driver, extract_db_driver, "delta", extract_filter
                )  # Optional deltas extract
            self.buildIndexRecords(master_db_driver, extract_db_driver, "delta")
            self.addFeatureTriggers(master_db_driver, extract_db_driver, "delta")

            # Copy base tables (which don't have index records or triggers)
            self.createFeatureTables(master_db_driver, extract_db_driver, "base")
            if extract_filter.include_deltas:
                self.copyFeatureRecords(
                    master_db_driver, extract_db_driver, "base", extract_filter
                )  # Optional deltas extract
            self.addFeatureTriggers(master_db_driver, extract_db_driver, "base")

            # Zap passwords
            with self.progress.operation("Pruning data"):
                sql = "update {} set password=''".format(extract_db_driver.dbNameFor("myw", "user"))
                extract_db_driver.execute(sql)

            # Ensure all changes are written to database
            extract_db_driver.session.commit()

            # Create tables for storing local copy of external feature data
            self.createExternalFeatureTables(master_db_driver, extract_db_driver, extract_filter)
            self.copyExternalFeatureRecords(master_db_driver, extract_db_driver, extract_filter)

        return extract_db

    def createSystemTables(self, master_db_driver, extract_db_driver):
        """
        Create system table data model
        """

        with self.progress.operation("Creating system tables") as op_stats:

            for table in self.systemTableNames():
                self.progress(1, "Creating table", table)

                table_desc = master_db_driver.tableDescriptorFor("myw", table)
                table_desc = self._fixupTableDescriptor(table_desc)
                extract_db_driver.createTable(table_desc)

                op_stats["tables"] = op_stats.get("tables", 0) + 1

    def copySystemRecords(self, master_db_driver, extract_db_driver):
        """
        Copy system records to extract
        """
        # ENH: get rid of master_db_driver args everywhere? Or pass in master_db

        excludes = [
            "user",  # These are not of interest to NativeApp
            "user_role",
            "replica",
            "replica_shard",
            "notification",
            "checkpoint",  # These are database specific
            "transaction_log",
            "delta_transaction_log",
            "base_transaction_log",
            "configuration_log",
            "usage",
            "usage_item",
            "geo_world_point",  # These get populated by buildIndexes() later
            "geo_world_linestring",
            "geo_world_polygon",
            "int_world_point",
            "int_world_linestring",
            "int_world_polygon",
            "search_string",
            "delta_geo_world_point",
            "delta_geo_world_linestring",
            "delta_geo_world_polygon",
            "delta_int_world_point",
            "delta_int_world_linestring",
            "delta_int_world_polygon",
            "delta_search_string",
            "extract_key",  # Don't include list of extract encryption keys, for obvious reasons
        ]

        with self.progress.operation("Copying system data"):

            for table in self.systemTableNames(excludes):
                self.copyRecords(master_db_driver, extract_db_driver, "myw", table)

    def createFeatureTables(self, master_db_driver, extract_db_driver, feature_schema):
        """
        Create feature data model for FEATURE_SCHEMA ('data', 'delta' or 'base')

        Note: We have to create all feature types here (not just those in table set)"""

        with self.progress.operation("Creating feature", feature_schema, "tables") as op_stats:

            # For each feature type .. create its table
            for table in self.master_db.dd.featureTypes(
                "myworld", versioned_only=(feature_schema != "data"), sort=True
            ):
                self.progress(1, "Creating table", table)

                table_desc = master_db_driver.tableDescriptorFor(feature_schema, table)
                table_desc = self._fixupTableDescriptor(table_desc)
                extract_db_driver.createTable(table_desc)

                op_stats["tables"] = op_stats.get("tables", 0) + 1

    def copyFeatureRecords(
        self, master_db_driver, extract_db_driver, feature_schema, extract_filter
    ):
        """
        Copy feature records from MASTER_DB to EXTRACT_DB

        EXTRACT_FILTER is a MywExtractFilter controlling what get copied"""

        with self.progress.operation("Copying feature data for schema:", feature_schema):

            for feature_type in extract_filter.myworldFeatureTypes(
                self.master_db, versioned_only=(feature_schema != "data")
            ):

                pred = extract_filter.regionPredicateFor(self.master_db, feature_type)

                self.copyRecords(
                    master_db_driver, extract_db_driver, feature_schema, feature_type, pred
                )

    def buildIndexRecords(self, master_db_driver, extract_db_driver, feature_schema):
        """
        Bulk create the myWorld index records

        Faster than running insert triggers"""

        # ENH: Find a way to report number of index records created

        with self.progress.operation("Building indexes for schema:", feature_schema):

            for table in self.master_db.dd.featureTypes(
                "myworld", versioned_only=(feature_schema != "data"), sort=True
            ):
                dd_feature_rec = self.master_db.dd.featureTypeRec(
                    "myworld", table
                )  # ENH: Nicer to use extract record .. but no DD

                self.progress(1, "Building geom indexes for", table)
                extract_db_driver.rebuildGeomIndexesFor(feature_schema, dd_feature_rec)
                extract_db_driver.session.commit()  # Workaround for Fogbugz 6626

                self.progress(1, "Building search indexes for", table)
                for search_rule_rec in dd_feature_rec.search_rule_recs:
                    extract_db_driver.rebuildSearchStringsFor(
                        feature_schema, dd_feature_rec, search_rule_rec
                    )

                extract_db_driver.session.commit()  # Workaround for Fogbugz 6626

    def addFeatureTriggers(self, master_db_driver, extract_db_driver, feature_schema):
        """
        Add feature table triggers for FEATURE_SCHEMA ('data' or 'delta')
        """

        with self.progress.operation("Adding", feature_schema, "triggers"):

            for table in self.master_db.dd.featureTypes(
                "myworld", versioned_only=(feature_schema != "data"), sort=True
            ):
                self.progress(1, "Adding triggers to table", table)

                dd_feature_rec = self.master_db.dd.featureTypeRec(
                    "myworld", table
                )  # ENH: Nicer to use extract record .. but no DD

                for trigger_type in ["insert", "update", "delete"]:
                    sql = extract_db_driver.featureTriggerSqls(
                        feature_schema, dd_feature_rec, trigger_type
                    )
                    extract_db_driver.execute(sql)

    def _fixupTableDescriptor(self, table_desc):
        """
        Fixes up a reflected table descriptor to permit creation of SQLite tables
        """
        # ENH: Fix Postgres reflection and get rid of this method

        for column_desc in list(table_desc.columns.values()):

            # Deal with poorly reflected types
            if column_desc.type == "geometry":
                column_desc.type = "point"

            if column_desc.type == "timestamp_tz":
                column_desc.type = "timestamp"

            # Convert defaults to correct type
            if column_desc.default == "":
                column_desc.default = None

            elif column_desc.default == "now()":
                column_desc.generator = "system_now"
                column_desc.default = None

            elif (
                column_desc.default
                and "now()" in column_desc.default
                and "'utc'" in column_desc.default
            ):
                column_desc.generator = "now_utc"
                column_desc.default = None

            elif isinstance(column_desc.default, str):  # Remove type qualifier
                value = column_desc.default
                parts = value.split("::")
                if len(parts) > 1:
                    (value, type) = parts

                    if value.startswith("'"):
                        value = value[1:-1]

                if column_desc.type == "timestamp":
                    value = value.replace(" ", "T")

                column_desc.default = column_desc.type_desc.convert(value)

        return table_desc

    def copyRecords(self, master_db_driver, extract_db_driver, schema, table_name, pred=None):
        """
        Bulk copy records from MASTER_DB_NAME to EXTRACT_DB_NAME

        Optional PRED is a MywDbPredicate limiting which records
        get extracted (for spatial extraction). Records must not already
        exist in EXTRACT_DB_NAME.

        Returns number of records copied"""

        # ENH: Duplicated with myw_record_mixin
        timestamp_format = "%Y-%m-%dT%H:%M:%S.%f"

        chunk_size = 10000  # records

        # ENH: No longer required (index records no longer copied)?
        system_tables_with_geom = [
            "geo_world_point",  # Move down into driver.rawModel
            "geo_world_linestring",
            "geo_world_polygon",
            "int_world_point",
            "int_world_linestring",
            "int_world_polygon",
            "delta_geo_world_point",
            "delta_geo_world_linestring",
            "delta_geo_world_polygon",
            "delta_int_world_point",
            "delta_int_world_linestring",
            "delta_int_world_polygon",
        ]

        self.progress("starting", "Copying table {}.{}".format(schema, table_name))

        # Get record exemplars
        if schema == "myw":
            if table_name in system_tables_with_geom:
                geom_columns = ["the_geom"]
            else:
                geom_columns = []
            master_model = master_db_driver.rawModelFor(
                schema, table_name, geom_columns=geom_columns
            )
        else:
            master_model = self.master_db.dd.featureModel(table_name, schema)
            geom_columns = master_model.geometry_column_names()

        # Build master query
        if geom_columns:
            from sqlalchemy import func

            # We need to ensure that no extensions are present in the WKB geoms. PostGIS allows 3D
            # geoms to be stored, and will include the SRID sometimes. The AsBinary will output WKB
            # with no SRID, and Force2D will remove any Z or M coords on the geom.
            cols = [
                func.ST_AsBinary(func.ST_Force2D(col)).label(col.name)
                if col.name in geom_columns
                else col
                for col in master_model.__table__.columns
            ]
            recs_query = master_db_driver.session.query(*cols)
        else:
            recs_query = master_db_driver.session.query(master_model)

        if not (pred is None):
            recs_query = recs_query.filter(pred.sqaFilter(master_model.__table__))

        # Prevent memory exhaustion on very large tables
        if schema == "data":
            recs_query = master_db_driver.optimizeLargeQuery(recs_query)

        # Build insert statement
        (insert_sql, iCols) = self.insertSQLFor(extract_db_driver, schema, table_name, geom_columns)

        # For each record in master ..
        n_recs = 0
        recs = []
        for master_rec in recs_query:

            # For each field in record ...
            rec = {}
            for col in master_model.__table__.columns:
                value = getattr(master_rec, col.name)

                # Convert to suitable bind value (if necessary)
                if isinstance(col.type, Geometry):
                    try:
                        value = memoryview(bytes(value))
                    except:
                        value = memoryview(bytes(0))

                elif isinstance(value, Decimal):
                    value = float(value)

                elif isinstance(value, datetime):
                    value = value.isoformat(
                        "T", "milliseconds"
                    )  # Native App treats datetimes as strings in SQLite

                elif isinstance(col.type, JSON):
                    if value is not None:
                        value = json.dumps(value)

                # Add it to record
                rec[col.name] = value

            # Add it to the insert list
            # ENH: Chunk up inserts to avoid excessive memory use
            recs.append(rec)
            n_recs += 1

            # Avoid memory overflow on large tables
            if len(recs) > chunk_size:
                self.insertRecords(extract_db_driver, insert_sql, recs)
                recs = []

        # Insert remaining records
        if recs:
            self.insertRecords(extract_db_driver, insert_sql, recs)

        # Tidy up (if we can)
        self.progress("finished", "Records copied:", n_recs, records=n_recs)

    def insertSQLFor(self, extract_db_driver, schema, table_name, geom_columns):
        """
        Build SQL template for bulk insertion of records into SCHEMA.TABLE_NAME
        """

        # Get table definition
        extract_model = extract_db_driver.rawModelFor(schema, table_name, geom_columns=geom_columns)

        # Build list of fields and associated SQL value
        quoted_col_names = OrderedDict()
        placeholders = OrderedDict()

        for col in extract_model.__table__.columns:
            quoted_col_names[col.name] = '"{}"'.format(col.name)
            if isinstance(col.type, Geometry):
                placeholders[col.name] = "ST_GeomFromWKB(:{},{})".format(col.name, col.type.srid)
            else:
                placeholders[col.name] = ":{}".format(col.name)

        # Build statement
        sql = 'INSERT INTO "{}" ({}) VALUES ({})'.format(
            extract_model.__table__.name,
            ",".join(list(quoted_col_names.values())),
            ",".join(list(placeholders.values())),
        )

        return (sql, [x.name for x in extract_model.__table__.columns])

    def insertRecords(self, extract_db_driver, insert_sql, recs):
        """
        Insert records RECS into extract database (and commit)

        RECS is a list of dicts."""
        if recs:
            self.progress(5, "Inserting", len(recs), "records")

            extract_db_driver.session.execute(insert_sql, recs)
            extract_db_driver.session.flush()
            extract_db_driver.session.commit()

    def systemTableNames(self, excludes=[]):
        """
        Yields myWorld names of master's system tables (in order)
        """

        table_names = self.master_db.db_driver.tableNamesIn("myw")

        for table_name in sorted(table_names):

            if not table_name in excludes:
                yield table_name

    # ==============================================================================
    #                              EXTERNAL FEATURE EXTRACTION
    # ==============================================================================

    def createExternalFeatureTables(self, master_db_driver, extract_db_driver, extract_filter):
        """
        Create local tables for external features
        """

        # TODO: EXTDD: Change so this can be imported at top
        from myworldapp.core.server.database.myw_database import MywDatabase

        with self.progress.operation("Creating external feature tables") as op_stats:

            master_db = MywDatabase(master_db_driver.session)

            for ds_rec, ds_engine, feature_rec in extract_filter.externalFeatureTypes(
                master_db, all_modes=True
            ):
                self.progress(1, "Adding local table for", feature_rec)

                # Create DD entry
                (local_feature_rec, local_feature_desc) = self.createLocalFeatureTypeFor(
                    ds_rec, feature_rec, master_db.dd, extract_db_driver
                )

                # Create local table
                extract_db_driver.createTable(local_feature_desc.tableDescriptor())

                # Add triggers
                # ENH: Faster to add data first .. as per myWorld tables?
                for trigger_type in ["insert", "update", "delete"]:
                    sql = extract_db_driver.featureTriggerSqls(
                        "data", local_feature_rec, trigger_type
                    )
                    extract_db_driver.execute(sql)

                op_stats["tables"] = op_stats.get("tables", 0) + 1

    def createLocalFeatureTypeFor(self, ds_rec, feature_rec, master_dd, extract_db_driver):
        """
        Create a myWorld feature definition matching external feature type FEATURE_REC

        Returns:
          local_feature_rec
          local_feature_desc"""

        # ENH: Duplicates code in MywDD

        # Check for no key field (prevents download via on-demand)
        if not feature_rec.key_name:
            self.progress("warning", "Feature type has no key field:", feature_rec)

        # Build definition for local table
        local_feature_desc = master_dd.localFeatureTypeDescriptorFor(feature_rec)

        # Build models
        MywDDFeature = extract_db_driver.rawModelFor("myw", "dd_feature")
        MywDDField = extract_db_driver.rawModelFor("myw", "dd_field")
        MywSearchRule = extract_db_driver.rawModelFor("myw", "search_rule")

        # Create feature record
        local_feature_rec = self._buildRecord(
            MywDDFeature,
            feature_rec,
            id=None,
            feature_name=local_feature_desc.name,
            datasource_name=local_feature_desc.datasource,
            key_name=local_feature_desc.key_field_name,
        )

        extract_db_driver.session.add(local_feature_rec)
        extract_db_driver.session.flush()

        # Create field records
        # ENH: EXTDD: Massive duplication with MywDD - move to descriptor
        for field_name, field_desc in list(local_feature_desc.fields.items()):

            rec = MywDDField(
                datasource_name=local_feature_rec.datasource_name,
                table_name=local_feature_rec.feature_name,
                internal_name=field_desc.name,
                external_name=field_desc.external_name,
                type=field_desc.type,
                value=field_desc.value,
                enum=field_desc.enum,
                unit=field_desc.unit,
                min_value=field_desc.min_value,
                max_value=field_desc.max_value,
                generator=field_desc.generator,
                default=field_desc.defaultAsString(),
                mandatory=field_desc.mandatory,
                indexed=field_desc.indexed,
            )

            extract_db_driver.session.add(rec)

        # Create search rule records
        for rec in feature_rec.search_rule_recs:

            props = {}
            for col in rec.__table__.columns:
                if col.name != "id":
                    props[col.name] = rec[col.name]
            props["feature_name"] = local_feature_desc.name

            local_rec = self._buildRecord(
                MywSearchRule,
                rec,
                datasource_name=local_feature_rec.datasource_name,
                feature_name=local_feature_rec.feature_name,
                id=None,
            )

            extract_db_driver.session.add(local_rec)

        return local_feature_rec, local_feature_desc

    def _buildRecord(self, model, rec, **props):
        """
        Clone record REC, setting PROPS

        Returns an instance of MODEL init from REC"""
        # ENH: Find an easier way ... or move this to model base

        for col in rec.__table__.columns:
            if not col.name in props:
                props[col.name] = rec[col.name]

        return model(**props)

    def copyExternalFeatureRecords(self, master_db_driver, extract_db_driver, extract_filter):
        """
        Add records for pre-extracted external feature types
        """

        # ENH: EXTDD: Change so this can be imported at top
        from myworldapp.core.server.database.myw_database import MywDatabase

        with self.progress.operation("Adding external feature data"):

            MywDDFeature = extract_db_driver.rawModelFor("myw", "dd_feature")
            master_db = MywDatabase(master_db_driver.session)
            bounds = extract_filter.regionBounds()

            # For each pre-extracted external feature (except rasters) ..
            for ds_rec, ds_engine, feature_rec in extract_filter.externalFeatureTypes(master_db):
                self.progress("starting", "Adding records for", feature_rec)

                # Get local feature record
                local_name = feature_rec.local_table_name()
                local_feature_rec = (
                    extract_db_driver.session.query(MywDDFeature)
                    .filter(
                        (MywDDFeature.datasource_name == "myworld")
                        & (MywDDFeature.feature_name == local_name)
                    )
                    .first()
                )

                # Download and insert records
                n_recs = self.copyExternalFeatureRecordsFor(
                    ds_rec, ds_engine, feature_rec, local_feature_rec, bounds, extract_db_driver
                )

                self.progress("finished", "Records copied:", n_recs, records=n_recs)

    def copyExternalFeatureRecordsFor(
        self, ds_rec, ds_engine, feature_rec, local_feature_rec, bounds, extract_db_driver
    ):
        """
        Get records from external datasource and insert them into the extract
        """

        primary_geom = local_feature_rec.primary_geom_name
        geom_columns = [primary_geom]

        # Build insert statement
        (insert_sql, iCols) = self.insertSQLFor(
            extract_db_driver, "data", local_feature_rec.feature_name, geom_columns
        )

        # Add data
        n_recs = 0
        # ENH: Should be able to pass geom_format='wkt' and eliminate conversion from wkb to wkt
        for recs in ds_engine.get_feature_data(feature_rec.feature_name, bounds):
            for rec in recs:
                missing = set(iCols) - set(rec.keys())
                for col in missing:
                    rec[col] = None
                rec["myw_geometry_world_name"] = "geo"

                if rec[primary_geom]:
                    rec[primary_geom] = memoryview(base64.b16decode(rec[primary_geom]))

            self.insertRecords(extract_db_driver, insert_sql, recs)

            n_recs += len(recs)

        return n_recs

    # ==============================================================================
    #                              TILE FILE EXTRACTION
    # ==============================================================================

    def extractTileFiles(self, out_dir, tile_file_mappings, extract_filter):
        """
        Extract tile files to OUT_DIR

        TILE_FILES_MAPPINGS is a list of files to generate, keyed by input file"""

        # Copy tile files
        with self.progress.operation("Copying tile data ..."):

            for master_file, extract_file in list(tile_file_mappings.items()):
                self.extractTileFileTo(master_file, extract_file, extract_filter)

    def extractTileFileTo(self, tile_file, out_file, extract_filter):
        """
        Copy tiles in TILE_DIR to a new file in OUT_DIR

        EXTRACT_FILTER controls the region extracted, clipping, etc

        Returns full path to file created"""

        self.progress("starting", "Creating tilestore file", out_file, "...")

        # Get extraction options
        options = extract_filter.tileFileOptions(tile_file)
        bounds = extract_filter.regionBounds()

        # Say what we are about to do
        for key, value in list(options.items()):
            self.progress(1, "Options:", key, "=", value)

        # Open files
        # ENH: If full extract, faster to just do an os file copy
        tile_db = MywTileDB(tile_file, "r", progress=self.progress)
        out_tile_db = MywTileDB(out_file, "w", progress=self.progress)

        # Build optional args for loadFromDB()
        args = {}
        if options["by_layer"]:
            args["use_index"] = True
            args["layer"] = tile_db.layer()  # only used if tilstore version < 5

        # Copy the tiles
        n_tiles = out_tile_db.loadFromDB(
            tile_db,
            bounds=bounds,
            clip=options["clip"],
            min_zoom=options["min_zoom"],
            max_zoom=options["max_zoom"],
            **args,
        )

        # Tidy up
        out_tile_db.close()
        self.progress("finished", tiles=n_tiles)
        tile_db.close()

        return out_file
