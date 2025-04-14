################################################################################
# Record exemplar for myw.user_role
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywUserRole(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.user_role
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "user_role")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
