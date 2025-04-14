################################################################################
# Record exemplar for myw.table_set_tile_file_item
################################################################################
# Copyright: IQGeo Limited 2010-2023

from sqlalchemy import Column, Boolean
from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywTableSetTileFileItem(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.table_set_tile_file_item
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "table_set_tile_file_item")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit column types (for SQLite)
    on_demand = Column(Boolean)
    updates = Column(Boolean)
    clip = Column(Boolean)
    by_layer = Column(Boolean)
