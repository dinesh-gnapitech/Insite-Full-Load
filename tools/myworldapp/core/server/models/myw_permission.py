################################################################################
# Record exemplar for myw.permission
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Column, JSON

from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_right import MywRight
from myworldapp.core.server.base.core.myw_error import MywError


class MywPermission(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.permission
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "permission")
    __table_args__ = MywModelMixin.dbTableArgs("myw")
    # Set explicit column types (for SQLite)
    restrictions = Column("restrictions", type_=JSON(none_as_null=True), default=None)

    def assertValid(self, warnings_progress=None):
        # None is always valid.
        if self.restrictions is not None:
            edit_features_right_id = (
                Session.query(MywRight).filter(MywRight.name == "editFeatures").first().id
            )
            if self.right_id != edit_features_right_id:
                right_name = (
                    Session.query(MywRight).filter(MywRight.id == self.right_id).first().name
                )
                raise MywError(
                    f'Permission Restrictions ({self.restrictions}) not allowed on "{right_name}"'
                )
            # We can't just iterate to test this, since that would admit strings and dicts with
            # string keys (all valid JSON!)
            if not isinstance(self.restrictions, list):
                raise MywError(
                    f'"editFeatures" restriction must be an array of feature names, not {self.restrictions!r}'
                )

            for item in self.restrictions:
                if not isinstance(item, str):
                    raise MywError(f'"editFeatures" restriction must be a feature name, not {item}')
