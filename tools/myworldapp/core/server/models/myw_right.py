################################################################################
# Record exemplar for myw.right
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Integer, Boolean, Column
from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywRight(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.right
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "right")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "right", "id", Integer, generator="sequence")
    config = Column(Boolean)

    # Note: role property is defined in myw_permission through a relationship backref

    def definition(self):
        """
        Return self in a serializable format
        """
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "config": self.config,
        }
