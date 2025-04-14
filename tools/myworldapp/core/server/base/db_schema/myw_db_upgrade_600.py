################################################################################
# myWorld database upgrade 600
################################################################################
# Copyright: IQGeo Limited 2010-2023

from .myw_db_upgrade import MywDbUpgrade

# Release 5.2 introduced changes to trigger building - references new column search_rule.lang
from .db_drivers_510.myw_db_driver import MywDbDriver as MywDbDriver510


class MywDbUpgrade600(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 5.2 to 6.0
    """

    # Constants
    db_driver_class = MywDbDriver510
    schema_vs_name = "myw_schema"
    from_version = 50007

    updates = {
        60001: "add_config_pages_setting",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def add_config_pages_setting(self):
        """
        Add the setting for the unit system in the database
        """

        MywSetting = self.rawModelFor("myw", "setting")

        rec = MywSetting(name="core.unitSystem", type="STRING", value="metric")

        self.session.add(rec)
