################################################################################
# Record exemplar for myw.query
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Integer

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywQuery(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.query
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "query")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "query", "id", Integer, generator="sequence")

    def definition(self):
        """
        Return self in a serializable format
        """
        props = {
            "feature_name": self.myw_object_type,
            "myw_search_val1": self.myw_search_val1,
            "myw_search_desc1": self.myw_search_desc1,
            "attrib_query": self.attrib_query,
            "lang": self.lang,
        }
        return props
