################################################################################
# Controller for myw.private_layer
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_private_layer import MywPrivateLayer
from myworldapp.core.server.models.myw_setting import MywSetting
from myworldapp.core.server.base.core.myw_error import MywError

from myworldapp.core.server.controllers.base.myw_controller import MywController

import myworldapp.core.server.controllers.base.myw_globals as myw_globals


class MywPrivateLayerController(MywController):
    """
    Controller for accessing myw.private_layer
    """

    @view_config(
        route_name="myw_private_layer_controller.no_id", request_method="GET", renderer="json"
    )
    def index(self):
        """
        The private_layers accessible to the current user
        """

        self.current_user.assertAuthorized(self.request)

        recs = Session.query(MywPrivateLayer).filter(
            (MywPrivateLayer.owner == self.current_user.name())
            | (MywPrivateLayer.sharing.in_(self.current_user.groupIds()))
        )
        layer_defs = []
        for rec in recs:
            layer_defs.append(rec.definition(include_id=True))

        return {"layer_defs": layer_defs}

    @view_config(
        route_name="myw_private_layer_controller.with_id", request_method="GET", renderer="json"
    )
    def get(self):
        """
        Definition of private_layer ID
        """
        # ENH: Prevent read of private_layers not accessible to self?
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request)

        rec = Session.query(MywPrivateLayer).get(id)

        if not rec:
            raise exc.HTTPNotFound()

        return rec.definition(include_id=True)

    @view_config(
        route_name="myw_private_layer_controller.no_id", request_method="POST", renderer="json"
    )
    def create(self):
        """
        Create a new private_layer from definition in payload
        """

        self.current_user.assertAuthorized(
            self.request
        )  # ENH: Only if have 'editPrivateLayer' right?

        layer_def = json.loads(self.request.body)

        # Create record
        # ENH: Duplicates code with config manager
        rec = MywPrivateLayer(owner=layer_def.pop("owner"), name=layer_def.pop("name"))

        # Ensure we are owner
        if rec.owner != self.current_user.name():
            raise exc.HTTPForbidden()

        self._updatePrivateLayerFromDef(rec, layer_def, None)

        rec.setId()
        Session.add(rec)
        Session.commit()

        return rec.definition(include_id=True)

    @view_config(
        route_name="myw_private_layer_controller.with_id", request_method="PUT", renderer="json"
    )
    def update(self):
        """
        Update private_layer ID from definition in payload
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(
            self.request
        )  # ENH: Only if have 'editPrivateLayer' right

        delta = self.get_param(self.request, "delta")

        layer_def = json.loads(self.request.body)

        # Get record
        rec = Session.query(MywPrivateLayer).get(id)
        if not rec:
            raise exc.HTTPNotFound()

        # Ensure we are owner
        if rec.owner != self.current_user.name():
            raise exc.HTTPForbidden()

        # Prevent change of key
        layer_def.pop("owner")
        layer_def.pop("name")

        self._updatePrivateLayerFromDef(rec, layer_def, delta)

        Session.commit()

        return rec.definition(include_id=True)

    def _updatePrivateLayerFromDef(self, rec, layer_def, delta=None):
        """
        Update the private layer in rec from the specified layer_def
        """
        for prop, value in list(layer_def.items()):

            if not prop in list(rec.__table__.columns.keys()):
                raise MywError("Bad property in layer definition:", prop)

            if prop == "datasource_spec" and value != None:
                value = json.dumps(value)

            elif prop == "spec" and value != None:
                old_spec = json.loads(rec.spec or "{}")
                old_spec_type = old_spec.get("source", "url")
                new_spec_type = value.get("source", "url")
                old_spec_feature = old_spec.get("feature", None)
                new_spec_feature = value.get("feature", None)

                # Ensure that when sent a feature based request, that a feature is actually set
                if new_spec_type == "feature" and not new_spec_feature:
                    print("Invalid Data: Feature-based private layers need a file specified")
                    raise exc.HTTPBadRequest("Invalid data")

                # Determine if we should delete the old feature
                if old_spec_type == "feature":
                    (feature_type, feature_id, file_field) = old_spec_feature.split("/")
                    self.current_user.assertAuthorized(
                        self.request,
                        require_reauthentication=False,
                        feature_type=feature_type,
                        right="editFeatures",
                    )
                    table = myw_globals.db.view(delta).table(feature_type)

                    if new_spec_type == "url":
                        # Delete the feature here
                        table.deleteById(feature_id)
                    elif new_spec_type == "feature":
                        # Update the feature here, but only if we need to. Any new uploaded new_spec_feature will be a JSON object
                        if old_spec_feature != new_spec_feature:
                            self._assertFileSizeIsOkay(
                                table.descriptor.fields[file_field], new_spec_feature
                            )
                            table.updateFrom(feature_id, {file_field: json.dumps(new_spec_feature)})
                            value["feature"] = old_spec_feature

                elif old_spec_type == "url":
                    # Note that no special handling needs to occur if moving from a url to another url

                    if new_spec_type == "feature":
                        # Add the new feature here

                        # Get the specified feature type first, making sure its configured properly
                        uploadConfigured = False
                        privateLayerSettings = Session.query(MywSetting).get(
                            "core.privateLayerSettings"
                        )
                        if privateLayerSettings is not None:
                            privateLayerSettings = json.loads(privateLayerSettings.value)
                            if "attachmentFeatureType" in privateLayerSettings:
                                uploadConfigured = True

                        if not uploadConfigured:
                            raise exc.HTTPServerError(
                                "Feature type hasn't been specified to store private layer file in"
                            )

                        feature_type = privateLayerSettings["attachmentFeatureType"]

                        self.current_user.assertAuthorized(
                            self.request,
                            require_reauthentication=False,
                            feature_type=feature_type,
                            right="editFeatures",
                        )
                        table = myw_globals.db.view(delta).table(feature_type)

                        # Find the first file field here
                        file_field = None
                        for field in table.descriptor.fields:
                            field_desc = table.descriptor.fields[field]
                            if field_desc.type_desc.base == "file":
                                file_field = field_desc
                                break

                        if file_field is None:
                            raise exc.HTTPServerError(
                                "Specified feature does not have a field of type 'file' specified"
                            )

                        # Update the name field here if its specified
                        featureValues = {file_field.type_desc.base: json.dumps(new_spec_feature)}
                        if "attachmentFeatureNameField" in privateLayerSettings:
                            featureValues[privateLayerSettings["attachmentFeatureNameField"]] = (
                                rec.owner + ":" + rec.name
                            )

                        self._assertFileSizeIsOkay(file_field, new_spec_feature)

                        new_feature = table.insertWith(**featureValues)
                        value["feature"] = "{}/{}".format(
                            new_feature._urn(), file_field.type_desc.base
                        )
                value = json.dumps(value)

            rec[prop] = value

    def _assertFileSizeIsOkay(self, file_field, new_spec_feature):
        """
        Raises an error if the uploaded file size is larger than that specified by the file field
        """
        if len(file_field.type_desc.args):
            # Use this to get the actual size in kb, can be determined from the length of the base64
            # data without decoding it
            decoded_size = ((len(new_spec_feature["content_base64"]) * 3) // 4) // 1024
            if decoded_size > file_field.type_desc.args[0]:
                raise exc.HTTPBadRequest("File size is too big")

    @view_config(route_name="myw_private_layer_controller.with_id", request_method="DELETE")
    def delete(self):
        """
        Delete private_layer ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(
            self.request
        )  # ENH: Only if have 'editPrivateLayer' right?

        delta = self.get_param(self.request, "delta")

        # Get record
        rec = Session.query(MywPrivateLayer).get(id)
        if not rec:
            raise exc.HTTPNotFound()

        # Ensure we are owner
        if rec.owner != self.current_user.name():
            raise exc.HTTPForbidden()

        # Delete it
        Session.delete(rec)

        # If this is a feature-based private layer, delete the accompanying file
        spec = json.loads(rec.spec)
        if spec.get("source", "url") == "feature":
            (feature_type, feature_id, file_field) = spec["feature"].split("/")
            self.current_user.assertAuthorized(
                self.request,
                require_reauthentication=False,
                feature_type=feature_type,
                right="editFeatures",
            )
            table = myw_globals.db.view(delta).table(feature_type)
            table.deleteById(feature_id)

        Session.commit()

        return self.request.response
