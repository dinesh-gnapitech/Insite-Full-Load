################################################################################
# Record exemplar for myw.replica
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_replica_shard import MywReplicaShard
from myworldapp.core.server.models.myw_version_stamp import MywVersionStamp


class MywReplica(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.replica
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "replica")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    def definition(self):
        """
        Return self in a serializable format
        """
        return {
            "id": self.id,
            "type": self.type,
            "location": self.location,
            "owner": self.owner,
            "n_shards": self.n_shards,
            "registered": self.registered,
            "last_updated": self.last_updated,
            "master_update": self.master_update,
            "dropped": self.dropped,
            "dead": self.dead,
            "status": self.status,
            "last_import": self.last_import(),
            "last_import_time": self.last_import_time(),
        }

    def substructure(self):
        """
        The records that depend on self
        """

        recs = self.shard_recs

        version_stamp_rec = self.version_stamp_rec
        if version_stamp_rec:
            recs.append(version_stamp_rec)

        return recs

    @property
    def shard_recs(self):
        """
        The myw.replica_shard records owned by self
        """
        query = Session.query(MywReplicaShard).filter(MywReplicaShard.replica_id == self.id)

        return query.all()

    @property
    def allocated_ids(self):
        """
        Total number of ids allocated to self's shards
        """

        n_ids = 0
        for shard_rec in self.shard_recs:
            n_ids += shard_rec.n_ids

        return n_ids

    @property
    def status(self):
        """
        String indicating status of self, one of:
           active    In use
           dropped   No longer in use, may have pending updates to import into master
           dead      No longer in use, all updates in master"""

        if self.dead:
            return "dead"
        if self.dropped != None:
            return "dropped"
        return "active"

    @property
    def version_stamp_name(self):
        """
        Name of version stamp record recording the last import for self
        """

        return self.id + "_data"

    @property
    def version_stamp_rec(self):
        """
        Version stamp record recording the last import for self (if there is one)
        """

        return Session.query(MywVersionStamp).get(self.version_stamp_name)

    def last_import(self):
        """
        Sequence number of most recently imported upload (if any)
        """

        version_stamp = self.version_stamp_rec

        if not version_stamp:
            return None

        return version_stamp.version

    def last_import_time(self):
        """
        Data and time of most recently imported upload (if any)
        """

        version_stamp = self.version_stamp_rec

        if not version_stamp or (version_stamp.version == 0):
            return None

        return version_stamp.date
