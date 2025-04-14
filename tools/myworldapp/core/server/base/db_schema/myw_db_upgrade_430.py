################################################################################
# myWorld database upgrade 430
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json
from collections import OrderedDict

from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn, MywDbIndex
from .myw_db_upgrade import MywDbUpgrade

# Release 5.2 introduced changes to trigger building - references new column search_rule.lang
from .db_drivers_510.myw_db_driver import MywDbDriver as MywDbDriver510


class MywDbUpgrade430(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 4.2 to 4.3
    """

    # Constants
    db_driver_class = MywDbDriver510
    schema_vs_name = "myw_schema"
    from_version = 42006

    updates = {
        43001: "networks_add_tables",
        43002: "networks_add_triggers",
        43003: "networks_add_config_right",
        43004: "networks_add_config_permissions",
        43005: "layer_feature_items_recode_select_scales",
        43006: "layer_extend_control_item_field",
        43007: "add_network_trace_settings",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def networks_add_tables(self):
        """
        Add system tables for storing network definitions
        """

        dd_feature = self.db_driver.tableDescriptorFor("myw", "dd_feature")

        network = self.db_driver.createTableFrom(
            "myw",
            "network",
            MywDbColumn("name", "string(64)", key=True),
            MywDbColumn("external_name", "string(64)"),
            MywDbColumn("description", "string(1000)"),
            MywDbColumn("topology", "string(32)"),
            MywDbColumn("directed", "boolean"),
            MywDbColumn("engine", "string(128)"),
        )

        network_feature_item = self.db_driver.createTableFrom(
            "myw",
            "network_feature_item",
            MywDbColumn("network_name", "string(64)", key=True, reference=network.columns["name"]),
            MywDbColumn("feature_id", "integer", key=True, reference=dd_feature.columns["id"]),
            MywDbColumn("upstream", "string(64)"),
            MywDbColumn("downstream", "string(64)"),
            MywDbColumn("length", "string(64)"),
            MywDbColumn("filter", "string(2000)"),
            MywDbIndex(["feature_id"]),
        )

    def networks_add_triggers(self):
        """
        Add change tracking trigger on network tables
        """

        self.db_driver.setConfigTriggers("network", change_log_id_from="name")

        self.db_driver.setConfigTriggers(
            "network_feature_item", substructure_of="network", change_log_id_from="network_name"
        )

    def networks_add_config_right(self):
        """
        Add right for accessing administrator networks page
        """

        from myworldapp.core.server.base.system.myw_localiser import MywLocaliser

        # Set backstop for language setting
        if not self.lang:
            self.lang = "en"

        localiser = MywLocaliser(self.lang, "myw.install", encoding=self.encoding)

        MywRight = self.rawModelFor("myw", "right")

        rec = MywRight(
            name="manageNetworks",
            description=localiser.msg("install", "manage_networks_right_desc"),
            config=True,
        )

        self.session.add(rec)

    def networks_add_config_permissions(self):
        """
        Add new config right manageNotifcations to all roles with config right manageLayers
        """

        MywPermission = self.rawModelFor("myw", "permission")
        MywRight = self.rawModelFor("myw", "right")

        # Find rights
        layers_right_rec = (
            self.session.query(MywRight).filter(MywRight.name == "manageLayers").first()
        )
        networks_right_rec = (
            self.session.query(MywRight).filter(MywRight.name == "manageNetworks").first()
        )

        if layers_right_rec == None:  # happens if installing
            return

        # Add new permissions
        query = self.session.query(MywPermission).filter(
            MywPermission.right_id == layers_right_rec.id
        )

        for layers_perm_rec in query:
            networks_perm_rec = MywPermission(
                role_id=layers_perm_rec.role_id,
                application_id=layers_perm_rec.application_id,
                right_id=networks_right_rec.id,
            )

            self.session.add(networks_perm_rec)

    def layer_feature_items_recode_select_scales(self):
        """
        Replace explicit min/max select scales by 'use default' value (null)
        """

        MywLayer = self.rawModelFor("myw", "layer")
        MywLayerFeatureItem = self.rawModelFor("myw", "layer_feature_item")

        # Build lookup table of layer definitions, keyed by id
        layer_recs = {}
        for rec in self.session.query(MywLayer):
            layer_recs[rec.id] = rec

        # Recode values to null (where appropriate)
        for rec in self.session.query(MywLayerFeatureItem):
            layer_rec = layer_recs[rec.layer_id]

            if rec.min_scale == layer_rec.min_scale:
                rec.min_scale = None
            if rec.max_scale == layer_rec.max_scale:
                rec.max_scale = None

    def layer_extend_control_item_field(self):
        """
        Increase the length of myw.layer field control_item_class

        This is to support a list of control widgets"""

        self.execute_sql(
            "ALTER TABLE myw.layer ALTER control_item_class TYPE character varying(1000)"
        )

    def add_network_trace_settings(self):
        """
        Add settings used by network tracing
        """

        MywSetting = self.rawModelFor("myw", "setting")

        # Add unit scale
        # ENH: Split into imperial and metric somehow
        # ENH: Support aliases?
        scales = OrderedDict()

        scales["length"] = {
            "base_unit": "m",
            "units": {
                "mm": 0.001,
                "cm": 0.01,
                "m": 1.0,
                "km": 1000,
                "in": 0.0254,  # From https://en.wikipedia.org/wiki/Imperial_units#Length
                "ft": 0.3048,
                "yd": 0.9144,
                "mi": 1609.344,
            },
        }

        rec = MywSetting(name="units", type="JSON", value=json.dumps(scales))

        self.session.add(rec)

        # Add trace node limit
        rec = MywSetting(name="networkTraceLimit", type="INTEGER", value=10000)

        self.session.add(rec)
