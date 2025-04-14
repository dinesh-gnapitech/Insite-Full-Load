################################################################################
# myWorld database upgrade 630
################################################################################
# Copyright: IQGeo Limited 2010-2023


from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn
from .myw_db_upgrade import MywDbUpgrade


class MywDbUpgrade630(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 6.2 to 6.3
    """

    # Constants
    schema_vs_name = "myw_schema"
    from_version = 62001

    updates = {
        63001: "extend_multi_lang_fields",
        63002: "extend_feature_editor_configuration",
        63003: "extend_checkpoint_name_field",
        63004: "add_dd_feature_geom_indexed",
        63005: "extend_dd_field_type",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def extend_multi_lang_fields(self):
        """
        Extend fields in DD to cope with multi-language strings (for database localisation)
        """

        self.db_driver.alterColumn(
            "myw",
            "application",
            MywDbColumn("description", "string(1000)"),
            MywDbColumn("description", "string(5000)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "dd_feature",
            MywDbColumn("title_expr", "string(200)"),
            MywDbColumn("title_expr", "string(1000)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "dd_feature",
            MywDbColumn("short_description_expr", "string(200)"),
            MywDbColumn("short_description_expr", "string(1000)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "layer",
            MywDbColumn("description", "string(1000)"),
            MywDbColumn("description", "string(5000)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "layer_group",
            MywDbColumn("description", "string(1000)"),
            MywDbColumn("description", "string(5000)"),
        )

    def extend_feature_editor_configuration(self):
        """
        Changes to support to support enhanced Forms.
        field_dd: adds 'visible', 'new_row' and modifies 'mandatory', 'read_only'
         dd_field_group_item: adds 'visible'
        """

        self.db_driver.addColumn("myw", "dd_feature", MywDbColumn("editor_options", "json"))

        self.db_driver.alterColumn(
            "myw",
            "dd_field",
            MywDbColumn("mandatory", "boolean"),
            MywDbColumn("mandatory", "string(2000)", default="false"),
        )

        self.db_driver.alterColumn(
            "myw",
            "dd_field",
            MywDbColumn("read_only", "boolean"),
            MywDbColumn("read_only", "string(2000)", default="false"),
        )

        self.db_driver.addColumn(
            "myw", "dd_field", MywDbColumn("visible", "string(2000)", default="true")
        )
        self.db_driver.addColumn("myw", "dd_field", MywDbColumn("new_row", "boolean", default=True))
        self.db_driver.addColumn("myw", "dd_field", MywDbColumn("validators", "json"))

        self.db_driver.addColumn(
            "myw", "dd_field_group", MywDbColumn("visible", "string(2000)", default="true")
        )

    def extend_checkpoint_name_field(self):
        """
        Changes to fix a bug in extracts.
        checkpoint: increases the length of the 'name' property, which is automaticaly populated.
        """

        # Note, the length of the column always needs to exceed that of myw.extract.name + 15,
        # which is 100 (+15) at this version.
        self.db_driver.alterColumn(
            "myw",
            "checkpoint",
            MywDbColumn("name", "string(63)", nullable=False),
            MywDbColumn("name", "string(200)", nullable=False),
        )

    def add_dd_feature_geom_indexed(self):
        """
        Add support for disabling the geom index on specific feature tables.
        checkpoint: increases the length of the 'name' property, which is automaticaly populated.
        """

        self.db_driver.addColumn(
            "myw", "dd_feature", MywDbColumn("geom_indexed", "boolean", default=True)
        )

    def extend_dd_field_type(self):
        """
        We allowed specifying of feature types to restrict reference and reference_set fields by
        checkpoint: increases the length of the 'name' property, which is automaticaly populated.
        """

        # Note, the length of the column always needs to exceed that of myw.extract.name + 15,
        # which is 100 (+15) at this version.
        self.db_driver.alterColumn(
            "myw",
            "dd_field",
            MywDbColumn("type", "string(230)", nullable=False),
            MywDbColumn("type", "string(2000)", nullable=False),
        )
