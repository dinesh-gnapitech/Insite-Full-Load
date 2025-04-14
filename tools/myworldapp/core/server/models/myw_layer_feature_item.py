################################################################################
# Record exemplar for myw.layer_feature_item
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywLayerFeatureItem(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.layer_feature_item
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "layer_feature_item")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    @property
    def layer_rec(self):
        """
        The layer record to which self relates
        """
        # Note: Relationship is foreign key so result can never be null

        from myworldapp.core.server.models.myw_layer import MywLayer

        return Session.query(MywLayer).get(self.layer_id)

    @property
    def feature_rec(self):
        """
        The feature record to which self relates
        """
        # Note: Relationship is foreign key so result can never be null

        from myworldapp.core.server.models.myw_dd_feature import MywDDFeature

        return Session.query(MywDDFeature).get(self.feature_id)
