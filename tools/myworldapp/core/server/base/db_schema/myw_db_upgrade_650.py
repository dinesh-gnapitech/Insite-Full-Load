################################################################################
# myWorld database upgrade 650
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json
from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn
from .myw_db_upgrade import MywDbUpgrade
from sqlalchemy import or_


class MywDbUpgrade650(MywDbUpgrade):
    """
    Upgrade core data-model from myworld 6.4 to 6.5
    """

    # Constants
    schema_vs_name = "myw_schema"
    from_version = 64002

    updates = {
        65001: "add_creates_world_type",
        65002: "set_primary_geom_mandatory",
        65003: "extend_layer_text_style_field",
        65004: "extend_field_group_item_field",
        65005: "set_reference_fields_readonly",
        65006: "add_geo_map_custom_options_settings",
    }

    supports_dry_run = False

    # ==============================================================================
    #                                   UPDATES
    # ==============================================================================

    def add_creates_world_type(self):
        """
        Add a field spec column for geom fields which create a world type.
        """

        self.db_driver.addColumn(
            "myw", "dd_field", MywDbColumn("creates_world_type", "string", default=None)
        )

    def set_primary_geom_mandatory(self):
        """
        Sets the first geom for all myworld features as mandatory
        This is to keep the existing behaviour since we are now interpreting whether a geometry is required via the mandatory field
        """
        MywDDFeature = self.rawModelFor("myw", "dd_feature")
        MywDDField = self.rawModelFor("myw", "dd_field")

        myworld_features = self.session.query(MywDDFeature).filter(
            (MywDDFeature.datasource_name == "myworld")
        )
        for rec in myworld_features:
            first_geom_field = (
                self.session.query(MywDDField)
                .filter(MywDDField.table_name == rec.feature_name)
                .filter(
                    or_(
                        MywDDField.type == "point",
                        MywDDField.type == "linestring",
                        MywDDField.type == "polygon",
                    )
                )
                .first()
            )

            if first_geom_field:
                first_geom_field.mandatory = True

    def extend_layer_text_style_field(self):
        """
        Extend field in layer_feature_item text style column to hold bigger values since we are incorporating lookup styles
        """
        self.db_driver.alterColumn(
            "myw",
            "layer_feature_item",
            MywDbColumn("text_style", "string(100)"),
            MywDbColumn("text_style", "string(4000)"),
        )

    def extend_field_group_item_field(self):
        """
        Make the field_name column field bigger to house JSONs for section separators
        """
        self.db_driver.alterColumn(
            "myw",
            "dd_field_group_item",
            MywDbColumn("field_name", "string(100)"),
            MywDbColumn("field_name", "string(4000)"),
        )

    def set_reference_fields_readonly(self):
        """
        Sets the reference, foreign_key and reference_set feilds for all myworld features
        as readonly unless they have an editorClass defined
        """
        MywDDField = self.rawModelFor("myw", "dd_field")

        reference_field_query = (
            self.session.query(MywDDField)
            .filter(MywDDField.datasource_name == "myworld")
            .filter(
                or_(
                    MywDDField.type == "reference",
                    MywDDField.type == "reference_set",
                    MywDDField.type.like("foreign_key%"),
                )
            )
            .filter(MywDDField.read_only == "false")
            .filter(MywDDField.editor_class.is_(None))
        )
        # synchronize session set to false to allow the evaluation on the like clause
        reference_field_query.update({MywDDField.read_only: "true"}, synchronize_session=False)

    def add_geo_map_custom_options_settings(self):
        """
        Add the setting for geo map custom options
        """

        MywSetting = self.rawModelFor("myw", "setting")

        default_value = {"viewOptions": {"enableRotation": True}}

        rec = MywSetting(
            name="core.map.options",
            type="JSON",
            value=json.dumps(default_value),
        )

        self.session.add(rec)
