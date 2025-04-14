################################################################################
# Record exemplar for myw.group_item
################################################################################
# Copyright: IQGeo Limited 2010-2023

from sqlalchemy import Column, Boolean

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywGroupItem(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.bookmark
    """

    # ENH: Better as MywGroupMember?

    __tablename__ = MywModelMixin.dbTableName("myw", "group_item")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit column types (for SQLite)
    manager = Column(Boolean)
