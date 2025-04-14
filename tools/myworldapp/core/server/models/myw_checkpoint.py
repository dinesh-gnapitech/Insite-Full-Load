################################################################################
# Record exemplar for myw.checkpoint
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywCheckpoint(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.checkpoint
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "checkpoint")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
