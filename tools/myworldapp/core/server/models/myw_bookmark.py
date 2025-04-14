################################################################################
# Record exemplar for myw.bookmark
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Column, Integer, Boolean

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_layer import MywLayer


class MywBookmark(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.bookmark
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "bookmark")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    id = MywModelMixin.keyColumn("myw", "bookmark", "id", Integer, generator="sequence")
    is_private = Column(Boolean)

    def definition(self):
        """
        Return self in a serializable format
        """
        map_display = self.map_display if self.map_display is not None else ""
        map_display_list = map_display.split("|")
        basemap = map_display_list[0]
        if len(map_display_list) > 1:
            layers = map_display_list[1]
        else:
            layers = ""
        return {
            "id": self.id,
            "title": self.myw_title,
            "lat": self.lat,
            "lng": self.lng,
            "zoom": self.zoom,
            "username": self.username,
            "is_private": self.is_private,
            "map_display": map_display,
            "basemap": basemap,
            "layers": layers,
        }

    @property
    def basemap(self):
        """
        Name of basemap layer that self specifies (if there is one)
        """
        # ENH: Change data-model to store basemap in separate field and remove this

        if not self.map_display:
            return None

        name = self.map_display.split("|")[0]

        if not name:
            return None

        return name

    @property
    def layer_codes(self):
        """
        Codes of layers that self specifies
        """

        if not self.map_display:
            return []

        parts = self.map_display.split("|")

        if len(parts) < 2 or parts[1] == "":
            return []

        return parts[1].split(",")

    @property
    def layer_names(self):
        """
        Names of layers that self specifies
        """

        layer_names = []

        for layer_code in self.layer_codes:
            layer_rec = Session.query(MywLayer).filter(MywLayer.code == layer_code).first()

            if layer_rec:
                layer_names.append(layer_rec.name)

        return layer_names

    def set_name(self, name):
        """
        Set self's name (and dependent fields)
        """
        # ENH: Convert to setter .. or remove dependent fields from data model

        self.myw_title = name
        self.myw_search_val1 = name.lower()
        self.myw_search_desc1 = name

    def set_basemap_and_layers(self, basemap, layer_names):
        """
        Set self's map_display field
        """
        # ENH: Split fields in data-model and get rid of this

        if not basemap and not layer_names:
            self.map_display = ""

        else:
            basemap = basemap or ""
            layer_names = layer_names or []

            layer_codes = []
            for layer_name in layer_names:
                layer_rec = Session.query(MywLayer).filter(MywLayer.name == layer_name).first()

                if not layer_rec:
                    print(
                        "***Warning***: Skipping unknown layer:", layer_name
                    )  # ENH: Raise a warning
                    continue

                if not layer_rec.code:
                    print("***Warning***: Layer has no code:", layer_name)  # ENH: Raise a warning
                    continue

                layer_codes.append(layer_rec.code)

            self.map_display = basemap + "|" + ",".join(layer_codes)
