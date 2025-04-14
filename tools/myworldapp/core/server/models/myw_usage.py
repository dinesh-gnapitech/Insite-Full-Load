################################################################################
# Record exemplar for myw.usage
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Integer
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin

from .myw_usage_item import MywUsageItem


class MywUsage(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.bookmark
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "usage")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    id = MywModelMixin.keyColumn("myw", "usage", "id", Integer, generator="sequence")

    @property
    def item_recs(self):
        """
        Query yielding action records of self
        """

        return Session.query(MywUsageItem).filter(MywUsageItem.usage_id == self.id)

    def definition(self):
        """
        Return self in a serializable format
        """

        return {"id": self.id, "username": self.username, "client": self.client}
