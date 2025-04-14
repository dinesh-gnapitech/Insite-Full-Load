################################################################################
# Install the myWorld system tables
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os.path, glob, datetime
from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn, MywDbConstraint, MywDbIndex
from myworldapp.core.server.base.system.myw_localiser import MywLocaliser
from .myw_db_upgrade import MywDbUpgrade


class MywDbInstall(MywDbUpgrade):
    """
    Install myWorld system tables
    """

    schema_vs_name = "myw_schema"
    from_version = 0

    updates = {
        1: "install_schemas",
        2: "install_system_tables",
        3: "install_system_triggers",
        43006: "init_version_stamps",
    }

    supports_dry_run = False  # Schema creation requires separate transaction

    def install_schemas(self):
        """
        Create the schemas
        """

        self.db_driver.createSchema("data")
        self.db_driver.createSchema("myw")

    def install_system_tables(self):
        """
        Create the system tables
        """

        # -----------------
        #  Change Tracking
        # -----------------

        version_stamp = self.db_driver.createTableFrom(
            "myw",
            "version_stamp",
            MywDbColumn("component", "string(30)", key=True),
            MywDbColumn("version", "integer"),
            MywDbColumn("date", "timestamp", nullable=False),
        )

        checkpoint = self.db_driver.createTableFrom(
            "myw",
            "checkpoint",
            MywDbColumn("name", "string(63)", key=True),
            MywDbColumn("version", "integer", nullable=False),
            MywDbColumn("date", "timestamp", nullable=False),
        )

        transaction_log = self.db_driver.createTableFrom(
            "myw",
            "transaction_log",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("operation", "string(20)", nullable=False),
            MywDbColumn("feature_type", "string(200)", nullable=False),
            MywDbColumn("feature_id", "string(100)", nullable=False),
            MywDbColumn("version", "integer", nullable=False),
            MywDbIndex(["version", "feature_type"]),
        )

        configuration_log = self.db_driver.createTableFrom(
            "myw",
            "configuration_log",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("operation", "string(20)", nullable=False),
            MywDbColumn("table_name", "string(200)", nullable=False),
            MywDbColumn("record_id", "string(200)", nullable=False),
            MywDbColumn("version", "integer", nullable=False),
            MywDbIndex(["table_name", "version"]),
        )

        configuration_task = self.db_driver.createTableFrom(
            "myw",
            "configuration_task",
            MywDbColumn("id", "integer", key=True),
            MywDbColumn("status", "string(128)", nullable=True),
        )

        # -------------------------
        #  Settings and Statistics
        # -------------------------

        setting = self.db_driver.createTableFrom(
            "myw",
            "setting",
            MywDbColumn("name", "string(50)", key=True),
            MywDbColumn("type", "string(50)", default="STRING"),
            MywDbColumn("value", "string()"),
        )

        usage_stat = self.db_driver.createTableFrom(
            "myw",
            "usage_stat",
            MywDbColumn("period_start", "timestamp", key=True),
            MywDbColumn("username", "string(128)", key=True),
            MywDbColumn("period_end", "timestamp"),
            MywDbColumn("n_requests", "integer"),
        )

        # -----------------
        #  Data Dictionary
        # -----------------

        datasource = self.db_driver.createTableFrom(
            "myw",
            "datasource",
            MywDbColumn("name", "string(64)", key=True),
            MywDbColumn("external_name", "string(64)"),
            MywDbColumn("description", "string(1000)"),
            MywDbColumn("type", "string(32)"),
            MywDbColumn("spec", "string"),
        )

        dd_enum = self.db_driver.createTableFrom(
            "myw",
            "dd_enum",
            MywDbColumn("name", "string(100)", key=True),
            MywDbColumn("description", "string(1000)"),
        )

        dd_enum_value = self.db_driver.createTableFrom(
            "myw",
            "dd_enum_value",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("enum_name", "string(100)", reference=dd_enum.columns["name"]),
            MywDbColumn("position", "integer"),
            MywDbColumn("value", "string(1000)"),
        )

        dd_feature = self.db_driver.createTableFrom(
            "myw",
            "dd_feature",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn(
                "datasource_name",
                "string(64)",
                reference=datasource.columns["name"],
                nullable=False,
                default="myworld",
            ),
            MywDbColumn("feature_name", "string(200)"),
            MywDbColumn("external_name", "string(200)"),
            MywDbColumn("title_expr", "string(200)"),
            MywDbColumn("short_description_expr", "string(200)"),
            MywDbColumn("editable", "boolean", default=False),
            MywDbColumn("track_changes", "boolean", default=True),
            MywDbColumn("insert_from_gui", "boolean"),
            MywDbColumn("update_from_gui", "boolean"),
            MywDbColumn("delete_from_gui", "boolean"),
            MywDbColumn("key_name", "string(100)"),
            MywDbColumn("primary_geom_name", "string(100)"),
            MywDbColumn("geometry_type", "string(100)"),
            MywDbColumn("filter1_field", "string(100)"),
            MywDbColumn("filter2_field", "string(100)"),
            MywDbColumn("filter3_field", "string(100)"),
            MywDbColumn("filter4_field", "string(100)"),
            MywDbColumn("filter5_field", "string(100)"),
            MywDbColumn("filter6_field", "string(100)"),
            MywDbColumn("filter7_field", "string(100)"),
            MywDbColumn("filter8_field", "string(100)"),
            MywDbColumn("remote_spec", "string"),
            MywDbConstraint.unique("datasource_name", "feature_name"),
        )

        dd_field = self.db_driver.createTableFrom(
            "myw",
            "dd_field",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn(
                "datasource_name",
                "string(64)",
                reference=datasource.columns["name"],
                nullable=False,
                default="myworld",
            ),
            MywDbColumn("table_name", "string(200)"),
            MywDbColumn("internal_name", "string(100)"),
            MywDbColumn("external_name", "string(100)"),
            MywDbColumn("type", "string(230)"),
            MywDbColumn("enum", "string(100)"),
            MywDbColumn("generator", "string(30)"),
            MywDbColumn("default", "string(1000)"),
            MywDbColumn("mandatory", "boolean", default=False),
            MywDbColumn("unit", "string(32)"),
            MywDbColumn("min_value", "double"),
            MywDbColumn("max_value", "double"),
            MywDbColumn("value", "string(4000)"),
            MywDbColumn("indexed", "boolean", default=False),
            MywDbConstraint.unique("datasource_name", "table_name", "internal_name"),
            MywDbIndex(["datasource_name", "type"]),
        )

        dd_field_group = self.db_driver.createTableFrom(
            "myw",
            "dd_field_group",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn(
                "datasource_name",
                "string(64)",
                reference=datasource.columns["name"],
                nullable=False,
                default="myworld",
            ),
            MywDbColumn("feature_name", "string(200)"),
            MywDbColumn("display_name", "string(100)"),
            MywDbColumn("display_position", "integer", default="0"),
            MywDbColumn("is_expanded", "boolean", default=False),
            MywDbConstraint.unique("datasource_name", "feature_name", "display_position"),
        )

        dd_field_group_item = self.db_driver.createTableFrom(
            "myw",
            "dd_field_group_item",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("container_id", "integer", reference=dd_field_group.columns["id"]),
            MywDbColumn("field_name", "string(100)"),
            MywDbColumn("display_position", "integer", default="0"),
        )

        filter = self.db_driver.createTableFrom(
            "myw",
            "filter",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn(
                "datasource_name",
                "string(64)",
                nullable=False,
                reference=datasource.columns["name"],
                default="myworld",
            ),
            MywDbColumn("feature_name", "string(200)", nullable=False),
            MywDbColumn("name", "string(64)", nullable=False),
            MywDbColumn("value", "string(256)"),
            MywDbConstraint.unique("datasource_name", "feature_name", "name"),
        )

        # ------------------
        #  Query and Search
        # ------------------

        query = self.db_driver.createTableFrom(
            "myw",
            "query",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn(
                "datasource_name",
                "string(64)",
                reference=datasource.columns["name"],
                nullable=False,
                default="myworld",
            ),
            MywDbColumn("myw_object_type", "string(200)"),
            MywDbColumn("myw_search_val1", "string(100)"),
            MywDbColumn("myw_search_desc1", "string(100)"),
            MywDbColumn("attrib_query", "string(100)"),
            MywDbIndex(["myw_search_val1"]),
            MywDbIndex(["datasource_name", "myw_object_type"]),
        )

        search_rule = self.db_driver.createTableFrom(
            "myw",
            "search_rule",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn(
                "datasource_name",
                "string(64)",
                reference=datasource.columns["name"],
                nullable=False,
                default="myworld",
            ),
            MywDbColumn("feature_name", "string(200)"),
            MywDbColumn("search_val_expr", "string(500)"),
            MywDbColumn("search_desc_expr", "string(500)"),
            MywDbColumn("match_mid", "boolean"),
            MywDbIndex(["datasource_name", "feature_name"]),
        )

        # -------------------------
        #  Layers and Layer Groups
        # -------------------------

        layer = self.db_driver.createTableFrom(
            "myw",
            "layer",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("datasource_name", "string(64)", reference=datasource.columns["name"]),
            MywDbColumn("name", "string(200)"),
            MywDbColumn("category", "string(200)"),
            MywDbColumn("code", "string(100)"),
            MywDbColumn("description", "string(1000)"),
            MywDbColumn("spec", "string(4000)"),
            MywDbColumn("thumbnail", "string(200)"),
            MywDbColumn("min_scale", "integer"),
            MywDbColumn("max_scale", "integer"),
            MywDbColumn("transparency", "integer", nullable=False, default=0),
            MywDbColumn("attribution", "string(500)"),
            MywDbColumn("control_item_class", "string(1000)"),
        )

        layer_feature_item = self.db_driver.createTableFrom(
            "myw",
            "layer_feature_item",
            MywDbColumn("layer_id", "integer", key=True, reference=layer.columns["id"]),
            MywDbColumn("feature_id", "integer", key=True, reference=dd_feature.columns["id"]),
            MywDbColumn(
                "field_name", "string(100)", key=True
            ),  # Note: Nullable in upgraded databases
            MywDbColumn("point_style", "string(500)", nullable=True),
            MywDbColumn("line_style", "string(500)", nullable=True),
            MywDbColumn("fill_style", "string(100)", nullable=True),
            MywDbColumn("text_style", "string(100)", nullable=True),
            MywDbColumn("min_scale", "integer"),
            MywDbColumn("max_scale", "integer"),
            MywDbColumn("filter_name", "string(64)", nullable=True),
        )

        layer_group = self.db_driver.createTableFrom(
            "myw",
            "layer_group",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("name", "string(200)"),
            MywDbColumn("description", "string(1000)"),
            MywDbColumn("thumbnail", "string(200)"),
            MywDbColumn("exclusive", "boolean", nullable=False),
        )

        layer_group_item = self.db_driver.createTableFrom(
            "myw",
            "layer_group_item",
            MywDbColumn("layer_group_id", "integer", key=True, reference=layer_group.columns["id"]),
            MywDbColumn("layer_id", "integer", key=True, reference=layer.columns["id"]),
            MywDbColumn("sequence", "integer", nullable=False),
        )

        # ----------
        #  Networks
        # ----------

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

        # --------------
        #  Applications
        # --------------

        application = self.db_driver.createTableFrom(
            "myw",
            "application",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("name", "string(200)"),
            MywDbColumn("external_name", "string(200)"),
            MywDbColumn("description", "string(1000)"),
            MywDbColumn("image_url", "string(1000)"),
            MywDbColumn("javascript_file", "string(100)"),
            MywDbColumn("for_online_app", "boolean", nullable=False, default=True),
            MywDbColumn("for_native_app", "boolean", nullable=False, default=True),
        )

        application_layer = self.db_driver.createTableFrom(
            "myw",
            "application_layer",
            MywDbColumn("application_id", "integer", key=True, reference=application.columns["id"]),
            MywDbColumn("layer_id", "integer", key=True, reference=layer.columns["id"]),
        )

        # ----------------------
        #  Rights, Roles, Users
        # ----------------------

        right = self.db_driver.createTableFrom(
            "myw",
            "right",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("name", "string(200)"),
            MywDbColumn("description", "string(1000)"),
            MywDbColumn("config", "boolean", default=False, nullable=False),
        )

        role = self.db_driver.createTableFrom(
            "myw",
            "role",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("name", "string(48)"),
            MywDbColumn("description", "string(1000)"),
        )

        permission = self.db_driver.createTableFrom(
            "myw",
            "permission",
            MywDbColumn("role_id", "integer", key=True, reference=role.columns["id"]),
            MywDbColumn("right_id", "integer", key=True, reference=right.columns["id"]),
            MywDbColumn("application_id", "integer", key=True),
        )

        user = self.db_driver.createTableFrom(
            "myw",
            "user",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("username", "string(128)", nullable=False),
            MywDbColumn("email", "string(200)", nullable=True),
            MywDbColumn("password", "string(128)", nullable=False),
            MywDbColumn("locked_out", "boolean", nullable=False),
            MywDbColumn("last_login", "timestamp(timezone)"),
            MywDbColumn("session_id", "string(32)"),
            MywDbConstraint.unique("username"),
        )

        user_role = self.db_driver.createTableFrom(
            "myw",
            "user_role",
            MywDbColumn("user_id", "integer", key=True, reference=user.columns["id"]),
            MywDbColumn("role_id", "integer", key=True, reference=role.columns["id"]),
        )

        # ---------------------------------
        #  Bookmarks and Application State
        # ---------------------------------

        bookmark = self.db_driver.createTableFrom(
            "myw",
            "bookmark",
            MywDbColumn("id", "integer", key=True, generator="sequence"),
            MywDbColumn("myw_search_val1", "string(100)"),
            MywDbColumn("lat", "double"),
            MywDbColumn("lng", "double"),
            MywDbColumn("zoom", "integer"),
            MywDbColumn("map_display", "string(500)"),
            MywDbColumn("is_private", "boolean"),
            MywDbColumn(
                "username", "string(100)"
            ),  # Note: Cannot be foreign key (might be LDAP user)
            MywDbColumn("myw_title", "string(100)"),
            MywDbColumn("myw_short_description", "string(100)"),
            MywDbColumn("myw_search_desc1", "string(100)"),
            MywDbIndex(["myw_search_val1"]),
        )

        user_application = self.db_driver.createTableFrom(  # ENH: Rename as application_state
            "myw",
            "user_application",
            MywDbColumn(
                "username", "string(128)", key=True
            ),  # Note: Cannot be foreign key (might be LDAP user)
            MywDbColumn("application_name", "string(200)", key=True),
            MywDbColumn("state", "string"),
        )

        # ---------------
        #  Notifications
        # ---------------

        notification = self.db_driver.createTableFrom(
            "myw",
            "notification",
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("type", "string(10)", nullable=False),
            MywDbColumn("subject", "string(120)", nullable=False),
            MywDbColumn("details", "string(4000)"),
            MywDbColumn("created", "timestamp", generator="system_now"),
            MywDbColumn("for_online_app", "boolean", nullable=False),
            MywDbColumn("for_native_app", "boolean", nullable=False),
        )

        # --------------
        #  Index Tables
        # --------------

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

        geo_world_point = self.db_driver.createTableFrom(
            "myw",
            "geo_world_point",
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("the_geom", "point"),
            *filter_val_fields,
        )

        geo_world_linestring = self.db_driver.createTableFrom(
            "myw",
            "geo_world_linestring",
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("the_geom", "linestring"),
            *filter_val_fields,
        )

        geo_world_polygon = self.db_driver.createTableFrom(
            "myw",
            "geo_world_polygon",
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("the_geom", "polygon"),
            *filter_val_fields,
        )

        int_world_point = self.db_driver.createTableFrom(
            "myw",
            "int_world_point",
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("myw_world_name", "string(100)"),
            MywDbColumn("the_geom", "point"),
            *filter_val_fields,
        )

        int_world_linestring = self.db_driver.createTableFrom(
            "myw",
            "int_world_linestring",
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("myw_world_name", "string(100)"),
            MywDbColumn("the_geom", "linestring"),
            *filter_val_fields,
        )

        int_world_polygon = self.db_driver.createTableFrom(
            "myw",
            "int_world_polygon",
            MywDbColumn("feature_table", "string(100)", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("field_name", "string(100)", key=True, default="the_geom"),
            MywDbColumn("myw_world_name", "string(100)"),
            MywDbColumn("the_geom", "polygon"),
            *filter_val_fields,
        )

        search_string = self.db_driver.createTableFrom(
            "myw",
            "search_string",
            MywDbColumn("search_rule_id", "integer", key=True),
            MywDbColumn("feature_id", "string(100)", key=True),
            MywDbColumn("feature_name", "string(200)"),
            MywDbColumn("search_val", "string(200)"),
            MywDbColumn("search_desc", "string(500)"),
            MywDbColumn("extra_values", "string(200)"),
            MywDbIndex(["search_val"], type="like"),
            *filter_val_fields,
        )

        # ---------------
        #   Replication
        # ---------------

        table_set = self.db_driver.createTableFrom(
            "myw",
            "table_set",
            MywDbColumn("id", "string(32)", key=True),
            MywDbColumn("description", "string(200)"),
        )

        table_set_layer_item = self.db_driver.createTableFrom(
            "myw",
            "table_set_layer_item",
            MywDbColumn("table_set_id", "string(32)", key=True, reference=table_set.columns["id"]),
            MywDbColumn("layer_id", "integer", key=True, reference=layer.columns["id"]),
            MywDbColumn("on_demand", "boolean", nullable=False, default=False),
            MywDbColumn("updates", "boolean", nullable=False, default=True),
            MywDbColumn("full", "boolean", nullable=False, default=False),
        )

        table_set_tile_file_item = self.db_driver.createTableFrom(
            "myw",
            "table_set_tile_file_item",
            MywDbColumn("table_set_id", "string(32)", key=True, reference=table_set.columns["id"]),
            MywDbColumn("tile_file", "string(200)", key=True),
            MywDbColumn("updates", "boolean", nullable=False),
            MywDbColumn("on_demand", "boolean", nullable=False, default=False),
            MywDbColumn("clip", "boolean", nullable=False),
            MywDbColumn("by_layer", "boolean", nullable=False),
            MywDbColumn("min_zoom", "integer"),
            MywDbColumn("max_zoom", "integer"),
        )

        extract = self.db_driver.createTableFrom(
            "myw",
            "extract",
            MywDbColumn("name", "string(100)", key=True),
            MywDbColumn("region", "string(50)", nullable=True),
            MywDbColumn("table_set", "string(32)", nullable=True),  # ENH: Declare as foreign key
            MywDbColumn("last_export_id", "integer", nullable=True),
            MywDbIndex(["table_set"]),
        )

        replica = self.db_driver.createTableFrom(
            "myw",
            "replica",
            MywDbColumn("id", "string(32)", key=True),
            MywDbColumn("type", "string(100)", nullable=False),
            MywDbColumn("registered", "timestamp", nullable=False),
            MywDbColumn("location", "string()"),
            MywDbColumn("owner", "string(32)"),
            MywDbColumn("n_shards", "integer", nullable=False, default=0),
            MywDbColumn("master_update", "integer"),
            MywDbColumn("last_updated", "timestamp"),
            MywDbColumn("dropped", "timestamp"),
            MywDbColumn("dead", "boolean"),
            MywDbColumn("import_error", "boolean"),
            MywDbIndex(["dead"]),
            MywDbIndex(["import_error", "dead"]),
        )

        replica_shard = self.db_driver.createTableFrom(
            "myw",
            "replica_shard",
            MywDbColumn("replica_id", "string(32)", key=True, reference=replica.columns["id"]),
            MywDbColumn("seq", "integer", key=True),
            MywDbColumn("min_id", "integer"),
            MywDbColumn("max_id", "integer"),
        )

        # --------
        #  Extras
        # --------

        # Add geography indexes to the geometry index tables of Postgres databases
        # ENH: Find a way to do this neatly in the table declaration
        dialect = self.db_driver.dialect_name
        if dialect == "postgresql":
            self.db_driver.addGeographyIndex("myw", "geo_world_point", "the_geom")
            self.db_driver.addGeographyIndex("myw", "geo_world_linestring", "the_geom")
            self.db_driver.addGeographyIndex("myw", "geo_world_polygon", "the_geom")
            self.db_driver.addGeographyIndex("myw", "int_world_point", "the_geom")
            self.db_driver.addGeographyIndex("myw", "int_world_linestring", "the_geom")
            self.db_driver.addGeographyIndex("myw", "int_world_polygon", "the_geom")

    def install_system_triggers(self):
        """
        Create the system table triggers
        """

        self.db_driver.setConfigTriggers("setting", change_log_id_from="name")

        self.db_driver.setConfigTriggers("datasource", change_log_id_from="name")

        self.db_driver.setConfigTriggers("dd_enum", change_log_id_from="name")

        self.db_driver.setConfigTriggers(
            "dd_enum_value", substructure_of="dd_enum", change_log_id_from="enum_name"
        )

        self.db_driver.setConfigTriggers(
            "dd_feature", change_log_id_from="feature_name", log_datasource=True
        )

        self.db_driver.setConfigTriggers(
            "dd_field",
            substructure_of="dd_feature",
            change_log_id_from="table_name",
            log_datasource=True,
        )

        self.db_driver.setConfigTriggers(
            "dd_field_group",
            substructure_of="dd_feature",
            change_log_id_from="feature_name",
            log_datasource=True,
        )

        self.db_driver.setConfigTriggers(
            "dd_field_group_item",
            substructure_of="dd_feature",
            change_log_id_from="feature_name",
            change_log_id_from_table="dd_field_group",
            join_clause="{}.id={}.container_id",
            log_datasource=True,
        )

        self.db_driver.setConfigTriggers(
            "query",
            substructure_of="dd_feature",
            change_log_id_from="myw_object_type",
            log_datasource=True,
        )

        self.db_driver.setConfigTriggers(
            "search_rule",
            substructure_of="dd_feature",
            change_log_id_from="feature_name",
            log_datasource=True,
        )

        self.db_driver.setConfigTriggers(
            "filter",
            substructure_of="dd_feature",
            change_log_id_from="feature_name",
            log_datasource=True,
        )

        self.db_driver.setConfigTriggers(
            "layer", change_log_id_from="name", log_id_update_as_new=True
        )

        self.db_driver.setConfigTriggers(
            "layer_feature_item",
            substructure_of="layer",
            change_log_id_from="name",
            change_log_id_from_table="layer",
            join_clause="{}.id={}.layer_id",
        )

        self.db_driver.setConfigTriggers(
            "layer_group", change_log_id_from="name", log_id_update_as_new=True
        )

        self.db_driver.setConfigTriggers(
            "layer_group_item",
            substructure_of="layer_group",
            change_log_id_from="name",
            change_log_id_from_table="layer_group",
            join_clause="{}.id={}.layer_group_id",
        )

        self.db_driver.setConfigTriggers("network", change_log_id_from="name")

        self.db_driver.setConfigTriggers(
            "network_feature_item", substructure_of="network", change_log_id_from="network_name"
        )

        self.db_driver.setConfigTriggers(
            "application", change_log_id_from="name", log_id_update_as_new=True
        )

        self.db_driver.setConfigTriggers(
            "application_layer",
            substructure_of="application",
            change_log_id_from="name",
            change_log_id_from_table="application",
            join_clause="{}.id={}.application_id",
        )

        self.db_driver.setConfigTriggers(
            "role", change_log_id_from="name", log_id_update_as_new=True
        )

        self.db_driver.setConfigTriggers(
            "permission",
            substructure_of="role",
            change_log_id_from="name",
            change_log_id_from_table="role",
            join_clause="{}.id={}.role_id",
        )

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

    def init_version_stamps(self):
        """
        Set the initial version stamps
        """

        MywVersionStamp = self.rawModelFor("myw", "version_stamp")

        # Create change tracking version stamp
        record = MywVersionStamp(component="data", version=1, date=datetime.datetime.utcnow())
        self.session.add(record)

        self.session.flush()

    # ==============================================================================
    #                         INITIAL CONFIGURATION LOADING
    # ==============================================================================

    @staticmethod
    def install_default_configuration(db, lang, encoding):
        """
        Installs default feature types, layers etc

        DB is a MywDatabase. LANG is the language to localise to
        """
        # Gets called explicitly after upgrade has been run

        # Build message translator
        localiser = MywLocaliser(lang, "myw.install", encoding=encoding)

        # Load config files
        resource_dir = os.path.join(os.path.dirname(__file__), "resources", "install")

        for file_type in [
            "*.rights",
            "*.settings",
            "*.datasource",
            "*.def",
            "*.layer",
            "*.application",
            "*.role",
            "*.user",
        ]:
            file_spec = os.path.join(resource_dir, file_type)

            for file_path in sorted(glob.glob(file_spec)):
                db.data_loader.loadFile(
                    file_path, update=True, localiser=localiser, file_encoding=encoding
                )

        # Remember language option (for upgrades)
        db.setSetting("core.language", lang)

        # Clear transaction logs
        db.pruneTransactionLogs(0)

        db.commit()
