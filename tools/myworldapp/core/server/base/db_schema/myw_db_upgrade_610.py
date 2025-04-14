################################################################################
# myWorld database upgrade 610
################################################################################
# Copyright: IQGeo Limited 2010-2023


from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn
from .myw_db_upgrade import MywDbUpgrade

# Release 5.2 introduced changes to trigger building - references new column search_rule.lang
from .db_drivers_510.myw_db_driver import MywDbDriver as MywDbDriver510


class MywDbUpgrade610(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 6.0 to 6.1
    """

    # Constants
    db_driver_class = MywDbDriver510
    schema_vs_name = "myw_schema"
    from_version = 60001

    updates = {
        61001: "add_internetStatus_imgUrl_setting",
        61002: "extend_layer_style_field",
        61003: "add_new_dd_field_columns",
        61004: "extend_transaction_log_feature_id",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def add_internetStatus_imgUrl_setting(self):
        """
        Add the setting for the image used to check internet status
        """

        MywSetting = self.rawModelFor("myw", "setting")

        rec = MywSetting(
            name="core.internetStatus.imgUrl",
            type="STRING",
            value="https://www.google.com/images/google_favicon_128.png",
        )

        self.session.add(rec)

    def extend_layer_style_field(self):
        """
        Extend field in layer_feature_item style columns to hold bigger values since we are incorporating lookup styles
        """
        self.db_driver.alterColumn(
            "myw",
            "layer_feature_item",
            MywDbColumn("point_style", "string(500)"),
            MywDbColumn("point_style", "string(4000)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "layer_feature_item",
            MywDbColumn("line_style", "string(500)"),
            MywDbColumn("line_style", "string(4000)"),
        )

        self.db_driver.alterColumn(
            "myw",
            "layer_feature_item",
            MywDbColumn("fill_style", "string(100)"),
            MywDbColumn("fill_style", "string(4000)"),
        )

    def add_new_dd_field_columns(self):
        """
        Adds new columns to the dd_field to be used to customise the field appearance and behaviour in the feature viewer and form
        """

        self.db_driver.addColumn("myw", "dd_field", MywDbColumn("read_only", "boolean"))
        self.db_driver.addColumn("myw", "dd_field", MywDbColumn("viewer_class", "string(1000)"))
        self.db_driver.addColumn("myw", "dd_field", MywDbColumn("editor_class", "string(1000)"))

    def extend_transaction_log_feature_id(self):
        """
        Extend field in layer_feature_item style columns to hold bigger values since we are incorporating lookup styles
        """
        self.db_driver.alterColumn(
            "myw",
            "transaction_log",
            MywDbColumn("feature_id", "string(100)"),
            MywDbColumn("feature_id", "string(256)"),
        )
