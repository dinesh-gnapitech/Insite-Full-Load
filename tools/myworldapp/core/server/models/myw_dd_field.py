################################################################################
# Record exemplar for myw.dd_field
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Boolean, Column, Integer, JSON

from myworldapp.core.server.base.db.myw_db_meta import MywDbType
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.base.db.globals import Session


class MywDDField(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.dd_field
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "dd_field")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "dd_field", "id", Integer, generator="sequence")
    indexed = Column(Boolean)
    validators = Column(JSON(none_as_null=True))

    @property
    def type_desc(self):
        """
        Descriptor for self's database type (a MywDbType)
        """

        return MywDbType(self.type)

    # ==============================================================================
    #                                    VALIDATION
    # ==============================================================================

    def validate(self, enum_names, unit_defs):
        """
        Check self's integrity

        Yields a error message for each problem found"""

        # Check enumerator valid
        if self.enum:
            parts = self.enum.split(".")
            if len(parts) > 1:
                feature_name = parts[0]
                if not Session.myw_db_driver.tableExists("data", feature_name):
                    yield "Bad enumerator: {}".format(self.enum)
            elif not (self.enum in enum_names):
                yield "Bad enumerator: {}".format(self.enum)

        # Check unit info valid
        if self.unit_scale:
            unit_scale_def = unit_defs.get(self.unit_scale)

            if not unit_scale_def:
                yield "Bad unit scale: {}".format(self.unit_scale)

            else:
                if not self.unit in unit_scale_def["units"]:
                    yield "Bad stored unit: {} : {}".format(self.unit_scale, self.unit)

                if not self.display_unit in unit_scale_def["units"]:
                    yield "Bad display unit: {} : {}".format(self.unit_scale, self.display_unit)

        # ENH: Check ranges valid etc
