################################################################################
# Record exemplar for myw.base_transaction_log
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywBaseTransactionLog(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.base_transaction_log
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "base_transaction_log")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
