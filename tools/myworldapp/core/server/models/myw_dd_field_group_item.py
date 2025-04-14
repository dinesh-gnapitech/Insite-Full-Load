################################################################################
# Record exemplar for myw.dd_field_group_item
################################################################################
# Copyright: IQGeo Limited 2010-2023

from sqlalchemy import Integer

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywDDFieldGroupItem(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.dd_field_group_item
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "dd_field_group_item")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "dd_field_group_item", "id", Integer, generator="sequence")
