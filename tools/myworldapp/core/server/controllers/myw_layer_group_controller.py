################################################################################
# Controller for myw.layer_group
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from pyramid.view import view_config
import pyramid.httpexceptions as exc
from json import loads

from myworldapp.core.server.models.myw_layer_group import MywLayerGroup
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywLayerGroupController(MywController):
    """
    Controller for myw.layer_group requests
    """

    @view_config(
        route_name="myw_layer_group_controller.index", request_method="GET", renderer="json"
    )
    def index(self):
        """
        Returns defininitions of all layers layers
        """

        self.current_user.assertAuthorized(self.request)

        query = Session.query(MywLayerGroup)
        layer_groups = []
        for group in query:
            layer_groups.append(group.serialise(True))

        return {"layerGroups": layer_groups}

    @view_config(
        route_name="myw_layer_group_controller.no_id", request_method="GET", renderer="json"
    )
    def no_id(self):
        """
        Returns defininitions of all layers layers
        """

        self.current_user.assertAuthorized(self.request, right="manageLayers")

        query = Session.query(MywLayerGroup)
        layer_groups = []
        for group in query:
            layer_groups.append(group.serialise(True))

        return {"layerGroups": layer_groups}

    @view_config(
        route_name="myw_layer_group_controller.no_id", request_method="POST", renderer="json"
    )
    def create(self):
        """
        Create a new feature.
        """

        # ENH: Duplicates code on myw_config_manager

        self.current_user.assertAuthorized(self.request, right="manageLayers")

        # Unpick request
        request_content = self.request.body
        layer_group = loads(request_content)

        rec = MywLayerGroup()
        return_obj = {}

        for (prop, value) in list(layer_group.items()):
            if prop == "layers":
                continue
            rec[prop] = value
            return_obj[prop] = value

        # Ensure mandatory fields are populated
        rec.set_backstops()

        # Check for duplicate layer group name
        confilcting_name = (
            Session.query(MywLayerGroup).filter(MywLayerGroup.name == rec.name).first()
        )
        if confilcting_name:
            raise exc.HTTPConflict()

        # Create record (and allocate id)
        Session.add(rec)
        Session.flush()

        newId = rec.id

        # Set layers
        newLayerGroup = Session.query(MywLayerGroup).get(newId)

        layers = layer_group["layers"]
        newLayerGroup.setLayers(layers)

        Session.commit()

        return_obj["id"] = newId
        return_obj["layers"] = layers

        # ENH: Better to return the record we just created
        return return_obj

    @view_config(
        route_name="myw_layer_group_controller.with_id", request_method="PUT", renderer="json"
    )
    def update(self):
        """
        Update a layer group
        """
        id = self.request.matchdict["id"]

        # ENH: Duplicates code on myw_config_manager

        self.current_user.assertAuthorized(self.request, right="manageLayers")

        # Unpick request
        request_content = self.request.body
        layer_group = loads(request_content)

        # Get the record
        rec = Session.query(MywLayerGroup).get(id)

        # Update simple properties
        for prop, value in list(layer_group.items()):

            if prop == "layers":
                continue

            if rec[prop] != value:
                rec[prop] = value

        # Update substructure
        layer_names = layer_group.get("layers")
        if layer_names != rec.layerNames():
            rec.setLayers(layer_names)

        # Ensure mandatory fields are populated
        rec.set_backstops()

        # Send updates to database
        Session.flush()
        Session.commit()

        # ENH: Better to return the record we just updated
        return layer_group

    @view_config(
        route_name="myw_layer_group_controller.with_id", request_method="DELETE", renderer="json"
    )
    def delete(self):
        """
        Delete an existing group definition
        """
        id = self.request.matchdict["id"]

        # ENH: Duplicates code on myw_config_manager

        self.current_user.assertAuthorized(self.request, right="manageLayers")

        rec = Session.query(MywLayerGroup).get(id)

        # Delete substructure (to avoid problems on Oracle)
        for substructure_rec in rec.substructure():
            Session.delete(substructure_rec)

        Session.flush()

        # Delete record
        Session.delete(rec)
        Session.commit()

        return {"id": id}
