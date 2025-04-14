################################################################################
# Record exemplar for myw.application
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Column, Integer, Boolean

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_permission import MywPermission
from myworldapp.core.server.models.myw_application_state import MywApplicationState
from myworldapp.core.server.models.myw_application_layer import MywApplicationLayer
from myworldapp.core.server.models.myw_layer import MywLayer
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
from myworldapp.core.server.models.myw_layer_feature_item import MywLayerFeatureItem


class MywApplication(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.application
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "application")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "application", "id", Integer, generator="sequence")
    for_online_app = Column(Boolean, default=True)
    for_native_app = Column(Boolean, default=True)

    def definition(self, full=True):
        """
        Return self in a serializable format
        """
        #
        props = {
            "id": self.id,
            "name": self.name,
            "external_name": self.external_name,
            "description": self.description,
            "javascript_file": self.javascript_file,
            "for_online_app": self.for_online_app,
            "for_native_app": self.for_native_app,
            "icon_url": self.image_url,
        }
        if full:
            props["layer_items"] = self.layer_items()

        return props

    def substructure(self):
        """
        The records that depend on self
        """
        return (
            self.__permission_recs + self.__application_state_recs + self.__application_layer_recs
        )

    @property
    def __permission_recs(self):
        """
        The permission records that relate to self
        """
        query = Session.query(MywPermission).filter(MywPermission.application_id == self.id)

        return query.all()

    @property
    def __application_state_recs(self):
        """
        The application state records that relate to self
        """
        query = Session.query(MywApplicationState).filter(
            MywApplicationState.application_name == self.name
        )

        return query.all()

    @property
    def __application_layer_recs(self):
        """
        The "join" records layers that specify which layers SELF uses
        """
        query = Session.query(MywApplicationLayer).filter(
            MywApplicationLayer.application_id == self.id
        )

        return query.all()

    def __application_layer_rec_for(self, layer_rec):
        """
        The "join" field between self and the given layer
        """
        query = (
            Session.query(MywApplicationLayer)
            .filter(MywApplicationLayer.application_id == self.id)
            .filter(MywApplicationLayer.layer_id == layer_rec.id)
        )

        return query.first()

    def layer_item_recs(self):
        """
        Layer and ApplicationLayer records accessible to self
        """
        query = (
            Session.query(MywLayer, MywApplicationLayer)
            .filter(MywApplicationLayer.application_id == self.id)
            .filter(MywApplicationLayer.layer_id == MywLayer.id)
        )
        return query.all()

    def layer_recs(self):
        """
        Layer records accessible to self
        """
        query = (
            Session.query(MywLayer)
            .join(MywApplicationLayer, MywApplicationLayer.layer_id == MywLayer.id)
            .filter(MywApplicationLayer.application_id == self.id)
        )

        return query.all()

    def feature_types(self, editable_only):
        """
        Names of feature types accessible by self

        If EDITABLE_ONLY, return only the names of those types which a marked as editable in the DD

        Navigates application -> layer -> feature_type"""

        # ENH: EXTDD: Add datasource .. or remove this method?
        return set(rec.feature_name for rec in self.feature_type_recs(editable_only))

    def feature_type_recs(self, editable_only):
        """
        Feature types accessible by self (a list of MywDDFeature records)

        If EDITABLE_ONLY, return only those types which a marked as editable in the DD

        Navigates application -> layer -> feature_type"""

        query = (
            Session.query(MywDDFeature)
            .join(MywLayerFeatureItem, MywLayerFeatureItem.feature_id == MywDDFeature.id)
            .join(MywLayer, MywLayer.id == MywLayerFeatureItem.layer_id)
            .join(MywApplicationLayer, MywApplicationLayer.layer_id == MywLayer.id)
            .filter(MywApplicationLayer.application_id == self.id)
        )

        if editable_only:
            query = query.filter(MywDDFeature.editable == True)

        # Note: Cannot use .distinct() in query as fails on Oracle CLOB fields
        return set(query.all())

    def layer_items(self):
        """
        Names of layers accessible to self
        returns sorted [{name:"name", read_only:bool, id:id, snap:bool}]
        """
        layers = []

        for layer_rec, app_layer_rec in self.layer_item_recs():
            temp = {}
            temp["name"] = layer_rec["name"]
            temp["read_only"] = app_layer_rec.read_only
            temp["snap"] = app_layer_rec.snap
            temp["id"] = app_layer_rec.layer_id
            layers.append(temp)

        layers = sorted(layers, key=lambda k: k["name"])
        return layers

    def set_layers(self, new_layers):
        """
        Sets self's layers to NEW_LAYERS

        Layers that don't exist are skipped with a warning"""

        # Build a list of current layers
        prev_layer_recs = {}
        for rec in self.layer_recs():
            prev_layer_recs[rec.id] = rec

        # for the new layers
        for layer in new_layers:
            # Get layer record, accounting for different file structures, read_only and snap False by default
            if isinstance(layer, dict):
                layer_rec = Session.query(MywLayer).filter(MywLayer.name == layer["name"]).first()
                read_only = layer.get("read_only", False)
                snap = layer.get("snap", False)
            else:
                layer_rec = Session.query(MywLayer).filter(MywLayer.name == layer).first()
                read_only = False
                snap = False

            if layer_rec is None:
                print("Warning: Layer", layer, "not found")
                continue

            # Ensure removed layer rec is removed from db
            if layer_rec.id in prev_layer_recs:
                prev_layer_recs.pop(layer_rec.id)

            # Create new application layer join record (must create rather than check if already exists as application layer properties may have changed)
            rec = MywApplicationLayer()
            rec.application_id = self.id
            rec.layer_id = layer_rec.id
            rec.read_only = read_only
            rec.snap = snap
            Session.merge(rec)

        # Removed layers no longer in list
        for layer_rec in list(prev_layer_recs.values()):
            Session.delete(self.__application_layer_rec_for(layer_rec))
