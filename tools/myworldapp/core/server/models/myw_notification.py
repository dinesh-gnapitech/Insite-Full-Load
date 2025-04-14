################################################################################
# Record exemplar for myw.notification
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Column, Integer, Boolean
from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywNotification(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.notification
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "notification")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for Oracle & SQLite)
    id = MywModelMixin.keyColumn("myw", "notification", "id", Integer, generator="sequence")
    for_online_app = Column(Boolean, default=True)
    for_native_app = Column(Boolean, default=True)

    def definition(self):
        """
        Self's properties as a dict
        """

        return {
            "id": self.id,
            "type": self.type,
            "subject": self.subject,
            "details": self.details,
            "created": self.created,
            "for_online_app": self.for_online_app,
            "for_native_app": self.for_native_app,
        }
