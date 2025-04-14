################################################################################
# Record exemplar for myw.extract_config
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywExtractConfig(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.extract_config
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "extract_config")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
