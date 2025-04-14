################################################################################
# Record exemplar for myw.extract
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.base.core.myw_error import MywError


class MywExtract(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.extract
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "extract")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if "name" in kwargs:
            name = kwargs["name"]
            size = self.__table__.columns["name"].type.impl.length
            if len(name) > size:
                raise MywError(f"Extract name '{name}' is too long (max {size} characters).")

    @property
    def checkpoint_name(self):
        """
        Name of checkpoint used to identify database state of most recent export
        """

        return "extract_" + self.name + "_export"
