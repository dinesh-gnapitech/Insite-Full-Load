################################################################################
# Record exemplar for myw.search_string
################################################################################
# Copyright: IQGeo Limited 2010-2023


from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywSearchString(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.search_string
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "search_string")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
