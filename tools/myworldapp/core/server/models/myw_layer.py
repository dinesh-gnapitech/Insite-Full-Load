################################################################################
# Record exemplar for myw.layer
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Integer
from collections import OrderedDict
import json, re

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_datasource import MywDatasource
from myworldapp.core.server.models.myw_application_layer import MywApplicationLayer
from myworldapp.core.server.models.myw_layer_feature_item import MywLayerFeatureItem
from myworldapp.core.server.models.myw_layer_group_item import MywLayerGroupItem
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
from myworldapp.core.server.models.myw_dd_field import MywDDField


# Supported properties in spec field (keyed by datasource type)
# Note: Taken from definitions in config page JavaScript
spec_field_schemas = {
    "bing": {"mapType": {"type": "string", "values": ["Road", "Aerial", "AerialWithLabels"]}},
    "built_in": {
        "mapType": {"type": "string", "values": ["Blank", "Tile IDs"]},
        "tileSize": {"type": "number"},
        "maxTileZoom": {"type": "number"},
    },
    "esri": {
        "esriMap": {"type": "string"},
        "jsClass": {"type": "string"},
        "extraOptions": {"type": "json"},
    },
    "generic": {"extraArguments": {"type": "json"}},
    "generic_tiles": {
        "relativeUrl": {"type": "string"},
        "tileType": {"type": "string"},
        "extraOptions": {"type": "json"},
        "useCacheBust": {"type": "boolean"},
    },
    "google": {
        "mapType": {"type": "string", "values": ["ROADMAP", "SATELLITE", "HYBRID"]},
        "className": {"type": "string"},
        "arguments": {"type": "json"},
    },
    "kml": {
        "relativeUrl": {"type": "string"},
        "isKmz": {"type": "boolean"},
        "kmzFile": {"type": "string"},
        "fileInKmz": {"type": "string"},
    },
    "myworld": {
        "rendering": {
            "type": "string",
            "values": ["vector", "tilestore", "geoserver", "hybrid"],
        },
        "layer": {"type": "string"},
        "jsClass": {"type": "string"},
        "extraOptions": {"type": "json"},
        "isStatic": {"type": "boolean"},
        "nativeAppMode": {"type": "string", "values": ["switchable", "master", "local"]},
        "tileDirUrl": {"type": "string"},
        "geoserverName": {"type": "string"},
        "geoserverWorkspace": {"type": "string"},
        "geoserverLayer": {"type": "string"},
        "tileType": {"type": "string", "values": ["raster", "topojson", "mvt"]},
        "render_order_point_offset": {"type": "number"},
        "nativeAppVector": {"type": "json"},
        "maxTileZoom": {"type": "number"},
    },
    "ogc": {
        "wmsLayerGroup": {"type": "string"},
        "jsClass": {"type": "string"},
        "extraOptions": {"type": "json"},
        "useCacheBust": {"type": "boolean"},
    },
    "mapquest": {"mapType": {"type": "string"}},
}


class MywLayer(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.layer
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "layer")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "layer", "id", Integer, generator="sequence")

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

    # ==============================================================================
    #                                    SUBSTRUCTURE
    # ==============================================================================

    def substructure(self):
        """
        The records that depend on self
        """

        from myworldapp.core.server.models.myw_table_set_layer_item import MywTableSetLayerItem

        return (
            self.feature_item_recs.all()
            + Session.query(MywLayerGroupItem).filter(MywLayerGroupItem.layer_id == self.id).all()
            + Session.query(MywApplicationLayer)
            .filter(MywApplicationLayer.layer_id == self.id)
            .all()
            + Session.query(MywTableSetLayerItem)
            .filter(MywTableSetLayerItem.layer_id == self.id)
            .all()
        )

    @property
    def datasource_rec(self):
        """
        Self's datasource record
        """

        ds_rec = Session.query(MywDatasource).get(self.datasource_name)

        if not ds_rec:
            err_msg = "Layer {}: No such datasource: {}".format(self.name, self.datasource_name)
            raise MywError(err_msg)  # ENH: Support missing datasource in callers and remove this

        return ds_rec

    @property
    def feature_item_recs(self):
        """
        Return a query yielding the layer_feature_item records for self
        """

        return Session.query(MywLayerFeatureItem).filter(MywLayerFeatureItem.layer_id == self.id)

    def feature_recs(self):
        """
        The dd_feature records associated to self (ordered by name)

        Returns a dict of MywDDFeatures, keyed by feature type"""

        # ENH: Do the whole thing in a single join

        query = (
            Session.query(MywLayerFeatureItem, MywDDFeature)
            .filter(MywLayerFeatureItem.layer_id == self.id)
            .join(MywDDFeature, MywDDFeature.id == MywLayerFeatureItem.feature_id)
            .order_by(MywDDFeature.feature_name, MywLayerFeatureItem.field_name)
        )

        feature_recs = {}
        for item_rec, feature_rec in query:
            feature_recs[feature_rec.feature_name] = feature_rec

        return OrderedDict(sorted(feature_recs.items()))

    # ==============================================================================
    #                                 SERIALIZATION
    # ==============================================================================

    def definition(
        self, full=True, extras=False, ds_rec=None, with_defaults=False, feature_recs=None
    ):
        """
        Return self as a dict (for serialisation in requests)

        Optional EXTRAS adds properties 'type' and 'extractable'
        (based on datasource properties). Optional DS_REC is self's
        datasource record (provided for speed)
        Optional FEATURE_RECS is self's layer_feature_item and corresponding dd_feature records (provide for speed)

        If optional WITH_DEFAULTS is True, populate missing
        min_select and max_select properties with their default
        values (from self's visibility settings)"""

        spec = self._spec_from_db()

        props = {
            "id": self.id,
            "category": self.category,
            "name": self.name,
            "display_name": self.display_name or self.name,
            "code": self.code,
            "datasource": self.datasource_name,
            "spec": spec,
            "description": self.description,
            "thumbnail": self.thumbnail,
            "transparency": self.transparency,
            "min_scale": self.min_scale,
            "max_scale": self.max_scale,
            "attribution": self.attribution,
            "control_item_class": self.control_item_class,
            "render_order": self.render_order,
        }

        if full:
            props["feature_types"] = self.feature_item_defs(
                with_defaults=with_defaults, feature_recs=feature_recs
            )

        if extras:
            extractable, updates = self.extractable(ds_rec)
            props["type"] = self.type(ds_rec)
            props["extractable"] = extractable
            props["updates"] = updates

        return props

    # ==============================================================================
    #                                 PROPERTIES
    # ==============================================================================

    def type(self, ds_rec=None):
        """
        A string indicating self's type (for display in GUI)

        Optional DS_REC is self's datasource record (for speed)"""

        if not ds_rec:
            ds_rec = self.datasource_rec

        type_str = ds_rec.type

        if ds_rec.type == "myworld":
            rendering = self._spec_from_db().get("rendering")
            if rendering:
                type_str += " ({})".format(rendering)

        elif ds_rec.type == "generic":
            layer_class = ds_rec.layer_class()
            if layer_class:
                type_str += " ({})".format(layer_class)

        return type_str

    def extractable(self, ds_rec=None):
        """
        Returns:
          EXTRACTABLE  True if features can be extracted (are available for replication)
          UPDATES      True if incremntal updates are supported

        Optional DS_REC is self's datasource record (for speed)"""

        extractable_types = ["myworld", "esri", "ogc"]

        if not ds_rec:
            ds_rec = self.datasource_rec

        if not ds_rec.type in extractable_types:
            return False, False

        if self.get_spec_property("nativeAppMode") == "master":
            return False, False

        # ENH: Only allow Geoserver-rendered layers if 'render as vector on native app' is set?
        if (ds_rec.type == "myworld") and not (
            self.get_spec_property("rendering") in ["tilestore", "vector", "geoserver"]
        ):
            return False, False

        if ds_rec.type != "myworld":
            return True, False

        return True, True

    def get_spec_property(self, name):
        """
        Returns the value of spec property NAME (if present)
        """

        spec = self._spec_from_db()

        return spec.get(name)

    def _spec_from_db(self):
        """
        Self's spec (as a dict)
        """
        # ENH: Could cache this

        if self.spec:
            return json.loads(self.spec)

        return {}

    def tile_layer(self):
        """
        Name of tile layer / world type used to render self (if any)
        """

        if not self.datasource_name == "myworld":  # ENH: Encapsulate
            return None

        spec = self._spec_from_db()
        rendering = spec.get("rendering")
        if rendering != "tilestore" and rendering != "hybrid":
            return None

        name = spec.get("layer", None)
        if name:
            if name.startswith("geo/"):
                name = name[4:]
            return name

        if self.category == "internals":  # For compatability with 'old' internals model
            return "int"

        return self.category

    def feature_item_defs(self, in_draw_order=False, with_defaults=False, feature_recs=None):
        """
        Feature items for self

        Returns a list of dicts, with keys:
          name            Name of feature type
          field_name      Name of field
          min_select      Minimum zoom level at which type is selectable (if set)
          max_select      Maximum zoom level at which type is selectable (if set)
          point_style     String defining point draw style (if set)
          line_style      String defining line draw style (if set)
          fill_style      String defining fill draw style (if set)
          text_style      String defining text draw style (if set)

        If WITH_DEFAULTS is True, populate missing min_select and
        max_select properties with defaults from self

        Optional FEATURE_RECS is self's layer_feature_item and corresponding dd_feature records (provide for speed)
        """

        items = []

        # Build list of items
        if feature_recs is None:
            feature_recs = (
                Session.query(MywLayerFeatureItem, MywDDFeature)
                .filter(MywLayerFeatureItem.layer_id == self.id)
                .join(MywDDFeature, MywDDFeature.id == MywLayerFeatureItem.feature_id)
            )

        ds_rec = self.datasource_rec

        for item_rec, ftr_rec in feature_recs:

            # Get item properties
            item_data = OrderedDict()
            item_data["name"] = ftr_rec.feature_name

            for prop in [
                "field_name",
                "filter_name",
                "min_vis",
                "max_vis",
                "min_select",
                "max_select",
                "point_style",
                "line_style",
                "fill_style",
                "text_style",
            ]:
                value = item_rec[prop]

                if prop == "field_name" and value == "-":
                    continue

                if prop == "filter_name":
                    prop = "filter"

                if value != None:
                    item_data[prop] = value

            # Deal with defaults
            if with_defaults:
                if not "min_vis" in item_data:
                    item_data["min_vis"] = self.min_scale
                if not "max_vis" in item_data:
                    item_data["max_vis"] = self.max_scale
                if not "min_select" in item_data:
                    item_data["min_select"] = item_data["min_vis"]
                if not "max_select" in item_data:
                    item_data["max_select"] = item_data["max_vis"]

            # Handle datasource-type specific processes
            if ds_rec.type == "esri":
                # Attach drawing_info
                remote_spec = json.loads(ftr_rec.remote_spec)
                extras = remote_spec.get("extras", {})
                drawing_info = extras.get("drawing_info", None)
                if drawing_info is not None:
                    item_data["drawing_info"] = drawing_info

            items.append(item_data)

        # Sort in Python as using 'order by' in query gives different order on Windows and Linux
        sort_key = lambda item: (item["name"], item.get("field_name"))
        items = sorted(items, key=sort_key)

        # Futher sort into draw order, (if requested)
        if in_draw_order:
            items = self._sort_feature_items(items)

        return items

    def _sort_feature_items(self, items):
        """
        Sort feature item defs ITEMS into draw order
        """

        # Check for trivial cases
        if len(items) < 2:
            return items

        # Define draw order
        geom_types = ["raster", "polygon", "linestring", "point", None]

        # Build lookup table from geom field name -> dd_field_rec (for speed)
        geom_field_query = Session.query(MywDDField).filter(
            (MywDDField.datasource_name == self.datasource_name) & (MywDDField.type.in_(geom_types))
        )
        geom_field_recs = {}
        for rec in geom_field_query:
            geom_field_recs[(rec.table_name, rec.internal_name)] = rec

        # Group items by their geometry type
        items_by_geom_type = {}
        for geom_type in geom_types:
            items_by_geom_type[geom_type] = []

        for item in items:
            geom_type = None

            field_name = item.get("field_name")
            if field_name:
                field_rec = geom_field_recs.get((item["name"], field_name))
                if not field_rec:
                    print(
                        "***Warning***: Layer",
                        self.name,
                        ":",
                        "Field not found:",
                        item["name"] + "." + field_name,
                    )
                    continue
                geom_type = field_rec.type

            items_by_geom_type[geom_type].append(item)

        # Build result
        items = []
        for geom_type in geom_types:
            items += items_by_geom_type[geom_type]

        return items

    def zoomRangeFn(self):
        """return a function which can give the implied range of zooms that must be supported by a
        given request at zoom."""
        # ENH: Enable alternate-zoom option by returning (n, n+1) if requested on the layer.

        # Close over local variables with well known values, not the feature record.
        # ENH: read this default value from the db or settings, at present it is hard-coded in
        # both client and server.
        max_zoom = self._spec_from_db().get("maxTileZoom", 17)

        def zoomRange(requested_zoom, max_tile_zoom=max_zoom):
            # If the requested zoom is equal to the max, then we need to include all features which
            # have a higher zoom level too, since the client won't request at a higher zoom.
            if requested_zoom == max_tile_zoom:
                return (requested_zoom, float("inf"))

            # By default, we only need to return features which are visible at the requested zoom level.
            return (requested_zoom, requested_zoom)

        return zoomRange

    def set_feature_items(self, ftr_item_defs, skip_unknown=False, progress=MywProgressHandler()):
        """
        Update the layer feature item records associated with SELF

        FTR_ITEM_DEFS is a list of dict objects with keys 'name',
        'point_style' etc (as per .layer file)
        """

        # Ensure we have an ID
        Session.flush()

        # Build list of current feature items (used to work out what to delete)
        prev_ftr_item_recs = {}
        for rec in self.feature_item_recs:
            prev_ftr_item_recs[str(rec.feature_id) + "|" + rec.field_name] = rec

        # For each item ...
        for ftr_item in ftr_item_defs:
            ftr_name = ftr_item["name"]
            field_name = ftr_item.get("field_name")

            # Get feature record
            ftr_rec = self.dd_feature_rec_for(ftr_name)

            # Check for no such feature
            if not ftr_rec:
                if skip_unknown:
                    progress(
                        "warning", "Unknown feature type:", self.datasource_name + "/" + ftr_name
                    )
                    continue
                else:
                    raise MywError("Unknown feature type:", self.datasource_name + "/" + ftr_name)

            # Handle default field name (for backwards comatability with old files)
            if not field_name:
                field_name = ftr_rec.primary_geom_name  # -> None for geometryless features

            # Check for no such field
            # ENH: Check for not a geom field
            if field_name and not ftr_rec.fieldRec(field_name):
                if skip_unknown:
                    progress("warning", "No such field:", ftr_name + "." + field_name)
                    continue
                else:
                    raise MywError("No such field:", ftr_name + "." + field_name)

            # Check for missing filter
            filter_name = ftr_item.get("filter")
            if filter_name and not ftr_rec.filterRec(filter_name):
                if skip_unknown:
                    progress("warning", ftr_rec, ":", "Unknown filter:", filter_name)
                    continue
                else:
                    raise MywError(ftr_rec, ":", "Unknown filter:", filter_name)

            # Hack because Postgres doesn't support null in keys
            if not field_name:
                field_name = "-"

            # Get associated intermediate record (if there is one)
            rec = prev_ftr_item_recs.pop(str(ftr_rec.id) + "|" + field_name, None)

            # Create intermediate record (if necessary)
            if not rec:
                progress(3, "Associating feature:", ftr_name)

                # Create record
                rec = MywLayerFeatureItem()
                rec.layer_id = self.id
                rec.feature_id = ftr_rec.id
                rec.field_name = field_name

                Session.merge(rec)

            # Case: Set item properties
            for prop, value in list(ftr_item.items()):

                if prop == "filter":
                    prop = "filter_name"
                if prop == "min_scale":
                    prop = "min_select"  # For backwards compatibility
                if prop == "max_scale":
                    prop = "max_select"  # For backwards compatibility

                if prop != "name":
                    rec[prop] = value

            Session.merge(rec)

        # Handle features removed from the association
        for rec in list(prev_ftr_item_recs.values()):
            ftr_rec = Session.query(MywDDFeature).get(rec.feature_id)
            if ftr_rec:
                progress(3, "Removing feature:", ftr_rec.feature_name)
            Session.delete(rec)

    def dd_feature_rec_for(self, name):
        """
        Returns the dd_feature record for feature with internal name NAME (if there is one)
        """

        return (
            Session.query(MywDDFeature)
            .filter(MywDDFeature.datasource_name == self.datasource_name)
            .filter(MywDDFeature.feature_name == name)
            .first()
        )

    # ==============================================================================
    #                                    VALIDATION
    # ==============================================================================

    def validate(self):
        """
        Check self's integrity

        Yields a error message for each problem found"""

        spec_schema = spec_field_schemas.get(self.datasource_rec.type)

        # Check datasource type
        if spec_schema == None:
            yield "Bad datasource type: {}".format(self.datasource_rec.type)
            return

        # Check spec
        spec = self._spec_from_db()  # handler errors

        for prop, value in list(spec.items()):
            prop_def = spec_schema.get(prop)

            if not prop_def:
                yield "Bad property in spec: {}".format(prop)
                continue

            permitted_values = prop_def.get("values")
            if permitted_values and not value in permitted_values:
                yield "Bad value for spec property '{}': Expected {} : Got '{}'".format(
                    prop, "|".join(permitted_values), value
                )

            # ENH: Check type is correct
            # ENH: Check for missing mandatory values

        # Check feature items
        for feature_item_rec in self.feature_item_recs:
            feature_rec = feature_item_rec.feature_rec
            field_name = feature_item_rec.field_name

            if (field_name != "-") and not feature_rec.fieldRec(field_name):
                yield "Associated feature '{}': No such field '{}'".format(
                    feature_rec.feature_name, field_name
                )

            if feature_rec.datasource_name != self.datasource_name:
                yield "Associated feature '{}': Datasource mis-match: Expected '{}' : Got '{}'".format(
                    feature_rec.feature_name, self.datasource_name, feature_rec.datasource_name
                )
