################################################################################
# myWorld database upgrade 620
################################################################################
# Copyright: IQGeo Limited 2010-2023


from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn
from .myw_db_upgrade import MywDbUpgrade

# Release 5.2 introduced changes to trigger building - references new column search_rule.lang
from .db_drivers_510.myw_db_driver import MywDbDriver as MywDbDriver510


class MywDbUpgrade620(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 6.1 to 6.2
    """

    # Constants
    db_driver_class = MywDbDriver510
    schema_vs_name = "myw_schema"
    from_version = 61004

    updates = {
        62001: "add_new_layer_column",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def add_new_layer_column(self):
        """
        Adds a new column to the layer table to record the render order of the layers
        """

        self.db_driver.addColumn("myw", "layer", MywDbColumn("render_order", "integer"))
