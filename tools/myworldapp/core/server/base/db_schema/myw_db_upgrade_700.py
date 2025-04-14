################################################################################
# myWorld database upgrade 700
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn, MywDbIndex
from .myw_db_upgrade import MywDbUpgrade
from sqlalchemy import or_


class MywDbUpgrade700(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 6.5 to 7.0
    """

    # Constants
    schema_vs_name = "myw_schema"
    from_version = 65006

    updates = {
        70001: "log_ids_to_bigints",
        70002: "add_extract_key_table",
        70003: "convert_geometry_indexes_to_geographies",
        70004: "remove_length_limit_on_style_lookups",
        70005: "add_save_default_state_right",
        70006: "extend_replica_username",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def log_ids_to_bigints(self):
        """
        Widen the id columns of the log tables so that we don't run out of space to log at
        int32_max entries, even if entries have been myw_db maintain'ed.
        """

        # Note, that the sequences which feed the primary keys are all bigint, because that is the
        # default and we have not specified before.

        self.db_driver.alterColumn(
            "myw",
            "transaction_log",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("id", "bigint", generator="sequence", key=True),
        )

        self.db_driver.alterColumn(
            "myw",
            "configuration_log",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("id", "bigint", generator="sequence", key=True),
        )

        self.db_driver.alterColumn(
            "myw",
            "base_transaction_log",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("id", "bigint", generator="sequence", key=True),
        )

        self.db_driver.alterColumn(
            "myw",
            "delta_transaction_log",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("id", "bigint", generator="sequence", key=True),
        )

    def add_extract_key_table(self):
        """
        Adds the extract_key table
        """
        self.db_driver.createTableFrom(
            "myw",
            "extract_key",
            MywDbColumn("extract_name", "string(100)", key=True),
            MywDbColumn("extract_key", "string(100)", nullable=True),
            MywDbIndex(["extract_name"]),
        )

    def convert_geometry_indexes_to_geographies(self):
        """convert all existing geometry index columns to the geography type, for performance."""
        geometry_table_names = [
            "geo_world_point",
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

        # We can't use MywDbColumn to switch `the_geom` from geometry to geography, because the db
        # driver only ever creates geometries, which it calls point, line, polygon.
        # So, we need custom SQL to do it.
        for table in geometry_table_names:
            self.db_driver.removeGeographyIndex("myw", table, "the_geom")
            self.db_driver.execute(
                f"ALTER TABLE myw.{table} ALTER COLUMN the_geom SET DATA TYPE GEOGRAPHY;"
            )

    def remove_length_limit_on_style_lookups(self):
        """convert varchar(4000) cols to varchar with no limit, in style lookup cases."""

        for col_name in [
            "point_style",
            "line_style",
            "fill_style",
            "text_style",
        ]:

            self.db_driver.alterColumn(
                "myw",
                "layer_feature_item",
                MywDbColumn(col_name, "string(4000)"),
                MywDbColumn(col_name, "string"),
            )

    def add_save_default_state_right(self):
        """
        Add right for saving the default application state for all users
        """

        from myworldapp.core.server.base.system.myw_localiser import MywLocaliser

        # Set backstop for language setting
        if not self.lang:
            self.lang = "en"

        localiser = MywLocaliser(self.lang, "myw.install", encoding=self.encoding)

        MywRight = self.rawModelFor("myw", "right")

        rec = MywRight(
            name="saveDefaultState",
            description=localiser.msg("install", "save_default_state_right_desc"),
            config=False,
        )

        self.session.add(rec)

    def extend_replica_username(self):
        """
        Extends the replica username field
        """
        self.db_driver.alterColumn(
            "myw",
            "replica",
            MywDbColumn("owner", "string(32)"),
            MywDbColumn("owner", "string(256)"),
        )
