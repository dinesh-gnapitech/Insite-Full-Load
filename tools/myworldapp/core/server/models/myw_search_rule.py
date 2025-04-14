################################################################################
#  Record exemplar for myw.search_rule
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Boolean, Column, Integer

from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywSearchRule(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.search_rule
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "search_rule")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "search_rule", "id", Integer, generator="sequence")
    match_mid = Column(Boolean)

    def definition(self):
        """
        Return self in a serializable format
        """
        props = {
            "feature_name": self.feature_name,
            "search_val_expr": self.search_val_expr,
            "search_desc_expr": self.search_desc_expr,
            "lang": self.lang,
        }
        return props
