################################################################################
# Record exemplar for myw.dd_enum_value
################################################################################
# Copyright: IQGeo Limited 2010-2023

from sqlalchemy import Integer

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywDDEnumValue(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.application
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "dd_enum_value")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    id = MywModelMixin.keyColumn("myw", "dd_enum_value", "id", Integer, generator="sequence")
