################################################################################
# Record exemplar for myw.layer_group
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import re
from sqlalchemy import Boolean, Column, Integer
from collections import OrderedDict

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_layer_group_item import MywLayerGroupItem
from myworldapp.core.server.models.myw_layer import MywLayer


class MywLayerGroup(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.layer_group
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "layer_group")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "layer_group", "id", Integer, generator="sequence")
    exclusive = Column(Boolean)

    def set_backstops(self):
        """
        Set backstop values for unpopulated fields
        """
        # ENH: Find a way to get this called automatically

        if self.display_name:  # pylint: disable=access-member-before-definition
            return

        # if self.name is styles as an internal name, then format the display_name
        # otherwise copy name into display_name
        if re.match("^[a-z0-9_]*$", self.name):
            self.display_name = self.name.replace("_", " ").title()
        else:
            self.display_name = self.name

    @property
    def item_recs(self):
        """
        The layer_group_item records for self
        """

        return Session.query(MywLayerGroupItem).filter(MywLayerGroupItem.layer_group_id == self.id)

    def substructure(self):
        """
        The records that depend on self
        """

        return self.item_recs.all()

    def serialise(self, includeId=False):
        """
        Self's definition as a dict

        Also defines the format of the .layer_group file"""

        # Note: Uses ordered dict just to keep dump files neat

        defn = OrderedDict()

        if includeId is True:
            defn["id"] = self.id  # Since 'id' is only required for config pages

        defn["name"] = self.name
        defn["display_name"] = self.display_name
        defn["description"] = self.description or ""
        defn["thumbnail"] = self.thumbnail or ""
        defn["exclusive"] = self.exclusive
        defn["layers"] = self.layerNames()

        return defn

    def layerNames(self):
        """
        Names of the layers of self (in order)
        """

        name_proc = lambda rec: rec.name

        return list(map(name_proc, self.layerRecs()))

    def layerRecs(self):
        """
        The layer records of self
        """

        layer_recs = []

        # ENH: Faster to use a join
        for int_rec in self.item_recs.order_by(MywLayerGroupItem.sequence).all():
            layer_rec = Session.query(MywLayer).get(int_rec.layer_id)
            layer_recs.append(layer_rec)

        return layer_recs

    def setLayers(self, layer_names):
        """
        Set the layers associated with self

        Returns True if anything changed"""

        # Check for nothing to do
        if layer_names == self.layerNames():
            return False

        # Delete old intermediate records
        for item_rec in self.item_recs:
            Session.delete(item_rec)

        # Create new ones
        seq = 1
        for layer_name in layer_names:
            layer_rec = Session.query(MywLayer).filter(MywLayer.name == layer_name).first()

            # ENH: Skip bad names with warning
            if not layer_rec:
                raise MywError("Layer does not exist: " + layer_name)

            int_rec = MywLayerGroupItem(layer_group_id=self.id, layer_id=layer_rec.id, sequence=seq)

            seq += 1

            Session.add(int_rec)

        Session.flush()

        return True
