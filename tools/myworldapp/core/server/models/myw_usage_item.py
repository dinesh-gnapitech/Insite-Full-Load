################################################################################
# Record exemplar for myw.usage_item
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywUsageItem(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.bookmark
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "usage_item")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    def definition(self):
        """
        Return self in a serializable format
        """

        return {
            "application_name": self.application_name,
            "action": self.action,
            "count": self.count,
        }
