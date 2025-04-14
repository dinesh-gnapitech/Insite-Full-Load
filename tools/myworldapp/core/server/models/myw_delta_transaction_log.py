################################################################################
# Record exemplar for myw.delta_transaction_log
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywDeltaTransactionLog(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.delta_transaction_log
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "delta_transaction_log")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
