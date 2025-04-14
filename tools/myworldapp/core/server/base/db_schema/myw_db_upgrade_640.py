################################################################################
# myWorld database upgrade 640
################################################################################
# Copyright: IQGeo Limited 2010-2023


from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn
from .myw_db_upgrade import MywDbUpgrade


class MywDbUpgrade640(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 6.3 to 6.4
    """

    # Constants
    schema_vs_name = "myw_schema"
    from_version = 63005

    updates = {
        64001: "add_bulk_update_rights",
        64002: "add_fine_grained_permissions",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def add_bulk_update_rights(self):
        """
        Add the new Right for defining who can bulk-update features.
        """
        from myworldapp.core.server.base.system.myw_localiser import MywLocaliser

        # Set backstop for language setting
        if not self.lang:
            self.lang = "en"

        localiser = MywLocaliser(self.lang, "myw.install", encoding=self.encoding)

        MywRight = self.rawModelFor("myw", "right")

        # Note, an earlier version of this migration set `config=True` on this entry, which is
        # incorrect.
        rec = MywRight(
            name="bulkEditFeatures",
            description=localiser.msg("install", "bulk_edit_features_right_desc"),
        )

        self.session.add(rec)

    def add_fine_grained_permissions(self):
        """
        Add space for fine-grained permissions data to be stored.
        """

        self.db_driver.addColumn(
            "myw", "permission", MywDbColumn("restrictions", "json", default=None)
        )
