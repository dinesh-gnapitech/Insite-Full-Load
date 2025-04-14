################################################################################
# myWorld database upgrade 510
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json
from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn
from .myw_db_upgrade import MywDbUpgrade

# Release 5.2 introduced changes to trigger building - references new column search_rule.lang
from .db_drivers_510.myw_db_driver import MywDbDriver as MywDbDriver510


class MywDbUpgrade510(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 5.0 to 5.1
    """

    # Constants
    db_driver_class = MywDbDriver510
    schema_vs_name = "myw_schema"
    from_version = 50007

    updates = {
        51001: "dd_extend_fields",
        51002: "configuration_log_extend_field",
        51003: "rename_system_settings",
        51004: "add_config_pages_setting",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def dd_extend_fields(self):
        """
        Extend fields in DD to cope with very long feature type names (from ESRI)
        """

        self.db_driver.alterColumn(
            "myw",
            "query",
            MywDbColumn("myw_search_val1", "string(100)"),
            MywDbColumn("myw_search_val1", "string(200)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "query",
            MywDbColumn("myw_search_desc1", "string(100)"),
            MywDbColumn("myw_search_desc1", "string(200)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "dd_field",
            MywDbColumn("internal_name", "string(100)"),
            MywDbColumn("internal_name", "string(200)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "dd_field",
            MywDbColumn("external_name", "string(100)"),
            MywDbColumn("external_name", "string(200)"),
        )

    def configuration_log_extend_field(self):
        """
        Extend field in myw.configuration_log to cope with very long feature type names
        """

        self.db_driver.alterColumn(
            "myw",
            "configuration_log",
            MywDbColumn("record_id", "string(200)"),
            MywDbColumn("record_id", "string(500)"),
        )

    def rename_system_settings(self):
        """
        Add group prefix all system settings
        """

        # Settings to be prefixed (and, optionally, renamed)
        settings = {
            "core": [
                # Mandatory settings
                "language",
                "units",
                "defaultMarkerStyleHighlight",
                "defaultMarkerStyleNormal",
                "defaultPolygonStyleHighlight",
                "defaultPolygonStyleNormal",
                "defaultPolylineStyleHighlight",
                "defaultPolylineStyleNormal",
                "worldTypeNames",
                "addressDatasource",
                "exportEncoding",
                "featureDetails",
                "queryResultLimit",
                "searchExamples",
                ["baseZoomLevel", "map.maxZoom"],  # Renames
                ["panInertia", "map.panInertia"],
                ["streetview", "plugin.streetview"],
                ["measurementTool", "plugin.measureTool"],
                ["networkTraceLimit", "plugin.trace.limit"],
                ["networkCheckInterval", "plugin.internetStatus.interval"],
                ["maxNetworkCheckInterval", "plugin.internetStatus.maxInterval"],
                ["MagnifyingGlassPlugin", "plugin.magnifyingGlass"],
                ["minimap", "plugin.minimap"],
            ],
            "replication": [
                "master_shard_max",
                "master_connect_spec",
                "replica_shard_lwm",
                "replica_id_hwm",
                "replica_id",
                ["replica_sync_root", "sync_root"],
                ["replica_sync_urls", "sync_urls"],
                [
                    "replica_sync_url",
                    "sync_url",
                ],  # Should not exist .. but referenced in native app
            ],
        }

        # Do renames
        for group, names in list(settings.items()):
            for name in names:
                if isinstance(name, list):
                    (name, new_name) = name
                else:
                    new_name = name

                self._rename_setting(name, group + "." + new_name)

    def _rename_setting(self, name, new_name):
        """
        Helper to rename setting NAME (if it exists)
        """

        MywSetting = self.rawModelFor("myw", "setting")

        rec = self.session.query(MywSetting).get(name)

        if not rec:
            return False

        self.progress(3, "Renaming setting", name, "->", new_name)

        # Delete existing record
        self.session.delete(rec)

        # Add new record
        new_rec = MywSetting(name=new_name, type=rec.type, value=rec.value)
        self.session.add(new_rec)

        return True

    def add_config_pages_setting(self):
        """
        Add the setting for registering config page tabs
        """

        MywSetting = self.rawModelFor("myw", "setting")

        default_value = ["core.streetview", "core.system", "core.advanced"]

        rec = MywSetting(
            name="core.configSettingsPages", type="JSON", value=json.dumps(default_value)
        )

        self.session.add(rec)
