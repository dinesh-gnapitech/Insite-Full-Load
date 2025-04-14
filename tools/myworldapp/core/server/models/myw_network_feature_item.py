################################################################################
# Record exemplar for myw.network_feature_item
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywNetworkFeatureItem(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.network_feature_item
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "network_feature_item")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
