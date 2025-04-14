################################################################################
# Record exemplar for myw.configuration_task
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywConfigurationTask(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.configuration_task
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "configuration_task")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
