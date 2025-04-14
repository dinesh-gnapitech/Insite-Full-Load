################################################################################
# Record exemplar for myw.version_stamp
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywVersionStamp(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.version_stamp
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "version_stamp")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    def definition(self):
        """
        Return self in a serializable format
        """
        return {"component": self.component, "version": self.version, "date": self.date}
