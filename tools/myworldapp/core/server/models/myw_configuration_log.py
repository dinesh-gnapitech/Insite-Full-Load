################################################################################
# Record exemplar for myw.configuration_log
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywConfigurationLog(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.configuration_log
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "configuration_log")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
