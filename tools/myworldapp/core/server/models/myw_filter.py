################################################################################
# Record exemplar for myw.filter
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Integer

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywFilter(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.filter

    Substructure of myw.dd_feature defining a predicate for use in layer filtering"""

    __tablename__ = MywModelMixin.dbTableName("myw", "filter")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "filter", "id", Integer, generator="sequence")

    def definition(self):
        """
        Return self in a serializable format
        """
        props = {"feature_name": self.feature_name, "name": self.name, "value": self.value}
        return props
