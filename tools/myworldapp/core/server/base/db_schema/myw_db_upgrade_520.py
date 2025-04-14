################################################################################
# myWorld database upgrade 520
################################################################################
# Copyright: IQGeo Limited 2010-2023


from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn, MywDbIndex
from .myw_db_upgrade import MywDbUpgrade


class MywDbUpgrade520(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 5.1 to 5.2
    """

    # Constants
    schema_vs_name = "myw_schema"
    from_version = 51004

    updates = {
        52001: "layer_add_display_name_field",
        52002: "layer_populate_display_name_field",
        52003: "extracts_add_include_deltas_field",
        52004: "search_rule_add_lang",
        52005: "query_add_lang",
        52006: "application_layer_add_read_only",
        52007: "application_layer_add_snap",
        52008: "extracts_authenticated",
        52009: "extend_external_names",
        52010: "ensure_lang",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def layer_add_display_name_field(self):
        """
        Add a display_name field to myw.layer (for localisation)
        """

        self.db_driver.addColumn("myw", "layer", MywDbColumn("display_name", "string(1000)"))
        self.db_driver.addColumn("myw", "layer_group", MywDbColumn("display_name", "string(1000)"))

    def layer_populate_display_name_field(self):
        """
        Copy the contents of the value field into the display_name field
        (for backwards compatibility)
        """

        MywLayer = self.rawModelFor("myw", "layer")

        for rec in self.session.query(MywLayer):
            rec.display_name = rec.name

        MywLayerGroup = self.rawModelFor("myw", "layer_group")

        for rec in self.session.query(MywLayerGroup):
            rec.display_name = rec.name

    def extracts_add_include_deltas_field(self):
        """
        Add 'include_deltas' field to myw.extract for optional deltas
        """

        self.db_driver.addColumn(
            "myw", "extract", MywDbColumn("include_deltas", "boolean", default=False)
        )

    def search_rule_add_lang(self):
        """
        Adds 'lang' field to myw.search_rule
        """

        self.db_driver.addColumn(
            "myw", "search_rule", MywDbColumn("lang", "string(5)", default=self.lang)
        )

        MywSearchRule = self.rawModelFor("myw", "search_rule")

        for rec in self.session.query(MywSearchRule):
            rec.lang = self.lang

    def query_add_lang(self):
        """
        Adds 'lang' field to myw.query
        """

        self.db_driver.addColumn(
            "myw", "query", MywDbColumn("lang", "string(5)", default=self.lang)
        )

        MywQuery = self.rawModelFor("myw", "query")

        for rec in self.session.query(MywQuery):
            rec.lang = self.lang

    def application_layer_add_read_only(self):
        """
        Adds read_only field onto the myw.application_layer table
        """

        self.db_driver.addColumn(
            "myw", "application_layer", MywDbColumn("read_only", "boolean", default=False)
        )

    def application_layer_add_snap(self):
        """
        Adds snap field onto the myw.application_layer table
        """

        self.db_driver.addColumn(
            "myw", "application_layer", MywDbColumn("snap", "boolean", default=False)
        )

    def extracts_authenticated(self):
        """
        Adds the extract_config table
        """
        extract_role_item = self.db_driver.createTableFrom(
            "myw",
            "extract_config",
            # includes an id key column because we can't have role_name as key while being nullable
            MywDbColumn("id", "integer", generator="sequence", key=True),
            MywDbColumn("extract_name", "string(100)", nullable=False),
            MywDbColumn("role_name", "string(48)", nullable=True),
            MywDbColumn("folder_name", "string(260)"),
            MywDbColumn("expiry_time", "timestamp", nullable=True),
            MywDbColumn("writable_by_default", "boolean", nullable=False, default=False),
            MywDbIndex(["extract_name"]),
        )

    def extend_external_names(self):
        """
        Extend fields in DD to cope with multi-language strings for external/display names (for database localisation)
        """
        self.db_driver.alterColumn(
            "myw",
            "application",
            MywDbColumn("external_name", "string(200)"),
            MywDbColumn("external_name", "string(1000)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "datasource",
            MywDbColumn("external_name", "string(64)"),
            MywDbColumn("external_name", "string(500)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "dd_feature",
            MywDbColumn("external_name", "string(200)"),
            MywDbColumn("external_name", "string(1000)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "dd_field",
            MywDbColumn("external_name", "string(200)"),
            MywDbColumn("external_name", "string(1000)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "dd_field_group",
            MywDbColumn("display_name", "string(100)"),
            MywDbColumn("display_name", "string(500)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "network",
            MywDbColumn("external_name", "string(64)"),
            MywDbColumn("external_name", "string(500)"),
        )

    def ensure_lang(self):
        """
        Ensures values for search_rule.lang and query.lang as (pre_patch) upgrade command didn't ensure a value for it in 52004 and 52005
        """

        MywSearchRule = self.rawModelFor("myw", "search_rule")
        for rec in self.session.query(MywSearchRule).filter(MywSearchRule.lang == None):
            rec.lang = self.lang

        MywQuery = self.rawModelFor("myw", "query")
        for rec in self.session.query(MywQuery).filter(MywQuery.lang == None):
            rec.lang = self.lang
