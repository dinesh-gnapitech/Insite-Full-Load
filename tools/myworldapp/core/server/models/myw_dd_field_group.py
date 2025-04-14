################################################################################
# Record exemplar for myw.dd_field_group
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Boolean, Column, Integer

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_dd_field_group_item import MywDDFieldGroupItem


class MywDDFieldGroup(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.dd_field_group
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "dd_field_group")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "dd_field_group", "id", Integer, generator="sequence")
    is_expanded = Column(Boolean, default=False)

    def substructure(self):
        """
        The records that depend on self
        """
        return list(self.items())

    def items(self):
        """
        Returns a list with self's values
        """
        return (
            Session.query(MywDDFieldGroupItem)
            .filter(MywDDFieldGroupItem.container_id == self.id)
            .order_by(MywDDFieldGroupItem.display_position)
            .all()
        )

    def field_names(self):
        """
        Returns names of fields in self (in order)
        """

        field_names = []
        for item_rec in list(self.items()):
            field_names.append(item_rec.field_name)

        return field_names
