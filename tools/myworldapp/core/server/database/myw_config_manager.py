################################################################################
# myWorld configuration manager
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import copy, json
from collections import OrderedDict

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler

from myworldapp.core.server.models.myw_layer import MywLayer
from myworldapp.core.server.models.myw_layer_group import MywLayerGroup
from myworldapp.core.server.models.myw_private_layer import MywPrivateLayer
from myworldapp.core.server.models.myw_network import MywNetwork
from myworldapp.core.server.models.myw_application import MywApplication
from myworldapp.core.server.models.myw_application_layer import MywApplicationLayer
from myworldapp.core.server.models.myw_role import MywRole
from myworldapp.core.server.models.myw_right import MywRight
from myworldapp.core.server.models.myw_permission import MywPermission
from myworldapp.core.server.models.myw_user import MywUser
from myworldapp.core.server.models.myw_group import MywGroup
from myworldapp.core.server.models.myw_notification import MywNotification
from myworldapp.core.server.models.myw_table_set import MywTableSet
from myworldapp.core.server.models.myw_extract import MywExtract


class MywConfigManager:
    """
    Provides API for accessing configuration information (layer defs etc)
    """

    def __init__(self, db, progress=MywProgressHandler()):
        """
        Initialise self

        DB is a MywDatabase. Optional PROGRES_PROC(level,*msg) is a
        callback for progress messages"""

        self.db = db
        self.progress = progress

    # ==============================================================================
    #                                   LAYERS
    # ==============================================================================

    def layerExists(self, layer_name):
        """
        True if there is a layer definition LAYER_NAME
        """

        return self.layerRec(layer_name) != None

    def layerNames(self, filter=None, sort=False, warn_if_no_match=False):
        """
        Returns the names of the layer names in self

        Optional filter is a fnmatch-style filter"""

        return self._namesFrom(MywLayer, filter, sort, warn_if_no_match, "layers")

    def layerDef(self, layer_name):
        """
        Returns definition of layer LAYER_NAME as a dict
        """
        # ENH: Better to return rec and use rec.serialise?

        # Fields to use (explicitly, to get order consistent for tests)
        props = [
            "name",
            "display_name",
            "category",
            "code",
            "description",
            "datasource_name",
            "spec",
            "thumbnail",
            "transparency",
            "min_scale",
            "max_scale",
            "render_order",
            "attribution",
            "control_item_class",
        ]

        layer_rec = self.layerRec(layer_name)

        layer_def = OrderedDict()
        for prop in props:
            value = layer_rec[prop]

            if prop == "datasource_name":
                prop = "datasource"

            if prop in ["spec"] and value:
                value = json.loads(value)

            if value != None:
                layer_def[prop] = value

        feature_item_defs = layer_rec.feature_item_defs()
        if feature_item_defs:
            layer_def["feature_types"] = feature_item_defs

        return layer_def

    def createLayer(self, layer_def):
        """
        Insert a layer definition using info in dict LAYER_DEF
        """
        # Copy definition (because we will destroy it)
        layer_def = copy.copy(layer_def)

        # Check definition has mandatory fields
        for prop in ["name", "category", "datasource", "spec"]:
            if not prop in layer_def:
                raise MywError("Layer definition missing mandatory property:", prop)

        # Check for no such datasource
        name = layer_def["datasource"]
        if not self.db.dd.datasourceRec(name):
            raise MywError("Unknown datasource:", name)

        # Deal with defaults
        if not "min_scale" in layer_def:
            layer_def["min_scale"] = 0
        if not "max_scale" in layer_def:
            layer_def["max_scale"] = 20

        # Check for code already in use
        code = layer_def.get("code")
        if code != None:
            code_layer_rec = self.layerRecWithCode(code)
            if code_layer_rec:
                self.progress(
                    "warning", "Layer code", code, "already in use by layer", code_layer_rec.name
                )
                layer_def.pop("code")  # ENH: Generate something unique instead

        # Remove compound properties
        feature_types = layer_def.pop("feature_types", None)

        # default display_name to name
        if not "display_name" in layer_def:
            layer_def["display_name"] = layer_def["name"]

        # Construct record
        layer_rec = MywLayer()

        # Set simple properties
        for (prop, value) in list(layer_def.items()):

            if prop in ["visible"]:
                self.progress(5, "Property no longer supported:", prop)
                continue

            if prop == "datasource":
                prop = "datasource_name"

            if not prop in list(layer_rec.__table__.columns.keys()):
                raise MywError("Bad property in layer definition:", prop)

            if prop == "spec" and value != None:
                value = json.dumps(value)

            layer_rec[prop] = value

        # default display_name to name
        if not layer_rec.display_name:
            layer_rec.display_name = layer_rec.name

        # Insert it (and get an ID)
        self.db.session.add(layer_rec)
        self.db.session.flush()

        # Set substructure
        if feature_types:
            layer_rec.set_feature_items(feature_types, skip_unknown=True, progress=self.progress)

        self.db.session.flush()

    def updateLayer(self, layer_name, layer_def):
        """
        Update a layer definition using info in dict LAYER_DEF
        """

        # Copy definition (because we will destroy it)
        layer_def = copy.copy(layer_def)

        # Get existing record
        layer_rec = self.layerRec(layer_name)

        # Remove compound properties
        feature_types = layer_def.pop("feature_types", None)

        # Update simple properties
        for prop, value in list(layer_def.items()):

            if prop in ["visible"]:
                self.progress(5, "Property no lonegr supported:", prop)
                continue

            if prop == "datasource":
                prop = "datasource_name"
                if not self.db.dd.datasourceRec(value):
                    raise MywError("Unknown datasource:", value)

            if prop in ["spec"] and value != None:
                value = json.dumps(value)

            if layer_rec[prop] != value:
                self.progress(2, "Setting", prop, "=", value)
                layer_rec[prop] = value

        # default display_name to name
        if not layer_rec.display_name:
            layer_rec.display_name = layer_rec.name

        # Update substructure
        if feature_types:
            layer_rec.set_feature_items(feature_types, skip_unknown=True, progress=self.progress)

        # Send updates to database
        self.db.session.flush()

    def dropLayer(self, layer_name):
        """
        Delete definition for LAYER_NAME (which must exist)
        """

        # Get record
        layer_rec = self.layerRec(layer_name)

        # Delete it (avoiding cascade delete problems in Oracle)
        for rec in layer_rec.substructure():
            self.db.session.delete(rec)
        self.db.session.flush()

        self.db.session.delete(layer_rec)

    def layerRec(self, name):
        """
        The layer record with name NAME (if any)
        """

        return self.db.session.query(MywLayer).filter(MywLayer.name == name).first()

    def layerRecWithCode(self, code):
        """
        The layer record with code CODE (if any)
        """

        return self.db.session.query(MywLayer).filter(MywLayer.code == code).first()

    # ==============================================================================
    #                                   LAYER GROUPS
    # ==============================================================================

    def layerGroupExists(self, name):
        """
        True if there is a layer group definition NAME
        """

        return self.layerGroupNames(name)  # ENH: Faster just to get record

    def layerGroupNames(self, filter=None, sort=False, warn_if_no_match=False):
        """
        Returns the names of the layer group names in self

        Optional filter is a fnmatch-style filter"""

        return self._namesFrom(MywLayerGroup, filter, sort, warn_if_no_match, "layer groups")

    def layerGroupRec(self, name):
        """
        Returns layer group record for NAME (if it exists)
        """

        return self.db.session.query(MywLayerGroup).filter(MywLayerGroup.name == name).first()

    def createLayerGroup(self, group_def):
        """
        Insert a layer group definition using info in dict GROUP_DEF
        """

        # Check definition has mandatory fields
        for prop in ["name", "layers", "exclusive"]:
            if not prop in group_def:
                raise MywError("Layer definition missing mandatory property:", prop)

        # Construct record
        rec = MywLayerGroup()

        for (prop, value) in list(group_def.items()):

            if prop == "layers":
                continue

            if not prop in list(rec.__table__.columns.keys()):
                raise MywError("Bad property in layer group definition:", prop)

            rec[prop] = value

        # default display_name to name
        if not rec.display_name:
            rec.display_name = rec.name

        # Insert it (and get an ID)
        self.db.session.add(rec)
        self.db.session.flush()

        # Set substructure
        rec.setLayers(group_def["layers"])

        self.db.session.flush()

    def updateLayerGroup(self, name, group_def):
        """
        Update a layer group definition from dict GROUP_DEF

        GROUP_DEF is a dict in the form created by
        MywLayerGroup.Serialise(). Properties not in the dict are
        left unchanged"""

        # Get existing record
        rec = self.layerGroupRec(name)

        # Update simple properties
        for prop, value in list(group_def.items()):

            if prop == "layers":
                continue

            if rec[prop] != value:
                self.progress(2, "Setting", prop, "=", value)
                rec[prop] = value

        # default display_name to name
        if not rec.display_name:
            rec.display_name = rec.name

        # Update substructure
        layer_names = group_def.get("layers")
        if layer_names and layer_names != rec.layerNames():
            self.progress(2, "Setting", "layers", "=", layer_names)
            rec.setLayers(layer_names)

        # Send updates to database
        self.db.session.flush()

    def dropLayerGroup(self, name):
        """
        Delete group definition for LAYER_NAME (which must exist)
        """

        # Get record
        rec = self.db.session.query(MywLayerGroup).filter(MywLayerGroup.name == name).first()

        # Delete it
        for sub_rec in rec.substructure():
            self.db.session.delete(sub_rec)
        self.db.session.flush()

        self.db.session.delete(rec)

    # ==============================================================================
    #                                  PRIVATE LAYERS
    # ==============================================================================

    def privateLayerExists(self, layer_id):
        """
        True if user layer LAYER_ID exists
        """

        return self.privateLayerRec(layer_id) != None

    def privateLayerRec(self, layer_id):
        """
        Returns the database record identified by LAYER_ID
        """

        return self.db.session.query(MywPrivateLayer).get(layer_id)

    def privateLayerRecs(self, full_name_spec="*", sort=False, warn_if_no_match=False):
        """
        Returns the user group records in self

        Optional FULL_NAME_SPEC is a fnmatch-style filter of the form <owner_spec>:<name_spec>"""

        # Unpick name spec
        if ":" in full_name_spec:
            (owner_spec, name_spec) = full_name_spec.split(":", 1)
        else:
            owner_spec = full_name_spec
            name_spec = None

        # Get records
        recs = self.db.session.query(MywPrivateLayer)
        if owner_spec:
            recs = recs.filter(MywPrivateLayer.fnmatch_filter("owner", owner_spec))
        if name_spec:
            recs = recs.filter(MywPrivateLayer.fnmatch_filter("name", name_spec))
        recs = recs.all()

        # Check for nothing found
        if warn_if_no_match and full_name_spec and not recs:
            self.progress("warning", "No layer matching:", full_name_spec)

        # Sort
        if sort:
            sort_key = lambda rec: (rec.owner, rec.name)
            recs = sorted(recs, key=sort_key)

        return recs

    def createPrivateLayer(self, layer_def):
        """
        Update a private layer from dict LAYER_DEF
        """

        layer_def = layer_def.copy()

        # Create detached record
        layer_rec = MywPrivateLayer(owner=layer_def.pop("owner"), name=layer_def.pop("name"))

        # Set properties
        for prop, value in list(layer_def.items()):

            if not prop in list(layer_rec.__table__.columns.keys()):
                raise MywError("Bad property in layer definition:", prop)

            if prop in ["spec", "datasource_spec"] and value != None:
                value = json.dumps(value)

            layer_rec[prop] = value

        # Add it to database
        layer_rec.setId()
        self.db.session.add(layer_rec)

    def updatePrivateLayer(self, id, layer_def):
        """
        Create a private layer from dict LAYER_DEF
        """

        # Create detached record
        layer_rec = self.privateLayerRec(id)

        # Set properties
        for prop, value in list(layer_def.items()):

            # TODO: Prevent change of owner and name

            if not prop in list(layer_rec.__table__.columns.keys()):
                raise MywError("Bad property in layer definition:", prop)

            if prop in ["spec", "datasource_spec"] and value != None:
                value = json.dumps(value)

            layer_rec[prop] = value

    def dropPrivateLayer(self, layer_id):
        """
        Delete user USER_NAME (which must exist)
        """

        layer_rec = self.privateLayerRec(layer_id)
        self.db.session.delete(layer_rec)
        self.db.session.flush()

    # ==============================================================================
    #                                   NETWORKS
    # ==============================================================================

    def networkExists(self, name):
        """
        True if there is a network definition NAME
        """

        return self.networkRec(name) != None

    def networkNames(self, filter=None, sort=False, warn_if_no_match=False):
        """
        Returns the names of the network names in self

        Optional filter is a fnmatch-style filter"""

        return self._namesFrom(MywNetwork, filter, sort, warn_if_no_match, "networks")

    def networkDef(self, name):
        """
        Returns definition of network NAME as a dict
        """
        # ENH: Better to return rec and use rec.definition()?

        rec = self.networkRec(name, error_if_none=True)

        return rec.definition()

    def createNetwork(self, network_def):
        """
        Insert a network definition using info in dict NETWORK_DEF
        """

        # Copy definition (because we will destroy it)
        network_def = copy.copy(network_def)

        # Check definition has mandatory fields
        for prop in ["name", "topology"]:
            if not prop in network_def:
                raise MywError("Network definition missing mandatory property:", prop)

        # Remove compound properties
        feature_items = network_def.pop("feature_types", None)

        # Construct record
        rec = MywNetwork()

        # Set simple properties
        for (prop, value) in list(network_def.items()):

            if not prop in list(rec.__table__.columns.keys()):
                raise MywError("Bad property in network definition:", prop)

            rec[prop] = value

        # Ensure mandatory fields are populated
        rec.set_backstops()

        # Insert it (and get an ID)
        self.db.session.add(rec)
        self.db.session.flush()

        # Set substructure
        if feature_items:
            rec.set_feature_items(feature_items, skip_unknown=True, progress=self.progress)

        self.db.session.flush()

    def updateNetwork(self, name, network_def):
        """
        Update a network definition using info in dict NETWORK_DEF
        """

        # Copy definition (because we will destroy it)
        network_def = copy.copy(network_def)

        # Get existing record
        rec = self.networkRec(name)

        # Remove compound properties
        feature_items = network_def.pop("feature_types", None)

        # Update simple properties
        for prop, value in list(network_def.items()):

            if rec[prop] != value:
                self.progress(2, "Setting", prop, "=", value)
                rec[prop] = value

        # Ensure mandatory fields are still populated
        rec.set_backstops()

        # Update substructure
        if feature_items:
            rec.set_feature_items(feature_items, skip_unknown=True, progress=self.progress)

        # Send updates to database
        self.db.session.flush()

    def dropNetwork(self, name):
        """
        Delete definition for NAME (which must exist)
        """

        # Get record
        rec = self.networkRec(name)

        # Delete it (avoiding cascade delete problems in Oracle)
        for sub_rec in rec.substructure():
            self.db.session.delete(sub_rec)
        self.db.session.flush()

        self.db.session.delete(rec)

    def networkRec(self, name, error_if_none=False):
        """
        The network record with name NAME (if any)
        """

        rec = self.db.session.query(MywNetwork).get(name)

        if error_if_none and not rec:
            raise MywError("No such network:", name)

        return rec

    # ==============================================================================
    #                                   APPLICATIONS
    # ==============================================================================

    def applicationExists(self, application_name):
        """
        True if there is a application definition APPLICATION_NAME
        """

        return self.applicationNames(application_name)

    def applicationNames(
        self, filter=None, sort=False, warn_if_no_match=False, include_config=True
    ):
        """
        Returns the names of the applications in self

        Optional filter is a fnmatch-style filter"""

        names = self._namesFrom(MywApplication, filter, sort, warn_if_no_match, "applications")

        if not include_config and "config" in names:
            names.remove("config")

        return names

    def applicationDef(self, application_name):
        """
        Returns definition of Application APPLICATION_NAME as a dict
        """

        rec = self.applicationRec(application_name)

        application_def = OrderedDict()
        for prop in [
            "name",
            "external_name",
            "description",
            "javascript_file",
            "image_url",
            "for_online_app",
            "for_native_app",
        ]:
            value = rec[prop]
            if value != None:
                application_def[prop] = value

        # Add the accessible layers
        application_def["layers"] = []
        for layer in rec.layer_items():
            # Respect current data structure
            if layer["read_only"] == True or layer["snap"] == True:
                # Only include read_only or snap information if required
                read_only = layer.get("read_only", False)
                snap = layer.get("snap", False)
                layer_info_to_add = {"name": layer["name"]}
                if read_only == True:
                    layer_info_to_add["read_only"] = True
                if snap == True:
                    layer_info_to_add["snap"] = True
                application_def["layers"].append(layer_info_to_add)
            else:
                application_def["layers"].append(layer["name"])

        return application_def

    def applicationRec(self, application_name):
        """
        Returns Application record identified by APPLICATION_NAME
        """

        rec = (
            self.db.session.query(MywApplication)
            .filter(MywApplication.name == application_name)
            .first()
        )

        if not rec:
            self.progress("warning", "No application matching", application_name)

        return rec

    def createApplication(self, application_def):
        """
        Insert an application definition using the info in dict APPLICATION_DEF
        """
        # ENH: unify with MywApplicationController.create() (by moving to model ?)

        # Copy definition (as we will destroy it)
        application_def = copy.copy(application_def)

        # Remove substructure items
        layers = application_def.pop("layers", None)

        # Create detached record
        # ENH: Handle bad keys
        rec = MywApplication()
        for (prop, value) in list(application_def.items()):
            rec[prop] = value

        # Insert it (and allocate an ID)
        self.db.session.add(rec)
        self.db.session.flush()
        new_id = rec.id

        # Insert substructure
        # ENH: Encpsulate on model
        if layers:
            for layer in layers:
                # Handle layer coded as dict with read_only information and as string
                if isinstance(layer, dict):
                    new_layer = self.layerRec(layer["name"])
                    name = layer["name"]
                    read_only = layer.get("read_only", False)
                    snap = layer.get("snap", False)
                else:
                    new_layer = self.layerRec(layer)
                    name = layer
                    read_only = False  # Set read_only to False by default
                    snap = False  # Set snap to False by default

                if new_layer == None:
                    self.progress("warning", "Ignoring unknown layer:", name)
                    continue

                app_layer = MywApplicationLayer(
                    application_id=new_id, layer_id=new_layer.id, read_only=read_only, snap=snap
                )
                self.db.session.add(app_layer)

    def updateApplication(self, name, application_def):
        """
        Update an application definition using info in APPLICATION_DEF dict
        """

        # Copy definition (as we will destroy it)
        application_def = copy.copy(application_def)

        # Remove substructure items
        layers = application_def.pop("layers", None)

        # Get existing record
        rec = (
            self.db.session.query(MywApplication).filter(MywApplication.name == name).first()
        )  # ENH: Encapsulate

        # Update its properties
        for prop, value in list(application_def.items()):
            if rec[prop] != value:
                self.progress(2, "Setting", prop, "=", value)
                rec[prop] = value

        # Update its substructure
        if layers != None:
            rec.set_layers(layers)

        # Send updates to database
        self.db.session.flush()
        return None

    def dropApplication(self, application_name):
        """
        Delete definition for APPLICATION_NAME (which must exist)
        """

        # Get record
        rec = (
            self.db.session.query(MywApplication)
            .filter(MywApplication.name == application_name)
            .first()
        )

        # Delete it (avoiding cascade delete problems in Oracle)
        for sub_rec in rec.substructure():
            self.db.session.delete(sub_rec)
        self.db.session.flush()

        self.db.session.delete(rec)

    # ==============================================================================
    #                                    ROLES
    # ==============================================================================

    def roleExists(self, role_name):
        """
        True if there is a role ROLE_NAME
        """

        return self.roleNames(role_name)

    def roleNames(self, filter=None, sort=False, warn_if_no_match=False):
        """
        Returns the names of the applications in self

        Optional filter is a fnmatch-style filter"""

        return self._namesFrom(MywRole, filter, sort, warn_if_no_match, "roles")

    def roleDef(self, role_name):
        """
        Returns definition of a Role object identified by ROLE_NAME as a dict
        """

        role_rec = self.roleRec(role_name)

        role_def = OrderedDict()
        for prop in ["name", "description"]:
            value = role_rec[prop]
            if value != None:
                role_def[prop] = value

        application_names = role_rec.applicationNames()
        if application_names:
            apps = OrderedDict()
            for application in sorted(application_names):

                def sort_key(right):
                    try:
                        return right["name"]
                    except TypeError:
                        return right

                apps[application] = sorted(
                    role_rec.rightsFor(application, exclude_app_access=True), key=sort_key
                )
            role_def["permissions"] = apps

        return role_def

    def roleRec(self, role_name):
        """
        Returns the database record identified by ROLE_NAME
        """
        # ENH: Raise error if None

        return self.db.session.query(MywRole).filter(MywRole.name == role_name).first()

    def roleRecs(self, role_names):
        """
        Returns the database records identified by ROLE_NAMES (skipping unknown roles)
        """

        role_recs = []

        for role_name in role_names:
            role_rec = self.roleRec(role_name)

            if not role_rec:
                self.progress("warning", "Ignoring unknown role:", role_name)
                continue

            role_recs.append(self.roleRec(role_name))

        return role_recs

    def createRole(self, role_def, warnings_progress=None):
        """
        Create role from information in dict ROLE_DEF
        """

        # ENH: Duplicates code with model?

        role_rec = MywRole()

        # Set simple properties
        for (prop, value) in list(role_def.items()):
            if prop == "permissions":
                continue

            role_rec[prop] = value

        # Insert new Role into DB
        self.db.session.add(role_rec)

        # Deal with sub-structure (permissions)
        self.db.session.flush()  # Get ID for new record
        new_id = role_rec.id

        if "permissions" in role_def:

            for application_name, rights in role_def["permissions"].items():

                # Get application
                app = (
                    self.db.session.query(MywApplication)
                    .filter(MywApplication.name == application_name)
                    .first()
                )

                if app == None:
                    self.progress(
                        "warning", "Ignoring permissions for unknown application:", application_name
                    )  # ENH: Better as error?
                    continue

                # Add access right
                rights.append("accessApplication")

                # Build permissions records
                for right in rights:
                    try:
                        right_name = right["name"]
                        restrictions = right["restrictions"]
                    except TypeError:
                        # right is just a name as a string.
                        right_name = right
                        restrictions = None

                    right_rec = (
                        self.db.session.query(MywRight).filter(MywRight.name == right_name).first()
                    )

                    if right_rec == None:
                        self.progress(
                            "warning", "Ignoring unknown right:", right_name
                        )  # ENH: Better as error?
                        continue

                    permission = MywPermission(
                        role_id=new_id,
                        application_id=app.id,
                        right_id=right_rec.id,
                        restrictions=restrictions,
                    )

                    permission.assertValid(warnings_progress=warnings_progress)

                    self.db.session.add(permission)

    def updateRole(self, role_name, role_def):
        """
        Update an existing role using the info in the ROLE_DEF dict
        """

        # Get existing record
        role_rec = self.db.session.query(MywRole).filter(MywRole.name == role_name).first()

        # Update the permissions
        try:
            p = role_def["permissions"]
        except KeyError:
            p = {}
        role_rec.setRights(p)

        # Update its properties
        for prop, value in list(role_def.items()):

            if prop == "permissions":
                continue

            if role_rec[prop] != value:
                self.progress(2, "Setting", prop, "=", value)
                role_rec[prop] = value

        # Send updates to database
        self.db.session.flush()
        return None

    def dropRole(self, role_name):
        """
        Delete definition for ROLE_NAME (which must exist)
        """

        # Get record
        role_rec = self.roleRec(role_name)

        # Delete it (avoiding cascade delete problems in Oracle)
        for rec in role_rec.substructure():
            self.db.session.delete(rec)
        self.db.session.flush()

        self.db.session.delete(role_rec)

    # ==============================================================================
    #                                    USERS
    # ==============================================================================

    def userExists(self, user_name):
        """
        True if there is a user USER_NAME
        """

        return self.userNames(user_name)

    def userNames(self, filter=None, sort=False, warn_if_no_match=False):
        """
        Returns the names of the users in self's database

        Optional filter is a fnmatch-style filter"""

        return self._namesFrom(MywUser, filter, sort, warn_if_no_match, "users", attrib="username")

    def userRec(self, user_name):
        """
        Returns the database record identified by USER_NAME
        """

        user_rec = self.db.session.query(MywUser).filter(MywUser.username == user_name).first()
        # ENH: check not None
        return user_rec

    def userDef(self, user_name):
        """
        Returns definition of a user object identified by USER_NAME as a dict
        """

        user_rec = self.userRec(user_name)

        user_def = OrderedDict()

        # Add basic properties
        for prop in ["username", "email", "password", "locked_out"]:
            value = user_rec[prop]
            if value != None:
                user_def[prop] = value

        # Add substructure
        user_def["roles"] = sorted(user_rec.role_names())
        user_def["state"] = user_rec.application_states()
        user_def["bookmarks"] = user_rec.bookmarks()

        return user_def

    def createUser(self, user_def):
        """
        Create a user from dict USER_DEF
        """

        # ENH: Use a transaction
        try:

            # Copy definition (since we will destroy it)
            user_def = copy.copy(user_def)

            # Remove compound properties
            role_names = user_def.pop("roles", None)
            state = user_def.pop("state", None)
            bookmarks = user_def.pop("bookmarks", None)

            # Create detached record
            user_rec = MywUser()
            user_rec.email = " "  # ENH: Chnage data-model to permit NULL
            user_rec.password = " "  # ENH: Chnage data-model to permit NULL
            user_rec.locked_out = False

            # Set properties
            # ENH: Handle bad properties cleanly
            for (prop, value) in list(user_def.items()):
                user_rec[prop] = value

            # Insert into DB
            self.db.session.add(user_rec)
            self.db.session.flush()  # Get ID for new record

            # Set substructure
            if role_names != None:
                user_rec.set_roles(self.roleRecs(role_names))
            if state != None:
                user_rec.setState(state)
            if bookmarks != None:
                user_rec.setBookmarks(bookmarks)

        except UserWarning as w:
            self.progress("warning", w)

    def updateUser(self, user_name, user_def):
        """
        Update an existing user using the info in the USER_DEF dict
        """
        # ENH: Shared code with createUser()

        # Copy definition (since we will destroy it)
        user_def = copy.copy(user_def)

        # Remove compound properties
        role_names = user_def.pop("roles", None)
        state = user_def.pop("state", None)
        bookmarks = user_def.pop("bookmarks", None)

        # Get existing record
        user_rec = self.db.session.query(MywUser).filter(MywUser.username == user_name).first()

        # Update record properties
        # ENH: Handle bad properties cleanly
        for prop, value in list(user_def.items()):
            if user_rec[prop] != value:
                self.progress(2, "Setting", prop, "=", value)
                user_rec[prop] = value

        # Update substructure
        if role_names != None:
            user_rec.set_roles(self.roleRecs(role_names))
        if state != None:
            user_rec.setState(state)
        if bookmarks != None:
            user_rec.setBookmarks(bookmarks)

        # Send updates to database
        self.db.session.flush()

        return user_rec

    def dropUser(self, user_name):
        """
        Delete user USER_NAME (which must exist)
        """

        # Get record
        user_rec = self.userRec(user_name)

        # Delete it (avoiding cascade delete problems in Oracle)
        for rec in user_rec.substructure():
            self.db.session.delete(rec)
        self.db.session.flush()

        self.db.session.delete(user_rec)
        self.db.session.flush()

    # ==============================================================================
    #                                   USER GROUPS
    # ==============================================================================

    def groupExists(self, group_id):
        """
        True if user group GROUP_ID exists
        """

        return self.groupRec(group_id) != None

    def groupRec(self, group_id):
        """
        Returns the database record identified by OWNER,NAME
        """

        return self.db.session.query(MywGroup).get(group_id)

    def groupRecs(self, full_name_spec="*", sort=False, warn_if_no_match=False):
        """
        Returns the user group records in self

        Optional FULL_NAME_SPEC is a fnmatch-style filter of the form <owner_spec>:<name_spec>"""

        # Unpick name spec
        if ":" in full_name_spec:
            (owner_spec, name_spec) = full_name_spec.split(":", 1)
        else:
            owner_spec = full_name_spec
            name_spec = None

        # Get records
        recs = self.db.session.query(MywGroup)
        if owner_spec:
            recs = recs.filter(MywGroup.fnmatch_filter("owner", owner_spec))
        if name_spec:
            recs = recs.filter(MywGroup.fnmatch_filter("name", name_spec))
        recs = recs.all()

        # Check for nothing found
        if warn_if_no_match and full_name_spec and not recs:
            self.progress("warning", "No", "group", "matching:", full_name_spec)

        # Sort
        if sort:
            sort_key = lambda rec: (rec.owner, rec.name)
            recs = sorted(recs, key=sort_key)

        return recs

    def createGroup(self, group_def):
        """
        Create a group from dict USER_DEF
        """

        # Create detached record
        group_rec = MywGroup()

        # Set properties
        group_rec.setFields(group_def, skip=["members"])
        group_rec.setId()

        # Insert into DB
        self.db.session.add(group_rec)
        self.db.session.flush()

        # Set substructure
        group_rec.setMembers(group_def.get("members", []))

    def updateGroup(self, group_id, group_def):
        """
        Update an existing user using the info in the USER_DEF dict
        """

        # Get existing record
        group_rec = self.groupRec(group_id)

        # Update properties
        group_rec.setFields(group_def, skip=["members"], immutable=["id", "owner", "name"])

        # Update substructure
        group_rec.setMembers(group_def.get("members", []))

    def dropGroup(self, group_id):
        """
        Delete user USER_NAME (which must exist)
        """

        # Get record
        group_rec = self.groupRec(group_id)

        # Delete it (avoiding cascade delete problems in Oracle)
        for rec in group_rec.substructure():
            self.db.session.delete(rec)
        self.db.session.flush()

        self.db.session.delete(group_rec)
        self.db.session.flush()

    # ==============================================================================
    #                                    NOTIFICATIONS
    # ==============================================================================

    def createNotification(self, type, subject, details, for_online_app, for_native_app):
        """
        Add an administrator notification
        """

        rec = MywNotification(
            type=type,
            subject=subject,
            details=details,
            for_online_app=for_online_app,
            for_native_app=for_native_app,
        )

        self.db.session.add(rec)

        return rec

    def notifications(self, spec="*", before=None):
        """
        Administrator notifications matching SPEC (in id order)

        Optional BEFORE is a datetime (for use as filter on the .created field)

        Returns a list of records"""

        query = self.db.session.query(MywNotification).order_by(MywNotification.id)

        if spec != "*":
            query = query.filter(MywNotification.fnmatch_filter("subject", spec))

        if before != None:
            query = query.filter(MywNotification.created < before)

        return query.all()

    # ==============================================================================
    #                                   TABLE SETS
    # ==============================================================================
    # ENH: Move to replication manager .. with replicas, extracts etc

    def tableSetExists(self, table_set_name):
        """
        True if there is a table_set TABLE_SET_NAME
        """

        return len(self.tableSetNames(table_set_name)) > 0

    def tableSetNames(self, filter=None, sort=False, warn_if_no_match=False):
        """
        Returns the names of the table_sets in self's database

        Optional filter is a fnmatch-style filter"""

        return self._namesFrom(
            MywTableSet, filter, sort, warn_if_no_match, "table sets", attrib="id"
        )

    def tableSetInUse(self, table_set_name):
        """
        True if TABLE_SET_NAME is referenced by any extract
        """

        query = self.db.session.query(MywExtract).filter(MywExtract.table_set == table_set_name)

        return query.first() != None

    def tableSetRec(self, table_set_name):
        """
        Returns the database record identified by TABLE_SET_NAME
        """
        # ENH: check result not None

        return self.db.session.query(MywTableSet).get(table_set_name)

    def tableSetDef(self, table_set_name):
        """
        Returns definition of TABLE_SET_NAME as a dict
        """

        table_set_rec = self.tableSetRec(table_set_name)

        return table_set_rec.definition()

    def createTableSet(self, table_set_def):
        """
        Create a table_set from dict TABLE_SET_DEF
        """

        # ENH: Use a transaction
        try:
            # Create detached record
            rec = MywTableSet()
            self.db.session.add(rec)

            # Set its properties
            # ENH: Handle bad properties cleanly
            rec.update_from(table_set_def)

        except Exception:
            self.db.session.rollback()
            raise

    def updateTableSet(self, table_set_name, table_set_def):
        """
        Update an existing table_set using the info in the TABLE_SET_DEF dict
        """
        # ENH: Shared code with createTableSet()

        # Copy definition (since we will destroy it)
        table_set_def = copy.copy(table_set_def)

        # Get record
        table_set_name = table_set_def.pop("name")
        table_set_rec = self.tableSetRec(table_set_name)

        # Update it
        table_set_rec.update_from(table_set_def, progress=self.progress)

        return table_set_rec

    def dropTableSet(self, table_set_name):
        """
        Delete table set TABLE_SET_NAME (which must exist)
        """

        # Get record
        table_set_rec = self.tableSetRec(table_set_name)

        # Delete it
        table_set_rec.delete()

    # ==============================================================================
    #                                   HELPERS
    # ==============================================================================

    def _namesFrom(self, model, filter, sort, warn_if_no_match, object_type, attrib=None):
        """
        Returns name field from records in table MODEL

        Optional FILTER is an fnmatch-style filter"""

        if not attrib:
            attrib = "name"

        # Find records
        recs = self.db.session.query(model)

        if filter:
            recs = recs.filter(model.fnmatch_filter(attrib, filter))

        # Get names
        names = [rec[attrib] for rec in recs]

        # Check for nothing found
        if warn_if_no_match and filter and not names:
            self.progress("warning", "No", object_type, "matching:", filter)

        # Sort names
        if sort:
            names = sorted(names)

        return names
