################################################################################
# myWorld database upgrade 500
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json
from collections import OrderedDict

from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn, MywDbIndex
from .myw_db_upgrade import MywDbUpgrade

# Release 5.2 introduced changes to trigger building - references new column search_rule.lang
from .db_drivers_510.myw_db_driver import MywDbDriver as MywDbDriver510


class MywDbUpgrade500(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 4.4 to 5.0
    """

    # Constants
    db_driver_class = MywDbDriver510
    schema_vs_name = "myw_schema"
    from_version = 44018

    updates = {
        50001: "dd_field_add_display_format",
        50002: "dd_field_add_unit_scale",
        50003: "settings_add_unit_scales",
        50004: "deltas_add_schemas",
        50005: "deltas_add_feature_property",
        50006: "deltas_add_index_tables",
        50007: "deltas_add_transaction_log_tables",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def dd_field_add_display_format(self):
        """
        Add field to support numeric display formatting
        """

        self.db_driver.addColumn("myw", "dd_field", MywDbColumn("display_format", "string(50)"))

    def dd_field_add_unit_scale(self):
        """
        Add fields to support conversion between units
        """

        self.db_driver.addColumn("myw", "dd_field", MywDbColumn("display_unit", "string(50)"))
        self.db_driver.addColumn("myw", "dd_field", MywDbColumn("unit_scale", "string(50)"))

    def settings_add_unit_scales(self):
        """
        Add additional unit scales to setting.units
        """

        additional_scales = OrderedDict()

        additional_scales["electric_potential"] = {
            "base_unit": "V",
            "units": {"mV": 0.001, "V": 1, "kV": 1000, "MV": 1000000},
        }

        additional_scales["electric_current"] = {
            "base_unit": "A",
            "units": {"mA": 0.001, "A": 1, "kA": 1000, "MA": 1000000},
        }

        additional_scales["mass"] = {
            "base_unit": "kg",
            "units": {
                "mg": 0.000001,
                "g": 0.001,
                "kg": 1,
                "t": 1000,
                "oz": 0.0283495,
                "lb": 0.453592,
            },
        }

        additional_scales["power"] = {
            "base_unit": "W",
            "units": {"mW": 0.001, "W": 1, "kW": 1000, "MW": 1000000},
        }

        additional_scales["pressure"] = {
            "base_unit": "Pa",
            "units": {
                "Pa": 1,
                "kPa": 1000,
                "atm": 101325.0,
                "mbar": 100,
                "bar": 100000,
                "psi": 6894.7573,
            },
        }

        additional_scales["area"] = {
            "base_unit": "m^2",
            "units": {
                "m^2": 1,
                "hectare": 10000,
                "km^2": 1000000,
                "ft^2": 0.09290304,
                "yd^2": 0.83612736,
                "acres": 4046.86267,
                "mi^2": 2589988.101,
            },
        }

        additional_scales["time"] = {
            "base_unit": "s",
            "units": {"ms": 0.001, "s": 1, "m": 60, "h": 3600, "d": 86400, "wk": 604800},
        }

        unit_scales = OrderedDict()

        # Get existing units setting
        MywSetting = self.rawModelFor("myw", "setting")
        settings = self.session.query(MywSetting)
        setting = settings.filter(MywSetting.name == "units").first()

        # load existing unit_scales
        if setting:
            if setting.value:
                unit_scales = json.loads(setting.value)
        else:
            # create unit setting is missing
            setting = MywSetting(name="units", type="JSON")
            self.session.add(setting)

        # Add additional unit scales
        for scale in additional_scales:
            if unit_scales.get(scale):
                self.progress("warning", "Skipping existing unit scale:", scale)
            else:
                unit_scales[scale] = additional_scales[scale]

        # Save updated unit_scales
        setting.value = json.dumps(unit_scales)

    def deltas_add_schemas(self):
        """
        Add schemas for storing delta tables
        """

        self.db_driver.createSchema("delta")
        self.db_driver.createSchema("base")

    def deltas_add_feature_property(self):
        """
        Add 'versioned' field on dd_feature
        """

        self.db_driver.addColumn(
            "myw", "dd_feature", MywDbColumn("versioned", "boolean", default=False, nullable=False)
        )

    def deltas_add_index_tables(self):
        """
        Add delta index tables
        """

        filter_val_fields = [
            MywDbColumn("filter1_val", "string(50)"),
            MywDbColumn("filter2_val", "string(50)"),
            MywDbColumn("filter3_val", "string(50)"),
            MywDbColumn("filter4_val", "string(50)"),
            MywDbColumn("filter5_val", "string(50)"),
            MywDbColumn("filter6_val", "string(50)"),
            MywDbColumn("filter7_val", "string(50)"),
            MywDbColumn("filter8_val", "string(50)"),
        ]

        delta_geo_world_point = self.db_driver.createTableFrom(
            "myw",
            "delta_geo_world_point",
            MywDbColumn("delta", "string(400)", key=True),
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("the_geom", "point"),
            MywDbColumn("change_type", "string(10)"),
            *filter_val_fields,
        )
        self.db_driver.addGeographyIndex("myw", "delta_geo_world_point", "the_geom")

        delta_geo_world_linestring = self.db_driver.createTableFrom(
            "myw",
            "delta_geo_world_linestring",
            MywDbColumn("delta", "string(400)", key=True),
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("the_geom", "linestring"),
            MywDbColumn("change_type", "string(10)"),
            *filter_val_fields,
        )
        self.db_driver.addGeographyIndex("myw", "delta_geo_world_linestring", "the_geom")

        delta_geo_world_polygon = self.db_driver.createTableFrom(
            "myw",
            "delta_geo_world_polygon",
            MywDbColumn("delta", "string(400)", key=True),
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("the_geom", "polygon"),
            MywDbColumn("change_type", "string(10)"),
            *filter_val_fields,
        )
        self.db_driver.addGeographyIndex("myw", "delta_geo_world_polygon", "the_geom")

        delta_int_world_point = self.db_driver.createTableFrom(
            "myw",
            "delta_int_world_point",
            MywDbColumn("delta", "string(400)", key=True),
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("myw_world_name", "string(100)"),
            MywDbColumn("the_geom", "point"),
            MywDbColumn("change_type", "string(10)"),
            *filter_val_fields,
        )
        self.db_driver.addGeographyIndex("myw", "delta_int_world_point", "the_geom")

        delta_int_world_linestring = self.db_driver.createTableFrom(
            "myw",
            "delta_int_world_linestring",
            MywDbColumn("delta", "string(400)", key=True),
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("myw_world_name", "string(100)"),
            MywDbColumn("the_geom", "linestring"),
            MywDbColumn("change_type", "string(10)"),
            *filter_val_fields,
        )
        self.db_driver.addGeographyIndex("myw", "delta_int_world_linestring", "the_geom")

        delta_int_world_polygon = self.db_driver.createTableFrom(
            "myw",
            "delta_int_world_polygon",
            MywDbColumn("delta", "string(400)", key=True),
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("myw_world_name", "string(100)"),
            MywDbColumn("the_geom", "polygon"),
            MywDbColumn("change_type", "string(10)"),
            *filter_val_fields,
        )
        self.db_driver.addGeographyIndex("myw", "delta_int_world_polygon", "the_geom")

        # Search index table
        search_string = self.db_driver.createTableFrom(
            "myw",
            "delta_search_string",
            MywDbColumn("delta", "string(400)", key=True),
            MywDbColumn("search_rule_id", "integer", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("feature_name", "string(200)"),
            MywDbColumn("search_val", "string(200)"),
            MywDbColumn("search_desc", "string(500)"),
            MywDbColumn("extra_values", "string(200)"),
            MywDbColumn("change_type", "string(10)"),
            MywDbIndex(["search_val"], type="like"),
            *filter_val_fields,
        )

    def deltas_add_transaction_log_tables(self):
        """
        Add change tracking tables for delta records
        """

        delta_transaction_log = self.db_driver.createTableFrom(
            "myw",
            "delta_transaction_log",
            MywDbColumn("id", "integer", key=True, generator="sequence"),
            MywDbColumn("operation", "string(20)", nullable=False),
            MywDbColumn("delta", "string(400)", nullable=False),
            MywDbColumn("feature_type", "string(200)", nullable=False),
            MywDbColumn("feature_id", "string(100)", nullable=False),
            MywDbColumn("version", "integer", nullable=False),
            MywDbIndex(["version", "feature_type"]),
        )

        base_transaction_log = self.db_driver.createTableFrom(
            "myw",
            "base_transaction_log",
            MywDbColumn("id", "integer", key=True, generator="sequence"),
            MywDbColumn("operation", "string(20)", nullable=False),
            MywDbColumn("delta", "string(400)", nullable=False),
            MywDbColumn("feature_type", "string(200)", nullable=False),
            MywDbColumn("feature_id", "string(100)", nullable=False),
            MywDbColumn("version", "integer", nullable=False),
            MywDbIndex(["version", "feature_type"]),
        )
