################################################################################
# Record exemplar for myw.replica_shard
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywReplicaShard(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.replica_shard
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "replica_shard")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    @property
    def n_ids(self):
        """
        The number of IDs in self
        """

        return (self.max_id - self.min_id) + 1
