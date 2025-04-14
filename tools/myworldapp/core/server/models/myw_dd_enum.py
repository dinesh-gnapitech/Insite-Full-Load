################################################################################
# Record exemplar for myw.dd_enum
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from collections import OrderedDict
from sqlalchemy import String

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_dd_enum_value import MywDDEnumValue


class MywDDEnum(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.dd_enum
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "dd_enum")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    name = MywModelMixin.keyColumn("myw", "dd_enum", "id", String(100))

    @property
    def value_recs(self):
        """
        Qurey yielding self's value records
        """

        return Session.query(MywDDEnumValue).filter(MywDDEnumValue.enum_name == self.name)

    def substructure(self):
        """
        The records that depend on self
        """
        return self.value_recs

    def definition(self):
        """
        Return self in a serializable format
        """

        values = []
        for rec in self.value_recs.order_by(MywDDEnumValue.position):

            enum_value = OrderedDict()
            enum_value["value"] = rec.value
            enum_value["display_value"] = rec.display_value or rec.value

            values.append(enum_value)

        enum_def = OrderedDict()
        enum_def["name"] = self.name
        enum_def["description"] = self.description
        enum_def["values"] = values

        return enum_def
