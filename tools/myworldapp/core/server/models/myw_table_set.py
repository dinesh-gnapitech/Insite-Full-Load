################################################################################
# Record exemplar for myw.table_set
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import os, copy
from collections import OrderedDict

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.utils import replace_env_variables_in
from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_layer import MywLayer
from myworldapp.core.server.models.myw_table_set_layer_item import MywTableSetLayerItem
from myworldapp.core.server.models.myw_table_set_tile_file_item import MywTableSetTileFileItem


class MywTableSet(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.table_set
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "table_set")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # ==============================================================================
    #                                 SUBSTRUCTURE
    # ==============================================================================

    @property
    def layer_item_recs(self):
        """
        Query yielding the layer item records of self

        These records define the layers whose features and tiles are to be extracted and synced"""

        return Session.query(MywTableSetLayerItem).filter(
            MywTableSetLayerItem.table_set_id == self.id
        )

    @property
    def tile_file_item_recs(self):
        """
        Query yielding the feature item records of self

        These records define the tile files to be extracted and synced"""

        return Session.query(MywTableSetTileFileItem).filter(
            MywTableSetTileFileItem.table_set_id == self.id
        )

    def substructure(self):
        """
        The records that depend on self
        """
        return self.layer_item_recs.all() + self.tile_file_item_recs.all()

    # ==============================================================================
    #                                 SERIALISATION
    # ==============================================================================

    def definition(self, expand_env_vars=False):
        """
        Self's definition as a dict

        If optional EXPAND_ENV_VARS is true, expand environment varaibles in tile file names"""
        #  Note: This defines the structure of a .table_set dump file

        table_set_def = OrderedDict()
        table_set_def["name"] = self.id

        # Add basic properties
        for prop in ["description"]:
            value = self[prop]
            if value != None:
                table_set_def[prop] = value

        # Add layer items
        items = table_set_def["layers"] = OrderedDict()
        for rec in self.layer_item_recs.order_by("layer_id"):  # ENH: Nicer by layer name
            item = items[rec.layer_rec.name] = OrderedDict()
            for prop in ["on_demand", "updates"]:
                item[prop] = rec[prop]

        # Add tile file items
        items = table_set_def["tile_files"] = OrderedDict()
        for rec in self.tile_file_item_recs.order_by("tile_file"):
            item = OrderedDict()
            for prop in ["on_demand", "updates", "clip", "by_layer", "min_zoom", "max_zoom"]:
                item[prop] = rec[prop]

            tile_file = rec.tile_file
            if expand_env_vars:
                tile_file = replace_env_variables_in(tile_file)
                tile_file = os.path.normpath(tile_file)

            items[tile_file] = item

        return table_set_def

    def update_from(self, table_set_def, progress=None):
        """
        Update self's properties from dict DEFINITION
        """

        # Copy definition (since we will destroy it)
        table_set_def = table_set_def.copy()

        # Remove compound properties
        layers = table_set_def.pop("layers", None)
        tile_files = table_set_def.pop("tile_files", None)

        # Set properties
        # ENH: Check for bad property
        for (prop, value) in list(table_set_def.items()):
            if prop == "name":
                prop = "id"

            if progress and self[prop] != value:
                progress(2, "Setting", prop, "=", value)

            self[prop] = value

        # Set substructure
        if layers != None:
            self.set_layer_items(layers)
        if tile_files != None:
            self.set_tile_file_items(tile_files)

    def set_layer_items(self, layer_items):
        """
        Set self's layers items from LAYERS_ITEMS

        LAYER_ITEMS is a dict of dicts, keyed by layer name (as returned by self.definition())"""

        # Delete any existing items
        self.layer_item_recs.delete()

        # Add new ones
        for layer_name, props in list(layer_items.items()):
            props = copy.copy(props)

            # Get layer ID
            layer_rec = Session.query(MywLayer).filter(MywLayer.name == layer_name).first()
            if not layer_rec:
                raise MywError("Unknown layer " + layer_name)  # ENH: Make non-fatal?

            item = MywTableSetLayerItem(table_set_id=self.id, layer_id=layer_rec.id)

            # Set properties
            item.on_demand = props.pop("on_demand", False)
            item.updates = props.pop("updates", True)

            if props:
                raise MywError("Bad layer type property: " + list(props.keys())[0])

            Session.add(item)

    def set_tile_file_items(self, tile_files):
        """
        Set self's feature items from TILE_FILES (a dict of dicts)

        TILE_FILES is a dict of dicts, keyed by feature type name (as returned by self.definition())"""

        # Delete any existing items
        self.tile_file_item_recs.delete()

        # Add new ones
        for tile_file, props in list(tile_files.items()):
            props = copy.copy(props)

            # ENH: Check for tile file not known
            item = MywTableSetTileFileItem(table_set_id=self.id, tile_file=tile_file)

            # Set properties
            item.on_demand = props.pop("on_demand", False)
            item.updates = props.pop("updates", True)
            item.clip = props.pop("clip", True)
            item.by_layer = props.pop("by_layer", False)
            item.min_zoom = props.pop("min_zoom", None)
            item.max_zoom = props.pop("max_zoom", None)

            if props:
                raise MywError("Bad tile file property: " + list(props.keys())[0])

            Session.add(item)

    def delete(self):
        """
        Delete self (and substructure)
        """

        # Delete substructure (to avoid problems on Oracle)
        for substructure_rec in self.substructure():
            Session.delete(substructure_rec)
        Session.flush()

        # Delete record
        Session.delete(self)

    # ==============================================================================
    #                                    VALIDATION
    # ==============================================================================

    def assertValid(self):
        """
        Throws MywError if self fails validation
        """

        for err_msg in self.validate():
            raise MywError("table_set {}: {}".format(self.id, err_msg))

    def validate(self):
        """
        Check self's integrity

        Yields a error message for each problem found (if any)"""

        defn = self.definition()  # ENH: Work on records directly

        # Check layer definitions
        feature_type_props = {}

        for (layer_name, options) in list(defn["layers"].items()):

            # Get layer definition
            layer_rec = Session.query(MywLayer).filter(MywLayer.name == layer_name).first()

            # Check for does not exist
            # TODO: Already filtered when definition was built?
            if not layer_rec:
                yield "No such layer: {}".format(layer_name)
                continue

            # For each feature type in layer ..
            for feature_type in layer_rec.feature_recs():
                prev_props = feature_type_props.get(feature_type)

                # Case: Not seen before
                if not prev_props:
                    feature_type_props[feature_type] = {"options": options, "layer": layer_name}

                # Case: Seen before .. so check options match
                else:
                    prev_options = prev_props["options"]
                    prev_layer_name = prev_props["layer"]

                    for option, value in list(options.items()):
                        prev_value = prev_options[option]

                        if not value == prev_value:

                            yield "Conflicting options for table '{}': {}({})={}: {}({})={}".format(  # ENH: Yield the bits instead?
                                feature_type,
                                prev_layer_name,
                                option,
                                prev_value,
                                layer_name,
                                option,
                                value,
                            )
