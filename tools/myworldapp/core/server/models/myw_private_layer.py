################################################################################
# Record exemplar for myw.private_layer
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json
from collections import OrderedDict
from myworldapp.core.server.models.base import ModelBase, MywModelMixin


class MywPrivateLayer(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.user_group
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "private_layer")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    def definition(self, include_id=False):
        """
        Return self in a serializable format
        """

        layer_def = OrderedDict()
        layer_def["owner"] = self.owner
        layer_def["name"] = self.name
        layer_def["sharing"] = self.sharing
        layer_def["datasource_spec"] = self.json_from_db("datasource_spec")
        layer_def["category"] = self.category
        layer_def["description"] = self.description
        layer_def["spec"] = self.json_from_db("spec")
        layer_def["thumbnail"] = self.thumbnail
        layer_def["min_scale"] = self.min_scale
        layer_def["max_scale"] = self.max_scale
        layer_def["transparency"] = self.transparency
        layer_def["attribution"] = self.attribution
        layer_def["control_item_class"] = self.control_item_class

        if include_id:
            layer_def["id"] = self.id

        return layer_def

    def type(self):
        """
        String representing self's type (for display in GUI)
        """

        return self.datasource_type()  # ENH: Add layer specific stuff (tile type etc)

    def datasource_type(self):
        """
        Type of self's datasource
        """

        return self.get_json_property("datasource_spec", "type")

    def setId(self):
        """
        Constructs self's ID from name owner and name fields

        Note: Uses a 'natural key' to ensure private_layers preserved over feature dump/load.
        Combines owner and name into single field to make transaction logging easier"""

        self.id = self.owner + ":" + self.name

    def get_json_property(self, field, name):
        """
        Returns the value of property NAME from JSON field FIELD (if present)
        """

        value = self.json_from_db(field)

        return value.get(name)

    def json_from_db(self, field):
        """
        Self's json field FIELD (as a dict)
        """
        # ENH: Could cache this

        value_str = self[field]

        if not value_str:
            return {}

        return json.loads(value_str)
