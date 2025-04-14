################################################################################
# Controller for data dictionary requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from collections import OrderedDict
from pyramid.view import view_config

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
from myworldapp.core.server.models.myw_dd_field import MywDDField
from myworldapp.core.server.models.myw_dd_field_group import MywDDFieldGroup
from myworldapp.core.server.models.myw_dd_field_group_item import MywDDFieldGroupItem
from myworldapp.core.server.models.myw_search_rule import MywSearchRule
from myworldapp.core.server.models.myw_query import MywQuery
from myworldapp.core.server.models.myw_filter import MywFilter
from myworldapp.core.server.models.myw_dd_enum import MywDDEnum

from myworldapp.core.server.controllers.base.myw_controller import MywController

from myworldapp.core.server.controllers.base.myw_utils import featuresFromRecs
import myworldapp.core.server.controllers.base.myw_globals as myw_globals


class MywDDController(MywController):
    """
    Provides access to DD info
    """

    geom_types = ["point", "linestring", "polygon", "raster"]  # ENH: get these from somewhere

    # ==============================================================================
    #                               SYSTEM ACTIONS
    # ==============================================================================

    @view_config(route_name="myw_dd_controller.index", request_method="GET", renderer="json")
    def index(self):
        """
        Return dd information for the feature types specified in the "types" parameter

        Returns JSON with keys:
          features_dd    Feature type definitions
          enumerators    Definitions of enumerators used by feature types"""
        datasource = self.request.matchdict["datasource"]

        self.current_user.assertAuthorized(self.request)

        feature_defs = {}
        application = self.request.params.get("application")
        feature_types = self.request.params.get("types")

        for feature_type in feature_types.split(","):
            if feature_type == "":
                continue

            feature_dd = self.dd_info_for(datasource, feature_type, application)
            if feature_dd:
                feature_defs[feature_type] = feature_dd

        catalogue_defs = self.catalogue_defs_for(datasource, feature_defs)
        enum_defs = self.enumerators_defs_for(feature_defs, catalogue_defs)

        return {"features_dd": feature_defs, "enumerators": enum_defs, "catalogues": catalogue_defs}

    def dd_info_for(self, datasource, feature_type, application=None):
        """
        Data dictionary information for FEATURE_TYPE in APPLICATION (a dict or None)
        """

        # ENH: Extend config cache to include feature field defs, groups etc and remove this
        feature_rec = (
            Session.query(MywDDFeature)
            .filter(
                (MywDDFeature.datasource_name == datasource)
                & (MywDDFeature.feature_name == feature_type)
            )
            .first()
        )

        if feature_rec is None:
            return None

        (fields_detail, fields_order) = self.field_defs_for(feature_rec)

        feature_dd = {
            "name": feature_type,
            "key_name": feature_rec.key_name,
            "external_name": feature_rec.external_name,
            "title_expr": feature_rec.title_expr,
            "short_description_expr": feature_rec.short_description_expr,
            "fields": fields_detail,
            "fields_order": fields_order,
            "field_groups": self.field_group_defs_for(feature_rec),
            "geometry_type": feature_rec.geometry_type,
            "filters": self.filter_exprs_for(feature_rec, application),
            "editable": feature_rec.editable,
            "track_changes": feature_rec.track_changes,
            "insert_from_gui": feature_rec.insert_from_gui,
            "update_from_gui": feature_rec.update_from_gui,
            "delete_from_gui": feature_rec.delete_from_gui,
            "editor_options": feature_rec.editor_options,
            "geom_indexed": feature_rec.geom_indexed,
        }

        if feature_rec.versioned:
            feature_dd["versioned"] = feature_rec.versioned

        return feature_dd

    def field_defs_for(self, feature_rec):
        """
        Returns a dictionary with the field definitions for FEATURE_TYPE

        Result is keyed on field name
        """

        # ENH: Get via dd.featureTypeDescriptor()

        fields = OrderedDict()
        fields_order = []

        for dd_field in feature_rec.dd_field_recs:
            # key on external_name because that is how field values are currently being keyed when returning results
            # ENH: key on internal name (and do the same for the field values dictionary - myw_dd.__get_column_names_for_request ?)
            field_name = dd_field.internal_name
            fields_order.append(field_name)

            field_def = {
                "internal_name": dd_field.internal_name.encode("utf8"),
                "external_name": dd_field.external_name.encode("utf8"),
                "type": dd_field.type,
                "indexed": dd_field.indexed,
            }

            if dd_field.enum:
                field_def["enum"] = dd_field.enum

            if dd_field.unit:
                field_def["unit"] = dd_field.unit

            if dd_field.display_unit:
                field_def["display_unit"] = dd_field.display_unit

            if dd_field.unit_scale:
                field_def["unit_scale"] = dd_field.unit_scale

            if dd_field.display_format:
                field_def["display_format"] = dd_field.display_format

            if dd_field.min_value is not None:  # integer fields need "is not None"
                field_def["min_value"] = dd_field.min_value

            if dd_field.max_value is not None:  # integer fields need "is not None"
                field_def["max_value"] = dd_field.max_value

            if dd_field.generator:
                field_def["generator"] = dd_field.generator

            if dd_field.default:
                field_def["default"] = dd_field.default

            if (
                dd_field.mandatory is not None and dd_field.mandatory != "false"
            ):  # boolean fields need "is not None"
                field_def["mandatory"] = dd_field.mandatory

            if dd_field.value:
                field_def["value"] = dd_field.value

            if (
                dd_field.read_only is not None and dd_field.read_only != "false"
            ):  # boolean fields need "is not None"
                field_def["read_only"] = dd_field.read_only

            if (
                dd_field.visible is not None and dd_field.visible != "true"
            ):  # boolean fields need "is not None"
                field_def["visible"] = dd_field.visible

            if dd_field.viewer_class:
                field_def["viewer_class"] = dd_field.viewer_class

            if dd_field.editor_class:
                field_def["editor_class"] = dd_field.editor_class

            if dd_field.new_row is not None and dd_field.new_row != True:
                field_def["new_row"] = dd_field.new_row

            if dd_field.validators:
                field_def["validators"] = dd_field.validators

            if dd_field.creates_world_type:
                field_def["creates_world_type"] = dd_field.creates_world_type

            fields[field_name] = field_def

        return fields, fields_order

    def field_group_defs_for(self, feature_rec):
        """
        Get the field group definitions for FEATURE_NAME

        Returns a list of field group definitions, each of which
        includes a property 'fields' that lists the fields in the
        group
        """

        # ENH: Move part to model.dd_field_group which would return record objects

        field_group_defs = []

        query = Session.query(MywDDFieldGroupItem, MywDDFieldGroup).outerjoin(
            (MywDDFieldGroup, MywDDFieldGroupItem.container_id == MywDDFieldGroup.id)
        )
        query = query.filter(
            (MywDDFieldGroup.feature_name == feature_rec.feature_name)
            & (MywDDFieldGroup.datasource_name == feature_rec.datasource_name)
        )
        query = query.order_by(MywDDFieldGroup.display_position.asc())
        query = query.order_by(MywDDFieldGroupItem.display_position.asc())

        field_group_id = None

        for field_group_item, field_group in query:

            if field_group.id != field_group_id:
                field_group_id = field_group.id
                field_group_def = {
                    "display_name": field_group.display_name.encode("utf8"),
                    "position": field_group.display_position,
                    "is_expanded": field_group.is_expanded,
                    "visible": field_group.visible,
                    "fields": [],
                }
                field_group_defs.append(field_group_def)

            field_def = {
                "field_name": field_group_item.field_name.encode("utf8"),
                "position": field_group_item.display_position,
            }

            field_group_def["fields"].append(field_def)

        return field_group_defs

    def filter_exprs_for(self, feature_rec, application):
        """
        Filter expressions for FEATURE_TYPE (a dict, keyed by filter name)

        Note: Returns only filters accessible to APPLICATION (for consistency with Native App)"""

        feature_def = self.current_user.featureTypeDef(
            application, feature_rec.datasource_name, feature_rec.feature_name
        )
        if feature_def is None:
            return None

        return feature_def["filter_exprs"]

    def enumerators_defs_for(self, feature_defs, catalogue_defs):
        """
        Enumerator definitions for enums used by FEATURE_TYPES (a dict, keyed by enum name)
        """

        # Build list with the enumerators that we need to describe
        enum_names = set()
        for feature_def in feature_defs.values():
            for field_def in feature_def["fields"].values():
                if "enum" in field_def:
                    enum_names.add(field_def["enum"])

        # this section is very similar to the previous section but it's a bit of a "coincidence" so prefer to have the duplication
        for catalogue in catalogue_defs.values():
            for field_def in catalogue["fields"].values():
                if "enum" in field_def:
                    enum_names.add(field_def["enum"])

        # Get the enumerator details for each of the enumerators
        enums = OrderedDict()
        for enum_name in enum_names:
            enums[enum_name] = self.enum_details_for(enum_name)

        return enums

    def enum_details_for(self, enum_name):
        """
        Gets a.definitiond version of the enumerator with name ENUM_NAME

        Returns None if there isn't such an enumerator in the database"""
        query = Session.query(MywDDEnum).filter(MywDDEnum.name == enum_name)
        enum = query.first()

        if enum is not None:
            return enum.definition()

        return None

    def catalogue_defs_for(self, datasource, feature_defs):
        """
        Catalogue definitions for enums used by fields in  FEATURE_DEFS
        """

        catalogues = {}

        for feature_def in list(feature_defs.values()):
            for field_def in feature_def["fields"].values():
                if "enum" not in field_def:
                    continue

                enum_parts = field_def["enum"].split(".")
                if len(enum_parts) < 2:
                    continue
                feature_type = enum_parts[0]

                if feature_type not in catalogues:
                    catalogues[feature_type] = self.catalogue_details_for(datasource, feature_type)

        return catalogues

    def catalogue_details_for(self, datasource, feature_type):
        """
        Gets the values of the catalogue FEATURE_TYPE
        """

        self.db = myw_globals.db
        feature_dd = self.dd_info_for(datasource, feature_type)
        fields = OrderedDict()

        for field_name, field_def in feature_dd["fields"].items():
            if "enum" in field_def:
                fields[field_name] = {"enum": field_def["enum"]}

        table = self.db.view().table(feature_type)
        recs = table.all()
        features = featuresFromRecs(recs)
        # return only the properties (as a catalogue they're the only relevant details)
        records = [f.properties for f in features]
        return {"fields": fields, "records": records}

    # ==============================================================================
    #                            CONFIG ACTIONS
    # ==============================================================================

    @view_config(
        route_name="myw_dd_controller.features_basic", request_method="GET", renderer="json"
    )
    def features_basic(self):
        """
        Get basic properties of all feature types

        Returns a list of dicts"""
        datasource = self.request.matchdict["datasource"]

        self.current_user.assertAuthorized(self.request, application="config")

        # Unpick params
        geom_type = self.request.params.get("geom_type")

        # Build query
        query = Session.query(MywDDFeature).filter(MywDDFeature.datasource_name == datasource)
        if geom_type:
            if geom_type == "none":
                geom_type = None
            query = query.filter(MywDDFeature.geometry_type == geom_type)

        # Extract required properties
        feature_infos = []
        for feature in query.order_by(MywDDFeature.feature_name):

            info = {
                "name": feature.feature_name,
                "external_name": feature.external_name,
                "geometry_type": feature.geometry_type,
                "title_expr": feature.title_expr,
                "short_description_expr": feature.short_description_expr,
                "editable": feature.editable,
                "track_changes": feature.track_changes,
            }

            feature_infos.append(info)

        # Sort list (to get consistent results on all platforms)
        # Note: Necessary because Postgres prioritises underscore differently on windows and linux
        sort_proc = lambda item: item["name"]
        feature_infos = sorted(feature_infos, key=sort_proc)

        return {"feature_types": feature_infos}

    @view_config(route_name="myw_dd_controller.searches", request_method="GET", renderer="json")
    def searches(self):
        """
        The searches for features from DATASOURCE
        """
        datasource = self.request.matchdict["datasource"]
        search_query = Session.query(MywSearchRule).filter(
            MywSearchRule.datasource_name == datasource
        )
        searches = []

        for search_entry in search_query:
            searches.append(search_entry.definition())

        return {"searches": searches}

    @view_config(route_name="myw_dd_controller.queries", request_method="GET", renderer="json")
    def queries(self):
        """
        The queries for features from DATASOURCE
        """
        datasource = self.request.matchdict["datasource"]
        query_query = Session.query(MywQuery).filter(MywQuery.datasource_name == datasource)
        queries = []

        for query_entry in query_query:
            queries.append(query_entry.definition())

        return {"queries": queries}

    @view_config(route_name="myw_dd_controller.filters", request_method="GET", renderer="json")
    def filters(self):
        """
        The filters for features from DATASOURCE
        """
        datasource = self.request.matchdict["datasource"]
        filter_query = Session.query(MywFilter).filter(MywFilter.datasource_name == datasource)
        filters = []

        for filter_entry in filter_query:
            filters.append(filter_entry.definition())

        return {"filters": filters}

    @view_config(route_name="myw_dd_controller.fields", request_method="GET", renderer="json")
    def fields(self):
        """
        The fields for features from DATASOURCE
        Used in the networks config page

        A 'types' param can be sent with a value 'geometry' to only get the geom fields
        Used in layer config page"""
        datasource = self.request.matchdict["datasource"]

        self.current_user.assertAuthorized(self.request, application="config")

        # Unpick args
        field_types = self.request.params.get("types")

        # Build lookup from feature name -> rec
        feature_recs_query = Session.query(MywDDFeature).filter(
            MywDDFeature.datasource_name == datasource
        )

        feature_info = {}
        for feature_rec in feature_recs_query:
            new_info = {"table_external_name": feature_rec.external_name}

            if feature_rec.remote_spec is not None:
                new_info["remote_spec"] = feature_rec.remote_spec

            feature_info[feature_rec.feature_name] = new_info

        # Build list of geom fields
        field_recs = Session.query(MywDDField).filter(MywDDField.datasource_name == datasource)

        if field_types == "geometry":
            field_recs = field_recs.filter(MywDDField.type.in_(self.geom_types))

        field_defs = []

        for field_rec in field_recs.all():
            field_def = {
                "internal_name": field_rec["internal_name"],
                "external_name": field_rec["external_name"],
                "table_name": field_rec["table_name"],
                "type": field_rec["type"],
                "min_value": field_rec["min_value"],
                "max_value": field_rec["max_value"],
                "value": field_rec["value"],
            }

            extra_info = feature_info[field_rec.table_name]
            for key, value in extra_info.items():
                field_def[key] = value

            field_defs.append(field_def)

        return {"fields": field_defs}
