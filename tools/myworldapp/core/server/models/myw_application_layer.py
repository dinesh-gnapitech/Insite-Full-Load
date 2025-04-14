################################################################################
# Record exemplar for myw.application_layer
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywApplicationLayer(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.application_layer
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "application_layer")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    def definition(self):
        """
        Return self in a serializable format
        """
        return {"id": self.layer_id, "read_only": self.read_only, "snap": self.snap}
