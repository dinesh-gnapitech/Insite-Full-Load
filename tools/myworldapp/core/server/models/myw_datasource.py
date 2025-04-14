################################################################################
# Record exemplar for myw.datasource
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json
from copy import copy, deepcopy

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler, MywLazyJsonFormatter
from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.database.myw_ogc_datasource_engine import MywOgcDatasourceEngine
from myworldapp.core.server.database.myw_esri_rest_datasource_engine import (
    MywEsriRestDatasourceEngine,
)
from myworldapp.core.server.dd.myw_feature_descriptor import MywFeatureDescriptor


# Supported properties in spec field (keyed by datasource type)
# Note: Taken from definitions in config page JavaScript
spec_field_schemas = {
    "bing": {"license": {"type": "string"}},
    "built_in": {},
    "esri": {
        "url": {"type": "string"},
        "esriServerType": {"type": "string", "values": ["", "MapServer", "FeatureServer"]},
        "verifySsl": {"type": "boolean"},
        "username": {"type": "string"},
        "password": {"type": "string"},
        "authType": {"type": "string", "values": ["", "token", "ntlm"]},
        "featureTypes": {"type": "json"},
    },
    "generic": {"layerClass": {"type": "string"}, "fixedArguments": {"type": "json"}},
    "generic_tiles": {"baseUrl": {"type": "string"}},
    "google": {
        "placesAutoCompleteCountry": {"type": "string"},
        "client": {"type": "string"},
        "channel": {"type": "string"},
        "libraryUrlParams": {"type": "json", "allowNull": True},
    },
    "kml": {"baseUrl": {"type": "string"}},
    "myworld": {
        "tilestore": {"type": "json"},
        "geoserverUrls": {"type": "json"},
        "combineGeoserverRequests": {"type": "boolean"},
    },
    "ogc": {
        "wmsUrl": {"type": "string"},
        "wmsRequestParams": {"type": "json"},
        "wfsUrl": {"type": "string"},
        "wfsVersion": {"type": "string", "values": ["1.0.0", "1.1.0", "2.0.0", ""]},
        "wfsRequestParams": {"type": "json"},
        "caseInsensitive": {"type": "boolean"},
        "tunnelled": {"type": "boolean"},
        "username": {"type": "string"},
        "password": {"type": "string"},
        "featureTypes": {"type": "json"},
    },
}


class MywDatasource(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.datasource
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "datasource")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    def set_backstops(self):
        """
        Set backstop values for unpopulated fields (called on insert)
        """
        # ENH: Find a way to get this called automatically

        if not self.external_name:  # pylint: disable=access-member-before-definition
            self.external_name = self.name

    # ==============================================================================
    #                                 SUBSTRUCTURE
    # ==============================================================================

    def substructure(self):
        """
        The records that depend on self
        """
        # ENH: EXTDD: Add feature defs and layer recs too?

        return []

    @property
    def dd_feature_recs(self):
        """
        Query yielding the feature records that use self
        """

        from .myw_dd_feature import MywDDFeature

        return Session.query(MywDDFeature).filter(MywDDFeature.datasource_name == self.name)

    @property
    def layer_recs(self):
        """
        Query yielding the layers that use self
        """

        from .myw_layer import MywLayer

        return Session.query(MywLayer).filter(MywLayer.datasource_name == self.name)

    # ==============================================================================
    #                                 SERIALIZATION
    # ==============================================================================

    def definition(self, full=True):
        """
        Return self in a serializable format
        """

        props = {
            "name": self.name,
            "external_name": self.external_name,
            "type": self.type,
            "spec": self.get_property("spec"),
        }

        if full:
            props["description"] = self.description

        return props

    # ==============================================================================
    #                                 PROPERTIES
    # ==============================================================================

    def layer_class(self):
        """
        The JavaScript class used to render self's layers (by default)
        """

        # ENH: Support for all types
        if not self.type == "generic":
            return None

        spec = self.get_property("spec", default={})

        return spec.get("layerClass")

    def get_property(self, prop, default=None):
        """
        Get a property of self, handling conversions
        """

        value = self[prop]

        if prop == "spec":
            value = self.json_from_db(prop, value)

        if value == None:
            value = default

        return value

    def set_property(self, prop, value, progress=MywProgressHandler()):
        """
        Set a property of self, handling conversions
        """

        # Check for unknown property
        if not prop in list(self.__table__.columns.keys()):
            raise MywError("Datasource {}: Bad property: '{}'".format(self.name, prop))

        # Handle special fields
        if prop == "spec":
            value = self._json_to_db(prop, value)

        # Get value that will be stored in database (empty strings get converted to null)
        if value == "":
            value = None

        # Set property (if necessary)
        if self[prop] != value:
            progress(2, "Setting", prop, "=", value)
            self[prop] = value

        return value

    def _json_to_db(self, prop, value):
        """
        Convert dictionary VALUE to stored format

        VALUE can be None
        """

        if not value:
            return None

        try:
            return json.dumps(value)

        except Exception as cond:
            msg = "Datasource {}: Error storing field '{}': {}".format(self.name, prop, cond)
            raise MywError(msg, internal_exception=cond)

    def json_from_db(self, prop, value):
        """
        Self's value as a dictionary (or None)
        """

        if not value:
            return None

        try:
            return json.loads(value)

        except Exception as cond:
            msg = "Datasource {}: Error parsing field '{}': {}".format(self.name, prop, cond)
            raise MywError(msg, internal_exception=cond)

    # ==============================================================================
    #                            EXTERNAL DATASOURCE SUPPORT
    # ==============================================================================

    def engine(self, progress=None, user_agent=None, error_if_none=False):
        """
        Self's 'driver' (if there is one)

        Returns a MywDatasourceEngine for accessing DD information
        and data from the external server"""

        if self.type == "ogc":
            return self._ogc_engine(progress, user_agent, error_if_none)

        if self.type == "esri":
            return self._esri_engine(progress, user_agent, error_if_none)

        if error_if_none:
            raise MywError("Datasource does not support import:", self.name)

        return None

    def _esri_engine(self, progress, user_agent, error_if_none):
        """
        Construct engine for an Esri datasource
        """

        spec = self.get_property("spec")
        url = spec.get("url")

        if not url:
            if error_if_none:
                raise MywError("Datasource definition does not include URL", self.name)
            return None

        return MywEsriRestDatasourceEngine(
            url,
            username=spec.get("username"),
            password=spec.get("password"),
            auth_type=spec.get("authType"),
            esri_type=spec.get("esriServerType", "MapServer"),
            verify_ssl=spec.get("verifySsl", True),
            user_agent=user_agent,
            progress=progress,
        )

    def _ogc_engine(self, progress, user_agent, error_if_none):
        """
        Construct engine for an OGC datasource
        """
        spec = self.get_property("spec")

        url = spec.get("wfsUrl")

        if not url:
            if error_if_none:
                raise MywError("Datasource definition does not include WFS spec:", self.name)
            return None

        return MywOgcDatasourceEngine(
            url,
            wfs_params=spec.get("wfsRequestParams"),
            wfs_version=spec.get("wfsVersion"),
            username=spec.get("username"),
            password=spec.get("password"),
            user_agent=user_agent,
            progress=progress,
        )

    def importFeatureType(self, dd, feature_type, engine):
        """
        Get definition of FEATURE_TYPE and store it in data dictionary DD (a mywDD)

        ENGINE is self's engine

        Returns a string indicating the change made"""

        # ENH: Avoid need to pass in engine (make and cache on self)

        # Check for name too long for DD
        # ENH: Get field size from database
        if len(feature_type) > 200:
            dd.progress("warning", "Feature name exceeds max supported length:", feature_type)
            return "skipped"

        # Get definition from external server
        remote_def = engine.get_feature_type_def(feature_type)

        # Get existing definition (if there is one)
        feature_rec = dd.featureTypeRec(self.name, feature_type)

        # Add to DD
        if not feature_rec:
            dd.progress(1, "Adding", feature_type)

            feature_def = deepcopy(remote_def)
            feature_def["datasource"] = self.name

            feature_desc = MywFeatureDescriptor.fromDef(feature_def, add_defaults=True)
            feature_rec = dd.createFeatureType(feature_desc)
            change_type = "insert"
        else:
            dd.progress(1, "Updating", feature_type)

            feature_desc = dd.featureTypeDescriptor(feature_rec)
            old_remote_def = feature_rec.get_property("remote_spec")

            if old_remote_def:
                self.mergeFeatureTypeChanges(feature_desc, old_remote_def, remote_def, dd.progress)
            else:
                feature_desc.update(remote_def)

            dd.alterFeatureType(feature_rec, feature_desc)
            change_type = "update"

        # Save remote definition (for change merging next time)
        remote_def.pop("name")
        remote_def["extras"] = engine.feature_type_info_for(feature_type)

        if feature_rec.get_property("remote_spec") != remote_def:
            feature_rec.set_property("remote_spec", remote_def)

        # Stash extra info about feature in self
        # ENH: EXTDD: Hack until we can do something better
        # ENH: EXTDD: Remove this info if the feature record gets deleted
        if self.type == "esri":
            spec = self.get_property("spec", {})

            feature_types = spec.get("featureTypes")
            if feature_types is None:
                feature_types = spec["featureTypes"] = {}

            esri_info = engine.feature_type_info_for(feature_type)

            feature_types[feature_type] = {}
            feature_types[feature_type]["layerId"] = esri_info["id"]
            feature_types[feature_type]["aliases"] = esri_info["aliases"]

            self.set_property("spec", spec)

        return change_type

    def mergeFeatureTypeChanges(self, local_desc, old_remote_def, new_remote_def, progress):
        """
        Update LOCAL_DESC for changes OLD_REMOTE_DEF -> NEW_REMOTE_DEF

        Finds changes old_remote_desc -> new_remote_desc and applies
        them to LOCAL_DESC if property has not been configured locally."""

        with progress.operation("Checking for changes"):
            progress(8, "Old remote spec:", MywLazyJsonFormatter(old_remote_def))
            progress(8, "New remote spec:", MywLazyJsonFormatter(new_remote_def))

            # Convert to descriptors (to make differencing easy)
            old_remote_desc = MywFeatureDescriptor(local_desc.datasource, local_desc.name).update(
                old_remote_def, skip_keys=["extras"]
            )
            new_remote_desc = MywFeatureDescriptor(local_desc.datasource, local_desc.name).update(
                new_remote_def, skip_keys=["extras"]
            )

            # Update basic properties
            for prop, old_value, new_value in old_remote_desc.basicPropDifferences(new_remote_desc):
                progress(4, "Remote property changed:", prop, ":", old_value, "->", new_value)

                if local_desc[prop] == old_value:
                    local_desc[prop] = new_value

            # Update field definitions
            for field_name, change, diffs_str in old_remote_desc.fieldDifferences(new_remote_desc):

                progress(4, "Remote field", field_name, ":", change, diffs_str)

                if change == "added":
                    local_desc.fields[field_name] = copy(
                        new_remote_desc.fields[field_name]
                    )  # ENH: Cleaner to use addField()

                elif change == "updated":
                    old_field_desc = old_remote_desc.fields[field_name]
                    new_field_desc = new_remote_desc.fields[field_name]
                    local_field_desc = local_desc.fields[field_name]

                    for prop, old_value, new_value in old_field_desc.differences(new_field_desc):
                        if local_field_desc[prop] == old_value:
                            local_field_desc[prop] = new_value

                elif change == "deleted":
                    del local_desc.fields[field_name]

                elif change == "order":
                    pass  # ENH: Handles changes to field order

                else:
                    raise MywInternalError("Bad change type:", change)

    # ==============================================================================
    #                                    VALIDATION
    # ==============================================================================

    def validate(self):
        """
        Check self's integrity

        Yields a error message for each problem found (if any)"""

        spec_schema = spec_field_schemas.get(self.type)

        # Check type
        if spec_schema == None:
            yield "Bad type: {}".format(self.type)
            return

        # Check spec
        spec = self.get_property("spec", {})

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
            # ENH: Check DD and other sub-schemas (use nested schema def)
