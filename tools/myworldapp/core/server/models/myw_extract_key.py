################################################################################
# Record exemplar for myw.extract_key
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywExtractKey(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.extract_key
    Note that this is kept separate from the extract info, as we don't want to include this in created extracts
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "extract_key")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
