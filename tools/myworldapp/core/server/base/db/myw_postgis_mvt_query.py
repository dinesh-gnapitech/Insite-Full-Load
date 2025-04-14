################################################################################
# Database Helper for generating MVT tiles directly in PostGIS SQL.
################################################################################
# Copyright: IQGeo Limited 2010-2023

from sqlalchemy.dialects import postgresql

from myworldapp.core.server.controllers.base.myw_utils import sqlaFilterOf
from myworldapp.core.server.dd.myw_versioned_feature_table import MywVersionedFeatureTable


def _type_name_as_identifier(type_name: str):
    """Some SQL type names are not valid identifiers, e.g. string(100).
    Converts the type name into something which is still unique, but valid as a name."""

    # string(100, 200) -> string_100_200
    replacements = {
        "(": "_",
        ",": "_",
        " ": "",
        ")": "",
    }

    for substr, replace_with in replacements.items():
        type_name = type_name.replace(substr, replace_with)
    return type_name


class MywNoFeaturesError(Exception):
    pass


class CombinedFilter:
    """Metadata to hold all the various filters which apply to a feature/geom_field combination."""

    def __init__(self, table, geom_field_name, layer_filters, world):
        self.table = table
        self.feature_type = table.model.__table__.name
        self.geom_field_name = geom_field_name
        # Standardise the str | tuple<str> type now:
        if isinstance(layer_filters, str):
            layer_filters = (layer_filters,)
        elif layer_filters is None:
            layer_filters = tuple()
        self.layer_filters = layer_filters

        # Determine if there is a valid world filter, because we may simply skip processing this
        # geom.
        world_field_name = table.model._geom_field_info[geom_field_name]
        if world_field_name is None and world != "geo":
            raise MywNoFeaturesError()

        self.world_field_name = world_field_name
        self.world = world

    def __bool__(self):
        """Coerce to bool to check if there are any filters to process."""
        # If world_field_name is none, then there is no actual filter for world to apply, we either
        # raise an exception in the constructor or take everything.
        return bool(self.world_field_name is not None or self.layer_filters)

    def _world_filter_sql(self, delta=False):
        if self.world_field_name is None:
            return ""

        model = self.table.delta_model if delta else self.table.model

        world_column = getattr(model, self.world_field_name)
        world_filter = world_column == self.world
        return world_filter.compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        ).string

    def delta_table_filter_sql(self, current_user, session_vars):
        """The filters on both the delta and data tables are different if we're querying inside a
        delta - this method computes the delta filter in total, and the extra component of the data
        filter, and returns both values."""
        table_sql_name = f"{self.table.model.__table__.schema}.{self.feature_type}"
        delta_table_sql_name = f"{self.table.delta_model.__table__.schema}.{self.feature_type}"

        # Delta names are user-input, and are not used in table names or similar, so not
        # guaranteed to be SQL-identifier safe.
        which_delta_filter = (
            (self.table.delta_model.myw_delta == self.table.delta)
            .compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
            .string
        )

        # Add a new filter for the data query, excluding any row with a corresponding one
        # in delta. (Any of INSERT, UPDATE or DELETE should be ignored in data.*)
        # We need to match the tables on the primary key, (modulo the design ID in the delta)
        key_field = self.table.descriptor.key_field_name
        extra_data_filter_clause = f""" AND NOT EXISTS (
            SELECT FROM {delta_table_sql_name}
            WHERE ({delta_table_sql_name}.{key_field} = {table_sql_name}.{key_field}) AND ({which_delta_filter})
        )"""

        # Build the filter and query we'll need for the delta table:
        # Always filter out the deleted entries:
        delta_filter_clause = (
            f" AND ({delta_table_sql_name}.myw_change_type <> 'delete') AND ({which_delta_filter})"
        )
        if self:
            # If there's a layer filter, apply it to the delta table just like the data:
            delta_filter_clause += (
                f" AND ({self.feature_table_filter_sql(current_user, session_vars, delta=True)})"
            )

        return (delta_filter_clause, extra_data_filter_clause)

    def feature_table_filter_sql(self, current_user, session_vars, delta=False):
        """Generate the filter SQL expression from layer and world filters."""
        filter_sqls = []

        raw_table = self.table.model.__table__
        if delta:
            raw_table = self.table.delta_model.__table__

        for fltr in self.layer_filters:
            # Use the SQLA utilities to generate the filter expression:
            sqla_filter = sqlaFilterOf(
                self.feature_type,
                fltr,
                current_user,
                raw_table,
                session_vars,
            )

            # And then compile it down into a literal SQL string:
            filter_sqls.append(
                sqla_filter.compile(
                    dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
                ).string
            )

        combined_layer_filter_sqls = " OR ".join(filter_sqls)
        world_filter_sql = self._world_filter_sql(delta)

        # We only need the AND if both clauses are non-empty.
        if combined_layer_filter_sqls and world_filter_sql:
            return f"({world_filter_sql}) AND ({combined_layer_filter_sqls})"
        return world_filter_sql + combined_layer_filter_sqls


class MywPostGISMVTQuery:
    """Class to generate a single PostGIS SQL query to generate MVT format tiles directly in the db
    engine from multiple feature tables.

    Usage:
    query = MywPostGISMVTQuery(db_driver, current_user, session_vars, (z, y, zoom), world)
    query.add_geometry(db_table, geom_field_name, [additional_field, additional_field], filter)
    ... add more geometries from the same or different feature tables.
    sql = query.generate_sql()
    result_proxy = self.db.executeSQL(sql)
    # rescue the buffer out of sqla, and convert it to a python bytes obj.
    memory = result_proxy.fetchall()[0][0]
    response = memory.tobytes()

    Note on SQL Injection:
    This class generates SQL by hand, rather than using SQLAlchemy like much of our other code.
    So, we need to be careful of SQL injection for parameters which come from the request. The
    typical params read from the request are only layer name, and (x y zoom), world, and additional
    fields to read from the table. Layer name is handled in the controller and not rendered in SQL
    here, x y zoom are handled in the constructor, and the additional fields are processed in
    add_geometry (they are ignored, rather than throwing an error, because of internal fields which
    may not exist. ENH: process them separately and throw errors.) World uses a sqlalchemy compile.
    """

    # TILE_EXTENT (the number of integer coords inside the tile.)
    # 16x the 512 usual size of a tile, so should handle tile "oversampling" without losing visible
    # precision. Shouldn't be higher so it can handle geometry that will have points outside the
    # tile.
    TILE_EXTENT = 8192

    MARGIN = 0
    GEOMETRY_TYPES = {"point", "linestring", "polygon"}
    FEATURE_TYPE_META_KEY = ("feature_type", None)
    GEOM_FIELD_NAME_META_KEY = ("geom_field", None)

    def __init__(self, db_driver, current_user, session_vars, tile_coords, world):
        """Read in arguments, and initialise the collections which are built up as geometries are
        added."""
        self.db_driver = db_driver
        self.current_user = current_user
        self.session_vars = session_vars
        # World goes through a SQLA filter compile, so is escaped appropriately already.
        self.world = world
        x, y, zoom = tile_coords

        # From request. Throws a ValueError if it's not a valid int.
        self.x = int(x)
        self.y = int(y)
        self.zoom = int(zoom)

        # Collections to accumulate feature tables, geometry columns, and their metadata.

        self.type_geom_combinations_with_filter = []
        self.field_keys_by_feature = {}
        self.unique_field_keys = set()

        # db object caches.
        self.tables = {}
        self.column_descriptions = {}

    def add_geometries(self, geoms):
        """Convenience method to make adding several geoms at once simpler."""
        for geom in geoms:
            self.add_geometry(*geom)

    def add_geometry(self, table, geom_field_name, additional_fields, layer_filter):
        """Add a geometry field on a feature table to a query. Note: table should be a
        MywFeatureTable, e.g. self.db_view.table(feature_type)."""

        try:
            combined_filter_object = CombinedFilter(
                table, geom_field_name, layer_filter, self.world
            )
        except MywNoFeaturesError:
            # This world/geom_field combination cannot yield feature instances.
            return

        feature_type = table.model.__table__.name
        self.tables[feature_type] = table

        self.type_geom_combinations_with_filter.append(
            (feature_type, geom_field_name, combined_filter_object)
        )

        key_field = table.descriptor.key_field_name
        if key_field not in additional_fields:
            additional_fields = tuple(additional_fields) + (key_field,)

        feature_field_keys = []

        for field_name in additional_fields:
            try:
                field_descriptor = table.descriptor.fields[field_name]
                field_type = table.descriptor.fields[field_name].type

                # Skip both geometries and calcualted fields.
                if field_type in self.GEOMETRY_TYPES:
                    continue

                if not field_descriptor.isStored():
                    continue

                # A field key (used throughout the implementation) is (column_name, column_type),
                # both strings. These are immutable, hashable, and sortable.
                field_key = (field_name, field_type)
                self.column_descriptions[field_key] = table.descriptor.fields[field_name].type_desc
                feature_field_keys.append(field_key)
            except KeyError:
                # The additional_fields entries for myw_ meta fields may not actually exist, and
                # that's fine, we just skip them.
                # Note: some of these values may have come in through the requiredFields request
                # param, so we are also filtering out any invalid ones there. SQL injection field
                # names will be filtered out here on this basis.
                pass

        self.field_keys_by_feature[feature_type] = feature_field_keys

        # Fields are uniquely-enough identified by (name, type) for our purposes - where two
        # feature types share a field name, if they have the same type, they can be selected
        # together and have the correct name. Otherwise, if we have a name repeat with a
        # different type.
        self.unique_field_keys = self.unique_field_keys.union(set(feature_field_keys))

    def generate_sql(self):
        """Creates and returns the SQL-literal query to generate an MVT of the feature types added
        with add_geometries."""
        if not self.type_geom_combinations_with_filter:
            raise MywNoFeaturesError()

        wide_table_fields = self._get_wide_table_columns()

        ordered_wide_table_fields = sorted(wide_table_fields.keys())

        table_sqls = self._get_table_sqls(wide_table_fields, ordered_wide_table_fields)

        # NOTE: ST_AsMVT's 5th param is feature_id_name, but it can't be our pkey because they can
        # be strings (and MVT requires an int.)
        # The tile will include the pkey of each feature type.

        geometries_table_fields = ", ".join(wide_table_fields[k] for k in ordered_wide_table_fields)

        feature_table_selects = "(" + (" ) UNION ( ".join(table_sqls)) + ")"

        sql = f"""
        WITH webmercator(envelope, expanded_envelope) AS (
                SELECT ST_TileEnvelope({self.zoom}, {self.x}, {self.y}),
                ST_TileEnvelope({self.zoom}, {self.x}, {self.y}, margin => {self.MARGIN})
            ),
            wgs84(expanded_envelope) AS (
                SELECT ST_Transform((SELECT expanded_envelope FROM webmercator), 4326)
            ),
            geometries(wkb_geometry, {geometries_table_fields}) AS (
                {feature_table_selects}
            )
        SELECT ST_AsMVT(tile.*, 'layer', {self.TILE_EXTENT}, 'tilegeom') as mvt FROM (
            SELECT  ST_AsMVTGeom(
                wkb_geometry,
                (SELECT envelope FROM webmercator),
                {self.TILE_EXTENT},
                clip_geom => false) AS tilegeom, {geometries_table_fields}
            FROM geometries
        ) AS tile
        """

        return sql

    def _get_wide_table_columns(self):
        """In order for this Query to work, we must have all the individual queries to feature
        tables have the same column set. I call this column set a "wide table" throughout this
        class.

        We need a different column for the feature1.foo and feature2.foo if they are different
        types, but if they're the same we can re-use the column in the wide table.

        If we need two different columns, we have to generate them names which are unique. We do
        this using a utility function which converts the type into an identifier-compatible string
        (_type_name_as_identifier)

        Returns dict of field_key => identifier_name, with each entry meaning a new column in the
        wide table."""
        field_name_to_set_of_types = {}
        self.unique_field_keys.add(self.FEATURE_TYPE_META_KEY)
        self.unique_field_keys.add(self.GEOM_FIELD_NAME_META_KEY)

        # Group different types by field name.
        for field_name, field_type in self.unique_field_keys:
            try:
                field_name_to_set_of_types[field_name].add(field_type)
            except KeyError:
                field_name_to_set_of_types[field_name] = {field_type}

        wide_table_fields = {}
        for field_name, field_types in field_name_to_set_of_types.items():
            if len(field_types) == 1:
                # Where possible, we just use the actual field name in the MVT.
                wide_table_fields[(field_name, list(field_types)[0])] = field_name
            else:
                # Otherwise, we need to generate a unique field name for each one.
                for field_type in field_types:
                    wide_table_fields[(field_name, field_type)] = (
                        f"{field_name}_{_type_name_as_identifier(field_type)}"
                        if field_type is not None
                        else field_name
                    )

        # We will manually add this to each select query as a constant, so that it appears in the
        # MVT correctly.
        wide_table_fields[self.FEATURE_TYPE_META_KEY] = "feature_type"
        wide_table_fields[self.GEOM_FIELD_NAME_META_KEY] = "geom_field"

        return wide_table_fields

    def _get_table_sqls(self, wide_table_fields, ordered_fields):
        """Here we do the business of actually generating the select statement from each feature
        table, using all the columns in the wide table. For those that aren't actually present in
        the feature table, we must insert typed-NULL literals (!!)."""
        table_sqls = []

        combined_filter: CombinedFilter

        for feature_type, geom_field, combined_filter in self.type_geom_combinations_with_filter:
            table = self.tables[feature_type]
            # fully qualified table name:
            table_sql_name = f"{table.model.__table__.schema}.{feature_type}"

            sql_fields = {}
            for field_key, global_name in wide_table_fields.items():
                field_name, field_type = field_key
                if field_key in self.field_keys_by_feature[feature_type]:
                    sql_fields[field_key] = f"{field_name} AS {global_name}"
                elif field_type is not None:
                    # Use a NULL of the right type. feature_type (field_type == None) is handled
                    # below.

                    valid_sql_type = self.db_driver.sqlTypeFor(
                        "a", self.column_descriptions[field_key]
                    )
                    sql_fields[field_key] = f"CAST(NULL AS {valid_sql_type}) AS {global_name}"

            sql_fields[self.FEATURE_TYPE_META_KEY] = f"'{feature_type}' AS feature_type"
            sql_fields[self.GEOM_FIELD_NAME_META_KEY] = f"'{geom_field}' AS geom_field"

            data_filter_clause = ""
            if combined_filter:
                data_table_filter = combined_filter.feature_table_filter_sql(
                    self.current_user, self.session_vars
                )
                data_filter_clause = f" AND ({data_table_filter})"

            if isinstance(table, MywVersionedFeatureTable):
                delta_table_sql_name = f"{table.delta_model.__table__.schema}.{feature_type}"

                (
                    delta_filter_clause,
                    extra_data_filter_clause,
                ) = combined_filter.delta_table_filter_sql(self.current_user, self.session_vars)

                data_filter_clause += extra_data_filter_clause

                table_sqls.append(
                    self._feature_table_sql_query(
                        geom_field,
                        sql_fields,
                        ordered_fields,
                        delta_table_sql_name,
                        delta_filter_clause,
                    )
                )

            table_sqls.append(
                self._feature_table_sql_query(
                    geom_field,
                    sql_fields,
                    ordered_fields,
                    table_sql_name,
                    data_filter_clause,
                )
            )

        return table_sqls

    def _feature_table_sql_query(
        self, geom_field, sql_fields, ordered_fields, table_sql_name, filter_clause
    ):
        """We use this template for both delta and data table queries."""
        return f"""
            SELECT
                ST_Transform({geom_field}, 3857),
                {','.join(sql_fields[k] for k in ordered_fields)}
            FROM {table_sql_name}
            WHERE ({geom_field} && (SELECT expanded_envelope FROM wgs84)) {filter_clause}"""
