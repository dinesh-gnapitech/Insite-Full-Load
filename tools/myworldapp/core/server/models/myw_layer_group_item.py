################################################################################
# Record exemplar for myw.layer_group_item
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywLayerGroupItem(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.layer_group_item
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "layer_group_item")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
