################################################################################
# Record exemplar for myw.application_state
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywApplicationState(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.application_state
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "application_state")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
