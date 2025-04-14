################################################################################
# Record exemplar for myw.table_set_layer_item
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Column, Boolean
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywTableSetLayerItem(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.table_set_layer_item
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "table_set_layer_item")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit column types (for SQLite)
    on_demand = Column(Boolean)
    updates = Column(Boolean)

    @property
    def layer_rec(self):
        """
        The layer record for self
        """

        from myworldapp.core.server.models.myw_layer import MywLayer

        return Session.query(MywLayer).get(self.layer_id)
