################################################################################
# Record exemplar for myw.dd_feature
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json, re
from collections import OrderedDict
from operator import attrgetter
from sqlalchemy import Boolean, Column, Integer, JSON

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.db.globals import Session

from .base import ModelBase, MywModelMixin


class MywDDFeature(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.dd_feature
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "dd_feature")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit column types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "dd_feature", "id", Integer, generator="sequence")
    editable = Column(Boolean, default=False)
    track_changes = Column(Boolean, default=True)
    versioned = Column(Boolean)
    insert_from_gui = Column(Boolean)
    update_from_gui = Column(Boolean)
    delete_from_gui = Column(Boolean)
    editor_options = Column(JSON(none_as_null=True))
    geom_indexed = Column(Boolean, default=True)

    # ==============================================================================
    #                                INDENT
    # ==============================================================================

    def ident(self):
        """
        String used to indentify self at command line
        """

        if self.datasource_name == "myworld":
            return self.feature_name
        else:
            return self.datasource_name + "/" + self.feature_name

    def __str__(self):
        """
        String used to indentify self at command line
        """

        return self.ident()

    # ==============================================================================
    #                             FIELD SUBSTRUCTURE MANAGEMENT
    # ==============================================================================

    @property
    def dd_field_recs(self):
        """
        Query yielding the field definition records of self, in order
        """

        from .myw_dd_field import MywDDField

        return (
            Session.query(MywDDField)
            .filter(
                (MywDDField.datasource_name == self.datasource_name)
                & (MywDDField.table_name == self.feature_name)
            )
            .order_by(MywDDField.id)
        )

    def setFields(self, feature_desc):
        """
        Set self's field descriptors to match FEATURE_DESC

        FEATURE_DESC is a MywFeatureDescriptor

        Also sets derived fields on self"""

        from .myw_dd_field import MywDDField

        # Remove any existing field definitions
        for rec in self.dd_field_recs:
            Session.delete(rec)
        Session.flush()

        # Add new field definitions
        for field_name, field_desc in list(feature_desc.fields.items()):

            rec = MywDDField(
                datasource_name=self.datasource_name,
                table_name=self.feature_name,
                internal_name=field_desc.name,
                external_name=field_desc.external_name,
                type=field_desc.type,
                value=field_desc.value,
                enum=field_desc.enum,
                unit=field_desc.unit,
                display_unit=field_desc.display_unit,
                unit_scale=field_desc.unit_scale,
                min_value=field_desc.min_value,
                max_value=field_desc.max_value,
                generator=field_desc.generator,
                default=field_desc.defaultAsString(),
                display_format=field_desc.display_format,
                mandatory=field_desc.mandatory,
                indexed=field_desc.indexed,
                read_only=field_desc.read_only,
                visible=field_desc.visible,
                viewer_class=field_desc.viewer_class,
                editor_class=field_desc.editor_class,
                new_row=field_desc.new_row,
                validators=field_desc.validators,
                creates_world_type=field_desc.creates_world_type,
            )

            Session.add(rec)

        # Set dervied properties
        self.set_property("key_name", feature_desc.key_field_name)
        self.set_property("geometry_type", feature_desc.geometry_type)
        self.set_property("primary_geom_name", feature_desc.primary_geom_name)

        # Flush changes to database
        Session.flush()

    def deleteFields(self):
        """
        Delete the field definition records for FEATURE_REC
        """

        for rec in self.dd_field_recs:
            Session.delete(rec)

    def fieldRecs(self, stored_only=False):
        """
        Self's field definition records, as an ordered dict

        Returns a list of MywDDField records, keyed by internal name"""

        recs = OrderedDict()

        for rec in self.dd_field_recs:

            if stored_only and rec.value:
                continue

            recs[rec.internal_name] = rec

        return recs

    def fieldRec(self, field_name):
        """
        DD_FIELD record for self's field FIELD_NAME (if there is one)
        """

        from .myw_dd_field import MywDDField

        return self.dd_field_recs.filter(MywDDField.internal_name == field_name).first()

    def nonAsciiFieldNames(self):
        """
        Yields the fields of self that have a non-ascii internal name

        These fields cause SQLAlchemy model building to fail with an obscure error"""

        def is_ascii(s):
            return all(ord(c) < 128 for c in s)

        for field_rec in self.dd_field_recs:
            if not is_ascii(field_rec.internal_name):
                yield field_rec.internal_name

    # ==============================================================================
    #                          FIELD GROUP SUBSTRUCTURE
    # ==============================================================================

    @property
    def field_group_recs(self):
        """
        Query yielding the field group definition records of self, in order
        """
        from .myw_dd_field_group import MywDDFieldGroup

        return (
            Session.query(MywDDFieldGroup)
            .filter(
                (MywDDFieldGroup.datasource_name == self.datasource_name)
                & (MywDDFieldGroup.feature_name == self.feature_name)
            )
            .order_by(MywDDFieldGroup.display_position)
        )

    def setFieldGroups(self, group_defs):
        """
        Set self's field groups from dict GROUP_DEFS
        """

        self.deleteFieldGroups()

        first = True
        for group in group_defs:
            self.addFieldGroup(
                group["name"], group["fields"], group.get("expanded", first), group.get("visible")
            )
            first = False

    def addFieldGroup(self, name, field_names, expanded, visible):
        """
        Add a field group to self
        """

        from .myw_dd_field_group import MywDDFieldGroup
        from .myw_dd_field_group_item import MywDDFieldGroupItem

        n_groups = self.field_group_recs.count()

        # Create group
        field_group_rec = MywDDFieldGroup(
            datasource_name=self.datasource_name,
            feature_name=self.feature_name,
            display_name=name,
            is_expanded=expanded,
            visible=visible,
            display_position=n_groups + 1,
        )

        Session.add(field_group_rec)
        Session.flush()

        # Add fields to it
        # ENH: Move to MywDDFieldGroupItem
        pos = 1
        for field_name in field_names:
            if isinstance(field_name, dict):
                # In case of a separator field_name has a dict
                field_name_item = json.dumps(field_name)
            else:
                field_name_item = field_name
            item_rec = MywDDFieldGroupItem(
                container_id=field_group_rec.id, field_name=field_name_item, display_position=pos
            )

            Session.add(item_rec)
            pos += 1

    def deleteFieldGroups(self):
        """
        Remove all field groups from self
        """

        for field_group_rec in self.field_group_recs:

            # Delete substructure
            for rec in field_group_rec.substructure():
                Session.delete(rec)

            # Prevent problems with Oracle triggers later
            Session.flush()

            # Delete group definition
            Session.delete(field_group_rec)

    # ==============================================================================
    #                           SEARCH RULE SUBSTRUCTURE
    # ==============================================================================

    @property
    def search_rule_recs(self):
        """
        Query yielding the search rules associated with self, in ID order
        """
        from .myw_search_rule import MywSearchRule

        return (
            Session.query(MywSearchRule)
            .filter(
                (MywSearchRule.datasource_name == self.datasource_name)
                & (MywSearchRule.feature_name == self.feature_name)
            )
            .order_by(MywSearchRule.id)
        )

    def setSearchRules(self, search_defs, default_language):
        """
        Set the search rules for self
        """

        self.deleteSearchRules()

        for search in search_defs:
            lang = search.get("lang") or default_language  # ensure a language is set on the record
            self.addSearchRule(search["value"], search["description"], lang)

    def addSearchRule(self, search_val_expr, search_desc_expr, lang=None):
        """
        Add a search rule to self
        """

        from .myw_search_rule import MywSearchRule

        # Create the search rule record
        search_rule_rec = MywSearchRule(
            datasource_name=self.datasource_name,
            feature_name=self.feature_name,
            search_val_expr=search_val_expr,
            search_desc_expr=search_desc_expr,
            lang=lang,
        )

        # Ensure it has an ID
        Session.add(search_rule_rec)
        Session.flush()

        return search_rule_rec

    def deleteSearchRules(self):
        """
        Remove all search rules from self
        """

        for search_rule_rec in self.search_rule_recs:
            Session.delete(search_rule_rec)

        Session.flush()

    def deleteSearchRule(self, search_val_expr, search_desc_expr, lang=None):
        """
        Remove a search rule record from self

        Returns the deleted record"""

        search_rule_rec = self.searchRuleRecFor(search_val_expr, search_desc_expr, lang)

        Session.delete(search_rule_rec)

        return search_rule_rec

    def searchRuleRecFor(self, search_val_expr, search_desc_expr, lang=None):
        """
        Find a search rule record by value (if there is one)
        """

        from .myw_search_rule import MywSearchRule

        query = self.search_rule_recs.filter(
            (MywSearchRule.search_val_expr == search_val_expr)
            & (MywSearchRule.search_desc_expr == search_desc_expr)
            & (MywSearchRule.lang == lang)
        )

        return query.first()

    # ==============================================================================
    #                                QUERY SUBSTRUCTURE
    # ==============================================================================

    @property
    def query_recs(self):
        """
        Query yielding the queries associated with self, in ID order
        """
        from .myw_query import MywQuery

        return (
            Session.query(MywQuery)
            .filter(
                (MywQuery.datasource_name == self.datasource_name)
                & (MywQuery.myw_object_type == self.feature_name)
            )
            .order_by(MywQuery.id)
        )

    def setQueries(self, query_defs, default_language):
        """
        Set query definitions for self
        """

        self.deleteQueries()

        for query in query_defs:
            lang = query.get("lang") or default_language  # ensure a language is set on the record
            self.addQuery(query["value"], query["description"], query.get("filter"), lang)

    def addQuery(self, value, description, filter="", lang=None):
        """
        Add a query definition to self
        """
        from .myw_query import MywQuery

        query = MywQuery(
            datasource_name=self.datasource_name,
            myw_object_type=self.feature_name,
            myw_search_val1=value,
            myw_search_desc1=description,
            attrib_query=filter,
            lang=lang,
        )

        Session.add(query)

    def deleteQueries(self):
        """
        Delete all queries from self
        """

        for rec in self.query_recs:
            Session.delete(rec)

        Session.flush()

    # ==============================================================================
    #                                FILTER SUBSTRUCTURE
    # ==============================================================================

    @property
    def filter_recs(self):
        """
        Query yielding the filters associated with self, in ID order
        """
        from .myw_filter import MywFilter

        return (
            Session.query(MywFilter)
            .filter(
                (MywFilter.datasource_name == self.datasource_name)
                & (MywFilter.feature_name == self.feature_name)
            )
            .order_by(MywFilter.id)
        )

    def setFilters(self, filter_defs):
        """
        Set self's filter definitions
        """

        self.deleteFilters()

        for filter_def in filter_defs:
            self.addFilter(filter_def["name"], filter_def["value"])

    def addFilter(self, name, value):
        """
        Add a filter definition to self
        """
        from .myw_filter import MywFilter

        filter_rec = MywFilter(
            datasource_name=self.datasource_name,
            feature_name=self.feature_name,
            name=name,
            value=value,
        )

        Session.add(filter_rec)

    def deleteFilters(self):
        """
        Delete all filters from self
        """

        for rec in self.filter_recs:
            Session.delete(rec)

        Session.flush()

    def filterNames(self):
        """
        Names of self's filters (in ID order)
        """

        return list(map(attrgetter("name"), self.filter_recs))

    def filterDefs(self):
        """
        Dictionary of filter values keyed by filter name
        """
        defs = OrderedDict()
        for rec in self.filter_recs:
            defs[rec.name] = rec.value
        return defs

    def filterRec(self, name, error_if_none=False):
        """
        Self's filter record NAME (if there is one)
        """

        from .myw_filter import MywFilter

        rec = self.filter_recs.filter(MywFilter.name == name).first()

        if error_if_none and not rec:
            raise MywError("No such filter:", name)

        return rec

    # ==============================================================================
    #                                   FILTER MAP
    # ==============================================================================

    # Names of fields that store the filter map
    filter_map_fields = [
        "filter1_field",
        "filter2_field",
        "filter3_field",
        "filter4_field",
        "filter5_field",
        "filter6_field",
        "filter7_field",
        "filter8_field",
    ]

    def filter_map(self):
        """
        Mapping from filter_names to self's field names

        Returns ordered dict of the form:
         filter1_field:  status
         filter2_field:  owner"""

        filter_map = OrderedDict()

        for prop in self.filter_map_fields:
            field = self[prop]
            if field:
                filter_map[prop] = field

        return filter_map

    def set_filter_map(self, field_names, progress=MywProgressHandler()):
        """
        Set names of the filter fields to FIELD_NAMES
        """

        # Clear old values
        for prop in self.filter_map_fields:
            self[prop] = None

        # Set new ones
        for i, field_name in enumerate(field_names):
            prop = self.filter_map_fields[i]
            self.set_property(prop, field_name, progress)

    def filter_ir_map(self):
        """
        Mapping from self's field names to index record field names

        Returns dict of the form:
         status:  filter1_val
         owner:   filter2_val"""

        # ENH: Find a better name

        filter_ir_map = {}

        for prop, field in list(self.filter_map().items()):
            filter_ir_map[field] = prop.replace(
                "_field", "_val"
            )  # ENH: Just store base name in filter_map_fields?

        return filter_ir_map

    # ==============================================================================
    #                               ASSOCIATION TO LAYERS
    # ==============================================================================

    @property
    def layer_item_recs(self):
        """
        Query yielding the layer_feature_item records for self
        """

        from .myw_layer_feature_item import MywLayerFeatureItem

        return Session.query(MywLayerFeatureItem).filter(MywLayerFeatureItem.feature_id == self.id)

    def layer_codes(self):
        """
        Codes of the overlays of which self is a member
        """

        codes = []

        for rec in self.layer_item_recs:
            layer_rec = rec.layer_rec

            if layer_rec.code:
                codes.append(layer_rec.code)

        return codes

    def layers_str(self):
        """
        Self's layer codes as a string
        """

        return ",".join(sorted(self.layer_codes()))

    def filter_usage(self):
        """
        The filters of self thar are in use (a set of lists of layer names, keyed by filter name)
        """

        filter_usage = {}

        for rec in self.layer_item_recs:
            if not rec.filter_name:
                continue

            if not rec.filter_name in filter_usage:
                filter_usage[rec.filter_name] = []

            filter_usage[rec.filter_name].append(rec.layer_rec.name)

        return filter_usage

    # ==============================================================================
    #                               ASSOCIATION TO NETWORKS
    # ==============================================================================

    @property
    def network_item_recs(self):
        """
        Query yielding the network_feature_item records for self
        """

        from .myw_network_feature_item import MywNetworkFeatureItem

        return Session.query(MywNetworkFeatureItem).filter(
            MywNetworkFeatureItem.feature_id == self.id
        )

    # ==============================================================================
    #                                   PROPERTY ACCESS
    # ==============================================================================
    # ENH: Duplicated with MywDatasource. Find a way to share with all models

    def get_property(self, prop, default=None):
        """
        Get a property of self, handling conversions
        """

        value = self[prop]

        if prop == "remote_spec":
            value = self.json_from_db(prop, value)

        if value == None:
            value = default

        return value

    def set_property(self, prop, value, progress=MywProgressHandler()):
        """
        Set a property of self, handling conversions

        Returns True if field was changed"""

        # Check for unknown property
        if not prop in list(self.__table__.columns.keys()):
            raise MywError("Feature {}: Bad property: '{}'".format(self.feature_name, prop))

        # Get value that will be stored in database (empty strings get converted to null)
        if value == "":
            value = None

        # Handle special fields
        if prop == "remote_spec":
            value = self._json_to_db(prop, value)

        # Check for nothing to do
        if self[prop] == value:
            return False

        # Set field
        progress(2, "Setting", prop, "=", value)
        self[prop] = value

        return True

    def _json_to_db(self, prop, value):
        """
        Convert dictionary VALUE to stored format

        VALUE can be None
        """

        if not value:
            return None

        try:
            return json.dumps(value, sort_keys=True)

        except Exception as cond:
            msg = "Feature {}: Error storing field '{}': {}".format(self.feature_name, prop, cond)
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
            msg = "Feature {}: Error parsing field '{}': {}".format(self.feature_name, prop, cond)
            raise MywError(msg, internal_exception=cond)

    # ==============================================================================
    #                                    REPLICATION
    # ==============================================================================

    def local_table_name(self):
        """
        Name for feature type storing self's data in the myWorld database

        Only makes sense for features from external databases"""

        # myWorld feature names must be lower case, have no '.', space or '-' characters
        # Note: Algorithm duplicated in native app code (ddController)

        if self.datasource_name == "myworld":
            raise MywError("Already a local table:", self.ident())

        reps = r"[\s.,\:]+"
        excludes = r"[\<\>\:\'\/\\|\?\*\(\)\{\}\&\^\%\!\`\+\~\#\[\]\@\"" "]"

        name = self.datasource_name + "_" + self.feature_name
        name = name.lower()
        name = re.sub(reps, "_", name)
        name = re.sub(excludes, "", name)

        return name

    # ==============================================================================
    #                                    VALIDATION
    # ==============================================================================

    def validate(self, enum_names, unit_defs):
        """
        Check self's integrity

        Yields a error message for each problem found"""

        # Check self's table exists
        if self.datasource_name == "myworld":

            if not Session.myw_db_driver.tableExists("data", self.feature_name):
                yield "Database table missing"

            if self.versioned:

                if not Session.myw_db_driver.tableExists("delta", self.feature_name):
                    yield "Delta table missing"

                if not Session.myw_db_driver.tableExists("base", self.feature_name):
                    yield "Base table missing"

                # ENH: Check fields match etc

        # Check field defs
        for dd_field_rec in self.dd_field_recs:
            for err_msg in dd_field_rec.validate(enum_names, unit_defs):
                yield "Field '{}': {}".format(dd_field_rec.internal_name, err_msg)

        # ENH: Check title, description, ..
