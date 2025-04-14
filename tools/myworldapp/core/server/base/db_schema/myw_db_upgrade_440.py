################################################################################
# myWorld database upgrade 440
################################################################################
# Copyright: IQGeo Limited 2010-2023

from datetime import datetime

from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn, MywDbConstraint, MywDbIndex
from .myw_db_upgrade import MywDbUpgrade

# Release 5.2 introduced changes to trigger building - references new column search_rule.lang
from .db_drivers_510.myw_db_driver import MywDbDriver as MywDbDriver510


class MywDbUpgrade440(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 4.3 to 4.4
    """

    # Constants
    db_driver_class = MywDbDriver510
    schema_vs_name = "myw_schema"
    from_version = 43007

    updates = {
        44001: "add_config_version_stamps",
        44002: "rebuild_config_triggers",
        44003: "layer_add_fields",
        44004: "layer_migrate_visibility",
        44005: "layer_drop_scale_fields",
        44006: "usage_drop_old_table",
        44007: "usage_add_new_tables",
        44008: "application_state_rename_table",
        44009: "enum_add_display_value_field",
        44010: "enum_populate_display_value_field",
        44011: "rename_pseudo_var",
        44012: "groups_add_tables",
        44013: "groups_add_triggers",
        44014: "groups_add_right",
        44015: "private_layers_add_table",
        44016: "private_layers_add_trigger",
        44017: "private_layers_add_right",
        44018: "filter_fields_extend",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def add_config_version_stamps(self):
        """
        Adds version stamp for provoking config cache rebuilds
        """

        MywVersionStamp = self.rawModelFor("myw", "version_stamp")

        for name in ["myw_server_config", "myw_user_config"]:

            rec = MywVersionStamp(component=name, version=1, date=datetime.now())

            self.session.add(rec)

    def rebuild_config_triggers(self):
        """
        Rebuild triggers for config tables

        Adds core to increment version stamp (were appropriate). This change is to
        prevent updates to myw.group provoking unnecessary cache rebuilds."""

        # Server configuration
        self.db_driver.setConfigTriggers("setting", change_log_id_from="name")

        self.db_driver.setConfigTriggers(
            "datasource", change_log_id_from="name", version_stamp="myw_server_config"
        )

        self.db_driver.setConfigTriggers(
            "dd_enum", change_log_id_from="name", version_stamp="myw_server_config"
        )

        self.db_driver.setConfigTriggers(
            "dd_enum_value",
            substructure_of="dd_enum",
            change_log_id_from="enum_name",
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "dd_feature",
            change_log_id_from="feature_name",
            log_datasource=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "dd_field",
            substructure_of="dd_feature",
            change_log_id_from="table_name",
            log_datasource=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "dd_field_group",
            substructure_of="dd_feature",
            change_log_id_from="feature_name",
            log_datasource=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "dd_field_group_item",
            substructure_of="dd_feature",
            change_log_id_from="feature_name",
            change_log_id_from_table="dd_field_group",
            join_clause="{}.id={}.container_id",
            log_datasource=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "query",
            substructure_of="dd_feature",
            change_log_id_from="myw_object_type",
            log_datasource=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "search_rule",
            substructure_of="dd_feature",
            change_log_id_from="feature_name",
            log_datasource=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "filter",
            substructure_of="dd_feature",
            change_log_id_from="feature_name",
            log_datasource=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "layer",
            change_log_id_from="name",
            log_id_update_as_new=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "layer_feature_item",
            substructure_of="layer",
            change_log_id_from="name",
            change_log_id_from_table="layer",
            join_clause="{}.id={}.layer_id",
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "layer_group",
            change_log_id_from="name",
            log_id_update_as_new=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "layer_group_item",
            substructure_of="layer_group",
            change_log_id_from="name",
            change_log_id_from_table="layer_group",
            join_clause="{}.id={}.layer_group_id",
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "network", change_log_id_from="name", version_stamp="myw_server_config"
        )

        self.db_driver.setConfigTriggers(
            "network_feature_item",
            substructure_of="network",
            change_log_id_from="network_name",
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "application",
            change_log_id_from="name",
            log_id_update_as_new=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "application_layer",
            substructure_of="application",
            change_log_id_from="name",
            change_log_id_from_table="application",
            join_clause="{}.id={}.application_id",
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "role",
            change_log_id_from="name",
            log_id_update_as_new=True,
            version_stamp="myw_server_config",
        )

        self.db_driver.setConfigTriggers(
            "permission",
            substructure_of="role",
            change_log_id_from="name",
            change_log_id_from_table="role",
            join_clause="{}.id={}.role_id",
            version_stamp="myw_server_config",
        )

        # Replication only
        self.db_driver.setConfigTriggers("table_set", change_log_id_from="id")

        self.db_driver.setConfigTriggers(
            "table_set_layer_item",
            substructure_of="table_set",
            change_log_id_from="id",
            change_log_id_from_table="table_set",
            join_clause="{}.id={}.table_set_id",
        )

        self.db_driver.setConfigTriggers(
            "table_set_tile_file_item",
            substructure_of="table_set",
            change_log_id_from="id",
            change_log_id_from_table="table_set",
            join_clause="{}.id={}.table_set_id",
        )

    def layer_add_fields(self):
        """
        Add fields to support visibility/selection
        """

        self.db_driver.addColumn("myw", "layer_feature_item", MywDbColumn("min_select", "integer"))
        self.db_driver.addColumn("myw", "layer_feature_item", MywDbColumn("max_select", "integer"))
        self.db_driver.addColumn("myw", "layer_feature_item", MywDbColumn("min_vis", "integer"))
        self.db_driver.addColumn("myw", "layer_feature_item", MywDbColumn("max_vis", "integer"))

    def layer_migrate_visibility(self):
        """
        Populate layer max and min select fields
        """

        MywLayerFeatureItem = self.rawModelFor("myw", "layer_feature_item")

        for rec in self.session.query(MywLayerFeatureItem):
            rec.min_select = rec.min_scale
            rec.max_select = rec.max_scale

    def layer_drop_scale_fields(self):
        """
        Drop layer min_scale and max_scale fields (renamed to min_select/max_select)
        """

        self.db_driver.dropColumn("myw", "layer_feature_item", MywDbColumn("min_scale", "integer"))
        self.db_driver.dropColumn("myw", "layer_feature_item", MywDbColumn("max_scale", "integer"))

    def usage_drop_old_table(self):
        """
        Drop old usage stats table
        """

        self.db_driver.dropTable("myw", "usage_stat")

    def usage_add_new_tables(self):
        """
        Create session usage tables
        """

        usage = self.db_driver.createTableFrom(
            "myw",
            "usage",
            MywDbColumn("id", "integer", key=True, generator="sequence"),
            MywDbColumn("username", "string(200)"),
            MywDbColumn("client", "string(200)"),
            MywDbColumn("start_time", "timestamp"),
            MywDbColumn("end_time", "timestamp"),
            MywDbIndex(["start_time"]),
            MywDbIndex(["end_time"]),
        )

        usage_item = self.db_driver.createTableFrom(
            "myw",
            "usage_item",
            MywDbColumn("usage_id", "integer", key=True, reference=usage.columns["id"]),
            MywDbColumn("application_name", "string(200)", key=True),
            MywDbColumn("action", "string(300)", key=True),
            MywDbColumn("count", "integer"),
            MywDbIndex(["action"]),
        )

    def application_state_rename_table(self):
        """
        Rename system table user_application -> application_state
        """

        self.db_driver.execute("ALTER TABLE myw.user_application RENAME TO application_state")

    def enum_add_display_value_field(self):
        """
        Add a display_value field to myw.dd_enum_value (for localisation)
        """

        self.db_driver.addColumn(
            "myw", "dd_enum_value", MywDbColumn("display_value", "string(1000)")
        )

    def enum_populate_display_value_field(self):
        """
        Copy the contents of the value field into the display_value field
        (for backwards compatibility)
        """

        MywDdEnumValue = self.rawModelFor("myw", "dd_enum_value")

        for rec in self.session.query(MywDdEnumValue):
            rec.display_value = rec.value

    def rename_pseudo_var(self):
        """
        Change {external_name} -> {display_name} in title expressions etc
        """

        MywDDFeature = self.rawModelFor("myw", "dd_feature")
        MywSearchRule = self.rawModelFor("myw", "search_rule")

        def fixup(val):
            if not val:
                return val
            return val.replace("{external_name}", "{display_name}")

        for rec in self.session.query(MywDDFeature):
            rec.title_expr = fixup(rec.title_expr)
            rec.short_description_expr = fixup(rec.short_description_expr)

        for rec in self.session.query(MywSearchRule):
            rec.search_val_expr = fixup(rec.search_val_expr)
            rec.search_desc_expr = fixup(rec.search_desc_expr)

    def groups_add_tables(self):
        """
        Add tables for modelling user groups
        """

        group = self.db_driver.createTableFrom(
            "myw",
            "group",
            MywDbColumn("id", "string(400)", key=True, nullable=False),
            MywDbColumn("owner", "string(200)", nullable=False),
            MywDbColumn("name", "string(200)", nullable=False),
            MywDbColumn("description", "string(200)"),
            MywDbConstraint.unique("owner", "name"),
            MywDbIndex(["name"]),
        )

        group_item = self.db_driver.createTableFrom(
            "myw",
            "group_item",
            MywDbColumn("group_id", "string(400)", key=True, reference=group.columns["id"]),
            MywDbColumn("username", "string(200)", key=True),
            MywDbColumn("manager", "boolean", nullable=False, default=False),
            MywDbIndex(["username"]),
        )

    def groups_add_triggers(self):
        """
        Add triggers to user group tables
        """

        self.db_driver.setConfigTriggers(
            "group", change_log_id_from="id", version_stamp="myw_user_config"
        )

        self.db_driver.setConfigTriggers(
            "group_item",
            substructure_of="group",
            change_log_id_from="group_id",
            version_stamp="myw_user_config",
        )

    def groups_add_right(self):
        """
        Add right editGroups
        """

        from myworldapp.core.server.base.system.myw_localiser import MywLocaliser

        if not self.lang:  # ENH: Avoid need for this backstop
            self.lang = "en"

        localiser = MywLocaliser(self.lang, "myw.install", encoding=self.encoding)

        MywRight = self.rawModelFor("myw", "right")

        rec = MywRight(
            name="editGroups",
            description=localiser.msg("install", "edit_groups_right_desc"),
            config=False,
        )

        self.session.add(rec)

    def private_layers_add_table(self):
        """
        Add table for storing user-defined layer definitions
        """

        private_layer = self.db_driver.createTableFrom(
            "myw",
            "private_layer",
            MywDbColumn("id", "string(400)", key=True),
            MywDbColumn("owner", "string(200)", nullable=False),
            MywDbColumn("name", "string(200)", nullable=False),
            MywDbColumn("sharing", "string(200)"),
            MywDbColumn("datasource_spec", "string(4000)"),
            MywDbColumn("category", "string(200)"),
            MywDbColumn("description", "string(1000)"),
            MywDbColumn("spec", "string(4000)"),
            MywDbColumn("thumbnail", "string(200)"),
            MywDbColumn("min_scale", "integer"),
            MywDbColumn("max_scale", "integer"),
            MywDbColumn("transparency", "integer", nullable=False, default=0),
            MywDbColumn("attribution", "string(500)"),
            MywDbColumn("control_item_class", "string(1000)"),
            MywDbConstraint.unique("owner", "name"),
            MywDbIndex(["sharing"]),
        )

    def private_layers_add_trigger(self):
        """
        Add triggers to myw.private_layer
        """

        self.db_driver.setConfigTriggers(
            "private_layer", change_log_id_from="id", version_stamp="myw_user_config"
        )

    def private_layers_add_right(self):
        """
        Add right editGroups
        """

        from myworldapp.core.server.base.system.myw_localiser import MywLocaliser

        if not self.lang:  # ENH: Avoid need for this backstop
            self.lang = "en"

        localiser = MywLocaliser(self.lang, "myw.install", encoding=self.encoding)

        MywRight = self.rawModelFor("myw", "right")

        rec = MywRight(
            name="addPrivateLayers",
            description=localiser.msg("install", "add_private_layers_right_desc"),
            config=False,
        )

        self.session.add(rec)

    def filter_fields_extend(self):
        """
        Increase the size of fields that store filter expressions
        """

        # Note: network.filter is already 2000 chars

        self.db_driver.alterColumn(
            "myw",
            "filter",
            MywDbColumn("value", "string(256)"),
            MywDbColumn("value", "string(2000)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "query",
            MywDbColumn("attrib_query", "string(100)"),
            MywDbColumn("attrib_query", "string(2000)"),
        )
