################################################################################
# myWorld data dictionary
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import sys, traceback
from collections import OrderedDict
from datetime import datetime
from operator import attrgetter
import threading

from sqlalchemy import DDL, Boolean, Date
from sqlalchemy.schema import Column
from sqlalchemy.ext.declarative import declarative_base
from geoalchemy2 import Geometry

from myworldapp.core.server.base.core.myw_error import (
    MywError,
    MywInternalError,
    MywUnknownFeatureTypeError,
)
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.db.myw_multi_language_parser import MywMultiLanguageParser

from myworldapp.core.server.models.myw_datasource import MywDatasource
from myworldapp.core.server.models.myw_dd_enum import MywDDEnum
from myworldapp.core.server.models.myw_dd_enum_value import MywDDEnumValue
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
from myworldapp.core.server.models.myw_dd_field import MywDDField
from myworldapp.core.server.models.myw_search_rule import MywSearchRule
from myworldapp.core.server.models.myw_setting import MywSetting

from .myw_feature_model_mixin import MywFeatureModelMixin
from .myw_feature_descriptor import MywFeatureDescriptor


class MywDD:
    """
    myWorld data dictionary manager

    Provides an API for creating and modifying
    feature type definitions (see createFeatureType(),
    alterFeatureType(), ...). For features from the 'myworld'
    datasource, this includes creating and mutating database
    tables, triggers, index records etc.

    Also manages meta-data for datasources and enumerators"""

    # Class constants
    feature_models = {}
    feature_model_lock = threading.Lock()

    # Registry for feature SQLAlchemy model classes
    schema_base = {}
    for schema in ["data", "base", "delta"]:
        schema_base[schema] = declarative_base(name=schema)

    def __init__(self, session, check_rate=None, progress=MywProgressHandler()):
        """
        Initialise self

        SESSION is a database session.

        Optional CHECK_RATE is a frequency (in seconds) at which
        to check if feature models have expired (because another
        process has changed the feature configuration). It is only
        required if self is to be 'long lived'."""

        self.session = session
        self.progress = progress
        self.db_driver = self.session.myw_db_driver
        self.check_rate = check_rate
        self.db_last_check = None  # Time we lasted checked the DD version stamp
        self.dd_version = None  # Used to determine if models have expired
        self._languages = None  # Init lazily
        self._default_language = None  # Init lazily
        self._language_parser = None  # Init lazily
        self._enumValues = {}  # Enumerator values loaded lazily

    def __repr__(self):
        """
        String representation of self (for tracebacks etc)
        """

        return "{}({},{})".format(self.__class__.__name__, id(self), self.session.bind.dialect.name)

    # ==============================================================================
    #                               LANGUAGE SETTINGS
    # ==============================================================================

    @property
    def languages(self):
        """
        Self's available languages
        """

        if not self._languages:
            self._load_languages()

        return self._languages

    @property
    def default_language(self):
        """
        Self's default language
        """

        if not self._default_language:
            langs = self.languages
            self._default_language = langs[0]

        return self._default_language

    @property
    def language_parser(self):
        """
        Parser for processing multi_language_strings
        """

        if not self._language_parser:
            self._language_parser = MywMultiLanguageParser(self.languages, self.default_language)

        return self._language_parser

    def _load_languages(self):
        """
        Read default language from settings
        """

        languages = "en"  # Defaunt language settings
        rec = self.session.query(MywSetting).get("core.language")

        if not rec:
            rec = self.session.query(MywSetting).get("language")  # For pre-5.1 compatibility

        if rec:
            languages = rec.formattedValue()

        self._languages = languages.split(",")
        self._default_language = self._languages[0]

    def checkLanguageSettings(self, setting_id):
        """
        Clear cached languages when settings change.
        """
        if setting_id == "core.language":
            self._languages = None
            self._default_language = None
            self._language_parser = None
            self._load_languages()

    # ==============================================================================
    #                               DATASOURCE MANAGEMENT
    # ==============================================================================

    def datasourceExists(self, datasource_name):
        """
        True if there is a datasource DATASOURCE_NAME
        """

        return self.datasourceRec(datasource_name) != None

    def datasourceNames(self, filter=None, sort=False, warn_if_no_match=False):
        """
        Returns the names of the datasources in self

        Optional filter is a glob-style filter"""

        # Find matching records
        recs = self.session.query(MywDatasource)

        if filter:
            recs = recs.filter(MywDatasource.fnmatch_filter("name", filter))

        # Convert to names
        datasource_names = [rec.name for rec in recs]

        if warn_if_no_match and filter and not datasource_names:
            self.progress("warning", "No datasources matching:", filter)

        # Sort
        if sort:
            datasource_names = sorted(datasource_names)

        return datasource_names

    def datasourceInUse(self, datasource_name):
        """
        True if DATASOURCE_NAME is referenced by any layer
        """

        ds_rec = self.datasourceRec(datasource_name, error_if_none=True)

        return ds_rec.layer_recs.first() != None

    def datasourceDef(self, datasource_name):
        """
        Returns definition of datasource DATASOURCE_NAME as a dict
        """
        # ENH: Better to return rec and use rec.serialise?

        datasource_rec = self.datasourceRec(datasource_name)
        datasource_def = OrderedDict()

        for prop in ["name", "external_name", "description", "type", "spec"]:
            value = datasource_rec.get_property(prop)
            if value != None:
                datasource_def[prop] = value

        return datasource_def

    def createDatasource(self, datasource_def):
        """
        Insert a datasource records using info in dict DATASOURCE_DEF
        """

        # Check definition has mandatory fields
        for prop in ["name", "type"]:
            if not prop in datasource_def:
                raise MywError(
                    "Datasource definition missing mandatory property: '{}'".format(prop)
                )

        # Construct record
        datasource_rec = MywDatasource()

        # Set properties
        for (prop, value) in list(datasource_def.items()):
            datasource_rec.set_property(prop, value)

        # Ensure mandatory fields are populated
        datasource_rec.set_backstops()

        # Insert it (and get an ID)
        self.session.add(datasource_rec)
        self.session.flush()

        return datasource_rec

    def updateDatasource(self, datasource_name, datasource_def):
        """
        Update a datasource definition using info in dict DATASOURCE_DEF
        """

        # Get existing record
        datasource_rec = self.datasourceRec(datasource_name)

        # Update properties
        for prop, value in list(datasource_def.items()):
            datasource_rec.set_property(prop, value, self.progress)

        # Ensure mandatory fields are populated
        datasource_rec.set_backstops()

        # Send updates to database
        self.session.flush()

    def dropDatasource(self, datasource_name):
        """
        Delete definition for DATASOURCE_NAME (which must exist)
        """

        # Get record
        datasource_rec = self.datasourceRec(datasource_name)

        # Delete layer definitions
        # ENH: Duplicates code with config_manager
        for layer_rec in datasource_rec.layer_recs.all():
            self.progress(1, "Dropping layer:", layer_rec.name)
            for rec in layer_rec.substructure():
                self.session.delete(rec)
            self.session.flush()

            self.session.delete(layer_rec)
        self.session.flush()

        # Delete feature definitions
        # ENH: Encapsulate substruture delete on super
        for feature_rec in datasource_rec.dd_feature_recs.all():
            self.progress(1, "Dropping feature type:", feature_rec.feature_name)
            self.dropFeatureType(feature_rec)
        self.session.flush()

        # Delete it
        for rec in datasource_rec.substructure():
            self.session.delete(rec)
        self.session.flush()

        self.session.delete(datasource_rec)

    def datasourceRec(self, datasource_name, error_if_none=False):
        """
        The datasource definition for NAME (if there is one)
        """

        rec = self.session.query(MywDatasource).get(datasource_name)

        if error_if_none and not rec:
            raise MywError("No such datasource:", datasource_name)

        return rec

    # ==============================================================================
    #                            ENUMERATOR MANAGEMENT
    # ==============================================================================

    def enumeratorNames(self, filter=None, sort=False, warn_if_no_match=False):
        """
        Returns the names of the feature tables in the database

        Optional FILTER is a fnmatch-style filter"""

        # Find records
        recs = self.session.query(MywDDEnum)

        if filter:
            recs = recs.filter(MywDDEnum.fnmatch_filter("name", filter))

        # Map to names
        names = [rec.name for rec in recs]

        if warn_if_no_match and filter and not names:
            self.progress("warning", "No enumerators match:", filter)

        # Sort
        if sort:
            names = sorted(names)

        return names

    def enumeratorExists(self, enumerator_name):
        """
        True if self contains a definition for enumerator_name
        """

        query = self.session.query(MywDDEnum).filter(MywDDEnum.name == enumerator_name)

        return query.first() is not None

    def enumeratorIsUsed(self, enumerator_name):
        """
        True if any feature definition references ENUMERATOR_NAME

        ENH: Better as .fieldsUsingEnumerator()"""

        query = self.session.query(MywDDField).filter(MywDDField.enum == enumerator_name)

        return query.first() is None

    def enumeratorRec(self, enumerator_name):
        """
        Returns the enumerator record for ENUMERATOR_NAME (if one exists)
        """

        return self.session.query(MywDDEnum).filter(MywDDEnum.name == enumerator_name).first()

    def enumeratorDef(self, enumerator_name):
        """
        Returns definition of ENUMERATOR_NAME as dict
        """
        # ENH: Move to model?

        enum_def = OrderedDict()

        # Add basic props
        enum_rec = self.session.query(MywDDEnum).filter(MywDDEnum.name == enumerator_name).first()

        return enum_rec.definition()

    def createEnumerator(self, enum_name, description, values):
        """
        Create an enumerator
        """

        # As a single transaction ..
        with self.db_driver.nestedTransaction():

            # Create parent record
            enum = MywDDEnum(name=enum_name, description=description)
            self.session.add(enum)
            self.session.flush()

            # Add values
            position = 1
            for item in values:
                if isinstance(item, str):  # For pre-4.4 compatibility
                    value = display_value = item
                else:
                    value = item["value"]
                    display_value = item.get("display_value", value)

                enum_value = MywDDEnumValue(
                    enum_name=enum_name, position=position, value=value, display_value=display_value
                )
                self.session.add(enum_value)
                position += 1

        return enum

    def updateEnumerator(self, enum_name, description, values):
        """
        Update an existing enumerator definition
        """

        enum = self.enumeratorRec(enum_name)

        had_display_values = (
            self.session.query(MywDDEnumValue)
            .filter(
                MywDDEnumValue.enum_name == enum_name
                and MywDDEnumValue.value != MywDDEnumValue.display_value
            )
            .first()
        )

        # As a single transaction ..
        with self.db_driver.nestedTransaction():

            # Update main record
            enum["description"] = description

            # Remove existing values
            self.session.query(MywDDEnumValue).filter(
                MywDDEnumValue.enum_name == enum_name
            ).delete()

            # Add the provided values
            position = 1
            has_display_values = False
            for item in values:
                if isinstance(item, str):  # For pre-4.4 compatibility
                    value = display_value = item
                else:
                    value = item["value"]
                    display_value = item.get("display_value", value)
                    has_display_values = has_display_values or (value != display_value)

                enum_value = MywDDEnumValue(
                    enum_name=enum_name, position=position, value=value, display_value=display_value
                )
                self.session.add(enum_value)
                position += 1

        # rebuild triggers and search strings affected by this enumerator
        if had_display_values or has_display_values:
            self.rebuildForEnumChange(enum_name)

        return enum

    def dropEnumerator(self, enum_name):
        """
        Deletes enumerator entry and its values
        """

        enumerator = self.enumeratorRec(enum_name)

        # As a single transaction ..
        with self.db_driver.nestedTransaction():

            # Delete substructure (avoiding cascade delete problems in Oracle)
            for rec in enumerator.substructure():
                self.session.delete(rec)
            self.session.flush()

            # Delete main record
            self.session.delete(enumerator)

    def rebuildForEnumChange(self, enum_name):
        """
        Rebuilds triggers and search strings of feature types affected by changes to the given enumerator

        Warning: Performs a commit"""

        fields = self.session.query(MywDDField).filter(MywDDField.enum == enum_name).all()

        for field in fields:
            feature_rec = (
                self.session.query(MywDDFeature)
                .filter(
                    (MywDDFeature.datasource_name == field.datasource_name)
                    & (MywDDFeature.feature_name == field.table_name)
                )
                .first()
            )

            if self.isFieldUsedInSearches(field, feature_rec):
                self.rebuildTriggersFor(feature_rec)
                self.rebuildAllSearchStringsFor(feature_rec)

    def isFieldUsedInSearches(self, field_rec, feature_rec):
        """
        Returns True if a given field is used in the searches of the field's feature type
        """
        field_name = field_rec.internal_name
        field_ref = "[" + field_name + "]"
        field_used_in_title = field_ref in (feature_rec.title_expr or "")
        field_used_in_short_desc = field_ref in (feature_rec.short_description_expr or "")

        search_rules = (
            self.session.query(MywSearchRule)
            .filter(
                (MywSearchRule.datasource_name == field_rec.datasource_name)
                & (MywSearchRule.feature_name == field_rec.table_name)
            )
            .all()
        )

        for search_rule in search_rules:
            if (field_ref in search_rule.search_val_expr) or (
                field_ref in search_rule.search_desc_expr
            ):
                return True

            title_ref = "{title}"
            if field_used_in_title and (
                (title_ref in search_rule.search_val_expr)
                or (title_ref in search_rule.search_desc_expr)
            ):
                return True

            short_desc_ref = "{short_description}"
            if field_used_in_short_desc and (
                (short_desc_ref in search_rule.search_val_expr)
                or (short_desc_ref in search_rule.search_desc_expr)
            ):
                return True

        return False

    # ==============================================================================
    #                             FEATURE TYPE MANAGEMENT
    # ==============================================================================

    def featureTypes(
        self,
        datasource_spec,
        feature_type_spec=None,
        sort=False,
        warn_if_no_match=False,
        change_tracked_only=False,
        versioned_only=False,
    ):
        """
        Returns names of the feature types in DATASOURCE_SPEC

        Optional FEATURE_TYPE_SPEC is a fnmatch-style filter"""

        feature_recs = self.featureTypeRecs(
            datasource_spec,
            feature_type_spec=feature_type_spec,
            sort=sort,
            warn_if_no_match=warn_if_no_match,
            change_tracked_only=change_tracked_only,
            versioned_only=versioned_only,
        )

        return list(map(attrgetter("feature_name"), feature_recs))

    def featureTypeRecs(
        self,
        datasource_spec,
        feature_type_spec=None,
        sort=False,
        warn_if_no_match=False,
        change_tracked_only=False,
        versioned_only=False,
    ):
        """
        Returns DD feature records for the feature types in datasource DATASOURCE_SPEC

        Optional FEATURE_TYPE_SPEC is a fnmatch-style filter"""

        # Prevent confusing warning messages on default spec
        if feature_type_spec == "*":
            feature_type_spec = None

        # Check for unknown datasource
        if warn_if_no_match and not self.datasourceNames(datasource_spec):
            self.progress("warning", "No such datasource:", datasource_spec)
            return []

        # Build query
        query = self.session.query(MywDDFeature).filter(
            MywDDFeature.fnmatch_filter("datasource_name", datasource_spec)
        )

        if feature_type_spec:
            query = query.filter(MywDDFeature.fnmatch_filter("feature_name", feature_type_spec))

        if change_tracked_only:
            query = query.filter(MywDDFeature.track_changes == True)

        if versioned_only:
            query = query.filter(MywDDFeature.versioned == True)

        # Get records
        feature_recs = query.all()

        # Check for nothing found
        if feature_type_spec and warn_if_no_match and not feature_recs:
            self.progress(
                "warning", "No feature types matching:", feature_type_spec
            )  # ENH: Include datasource if non-myworld

        # Sort
        if sort:
            sort_proc = lambda rec: [rec.datasource_name, rec.feature_name]
            feature_recs = sorted(feature_recs, key=sort_proc)

        return feature_recs

    def featureTypeExists(self, datasource, feature_type):
        """
        True if self contains a definition for FEATURE_TYPE
        """

        return self.featureTypeRec(datasource, feature_type) != None

    def featureTypeRec(self, datasource, feature_type, error_if_none=False):
        """
        Returns the decriptor record for FEATURE_TYPE (if there is one)
        """

        rec = (
            self.session.query(MywDDFeature)
            .filter(
                (MywDDFeature.datasource_name == datasource)
                & (MywDDFeature.feature_name == feature_type)
            )
            .first()
        )

        if error_if_none and not rec:
            raise MywUnknownFeatureTypeError(
                "No such feature type:", datasource + "/" + feature_type
            )

        return rec

    def createFeatureType(self, feature_desc, warnings_progress=None):
        """
        Add a feature definition (including table and associated tiggers, if appropriate)

        FEATURE_DESC is a MywFeatureDescriptor"""

        # Check expressions etc are valid (prevents problems with trigger creation etc later)
        max_field_fields = len(MywDDFeature.filter_map_fields)
        feature_desc.assertValid(max_field_fields, self.db_driver, warnings_progress)

        # Check for unknown datasource
        if not self.datasourceExists(feature_desc.datasource):
            raise MywError("No such datasource:", feature_desc.datasource)

        # Check for already exists
        if self.featureTypeExists(feature_desc.datasource, feature_desc.name):
            raise MywError("Feature type already exists:", feature_desc.name)

        try:
            # Create meta-data
            feature_rec = self.addFeatureRec(feature_desc)

            # Create data-model
            if feature_rec.datasource_name == "myworld":
                self.createFeatureTable(feature_desc)
                self.buildTriggersFor(feature_rec)

        except Exception:
            traceback.print_exc(file=sys.stdout)
            raise

        # Commit changes
        self.session.commit()

        return feature_rec

    def alterFeatureType(
        self,
        feature_rec,
        new_feature_desc,
        date_format=None,
        timestamp_format=None,
        check_filter_usage=False,
        permit_mutation=True,
        warnings_progress=None,
    ):
        """
        Modify a feature definition to match NEW_FEATURE_DESC

        NEW_FEATURE_DESC is a MywFeatureDescriptor (or a partial .def format dict)

        Optional DATE_FORMAT and TIMESTAMP_FORMAT define source data format
        when converting string fields to dates / timestamps"""

        # Get current descriptor
        old_feature_desc = self.featureTypeDescriptor(feature_rec)

        # Build new descriptor (if necessary)
        if isinstance(new_feature_desc, dict):
            new_feature_desc = old_feature_desc.deepcopy().update(new_feature_desc)

        # Check it is valid
        max_field_fields = len(MywDDFeature.filter_map_fields)
        new_feature_desc.assertValid(max_field_fields, self.db_driver, warnings_progress)
        if check_filter_usage:
            self.assertFeatureChangeValid(feature_rec, new_feature_desc)

        # Check for mutation
        if not permit_mutation:
            if not old_feature_desc.tableDescriptor().equals(new_feature_desc.tableDescriptor()):
                raise MywError(
                    "Not authorised to modify table shape"
                )  # ENH: Say what is being mutated

        # Update meta-data
        tasks = self.alterFeatureRec(feature_rec, old_feature_desc, new_feature_desc)

        # Update table structure and index records (where necessary)
        if feature_rec.datasource_name == "myworld":

            # Delete index records for searches that have been dropped (first, because mutate can do commit)
            for search_rule_rec in tasks.get("dropped_search_rule_recs", []):
                self.deleteSearchStringsFor(feature_rec, search_rule_rec)

            # Mutate table structure in database (if structure changed)
            if tasks.get("mutate_table", False):
                self.alterFeatureTable(
                    feature_rec.feature_name,
                    old_feature_desc,
                    new_feature_desc,
                    date_format,
                    timestamp_format,
                )
                tasks[
                    "rebuild_triggers"
                ] = True  # In case world name field added or removed (or sqlite table mutation has lost triggers)

            # Update triggers (if necessary)
            if tasks.get("rebuild_triggers", False):
                self.rebuildTriggersFor(feature_rec)

            # Update index records (if necessary)
            if tasks.get("rebuild_geom_indexes", False):
                self.rebuildGeomIndexesFor(feature_rec)

            if tasks.get("rebuild_search_strings", False):
                self.rebuildAllSearchStringsFor(feature_rec)
            else:
                for new_search_rule_rec in tasks.get("added_search_rule_recs", []):
                    self.rebuildSearchStringsFor(feature_rec, new_search_rule_rec)

            # Remove record exemplar from cache
            self.clearFeatureModels()

        # Commit changes
        self.session.commit()

        return feature_rec

    def dropFeatureType(self, feature_rec):
        """
        Drop a feature table and associated metadata

        Table must be empty"""

        # Avoid leaving orphan index records
        if feature_rec.datasource_name == "myworld" and not self.featureTableIsEmpty(
            feature_rec.feature_name
        ):
            raise MywError("Table not empty:", feature_rec.feature_name)

        # Delete substructure
        # ENH: Implement dd_feature.substructure()
        feature_rec.layer_item_recs.delete()
        feature_rec.network_item_recs.delete()
        feature_rec.deleteSearchRules()
        feature_rec.deleteQueries()
        feature_rec.deleteFilters()
        feature_rec.deleteFieldGroups()
        feature_rec.deleteFields()
        self.session.flush()  # Prevents problems with Oracle triggers later

        # Delete the feature DD record
        self.session.delete(feature_rec)
        self.session.flush()

        # Remove table from database
        if feature_rec.datasource_name == "myworld":

            # Delete the table
            self.dropFeatureTable(feature_rec.feature_name)

            # Remove record exemplar from cache
            self.clearFeatureModels()

    def assertFeatureChangeValid(self, feature_rec, new_feature_desc):
        """
        Throw an error if FEATURE_DESC is not valid change to FEATURE_REC
        """

        # Build list of filters in new definition
        new_filters = []
        for filter_def in new_feature_desc.filters:
            new_filters.append(filter_def["name"])

        # Check for attempt to remove a filter that is in use
        for filter_name, layer_names in list(feature_rec.filter_usage().items()):
            if not filter_name in new_filters:
                raise MywError(
                    "Filter in use:", filter_name, "(see layer", ",".join(layer_names), ")"
                )

    # ==============================================================================
    #                           FEATURE METADATA MANAGEMENT
    # ==============================================================================

    def featureTypeDescriptor(self, feature_rec):
        """
        Returns definition of FEATURE_TYPE as a MywFeatureDescriptor
        """

        # Add basic props
        feature_desc = MywFeatureDescriptor(
            feature_rec.datasource_name,
            feature_rec.feature_name,
            external_name=feature_rec.external_name,
            title=feature_rec.title_expr,
            short_description=feature_rec.short_description_expr,
            track_changes=feature_rec.track_changes,
            versioned=feature_rec.versioned,
            editable=feature_rec.editable,
            insert_from_gui=feature_rec.insert_from_gui,
            update_from_gui=feature_rec.update_from_gui,
            delete_from_gui=feature_rec.delete_from_gui,
            remote_spec=feature_rec.get_property("remote_spec"),
            editor_options=feature_rec.editor_options,
            geom_indexed=feature_rec.geom_indexed,
        )

        # Add substructure
        # ENH: Implement .descriptionForRec() or similar on models?
        for field_rec in feature_rec.dd_field_recs:
            feature_desc.addField(
                field_rec.internal_name,
                field_rec.type,
                external_name=field_rec.external_name,
                value=field_rec.value,
                key=field_rec.internal_name == feature_rec.key_name,
                enum=field_rec.enum,
                unit=field_rec.unit,
                unit_scale=field_rec.unit_scale,
                display_unit=field_rec.display_unit,
                min_value=field_rec.min_value,
                max_value=field_rec.max_value,
                generator=field_rec.generator,
                default=field_rec.default,
                display_format=field_rec.display_format,
                mandatory=field_rec.mandatory,
                indexed=field_rec.indexed,
                read_only=field_rec.read_only,
                visible=field_rec.visible,
                viewer_class=field_rec.viewer_class,
                editor_class=field_rec.editor_class,
                new_row=field_rec.new_row,
                validators=field_rec.validators,
                creates_world_type=field_rec.creates_world_type,
            )

            if field_rec.enum is not None:
                feature_desc.addEnumValues(
                    field_rec.internal_name, self._mapEnumValues(field_rec.enum)
                )

        for group_rec in feature_rec.field_group_recs:
            feature_desc.addGroup(
                group_rec.display_name,
                group_rec.field_names(),
                group_rec.is_expanded,
                group_rec.visible,
            )

        for search_rec in feature_rec.search_rule_recs:
            feature_desc.addSearch(
                search_rec.search_val_expr, search_rec.search_desc_expr, search_rec.lang
            )

        for query_rec in feature_rec.query_recs:
            feature_desc.addQuery(
                query_rec.myw_search_val1,
                query_rec.myw_search_desc1,
                query_rec.attrib_query,
                query_rec.lang,
            )

        for filter_rec in feature_rec.filter_recs:
            feature_desc.addFilter(filter_rec.name, filter_rec.value)

        return feature_desc

    def _mapEnumValues(self, enumerator_name):
        """
        Map enumerator values to
        """

        map = self._enumValues.get(enumerator_name)
        if map is None:
            map = {}
            enum_rec = (
                self.session.query(MywDDEnum).filter(MywDDEnum.name == enumerator_name).first()
            )
            if enum_rec is None:
                return map

            enum_def = enum_rec.definition()
            for enum_value in enum_def["values"]:
                map[enum_value["value"]] = enum_value["display_value"]
            self._enumValues[enumerator_name] = map

        return map

    def addFeatureRec(self, feature_desc):
        """
        Create a DD feature record and sub-structure from FEATURE_DESC (a MywFeatureDescriptor)

        Returns a MywDDFeature record"""

        # Set basic properties
        feature_rec = MywDDFeature(
            datasource_name=feature_desc.datasource,
            feature_name=feature_desc.name,
            external_name=feature_desc.external_name,
            title_expr=feature_desc.title,
            short_description_expr=feature_desc.short_description,
            track_changes=feature_desc.track_changes,
            versioned=feature_desc.versioned,
            editable=feature_desc.editable,
            insert_from_gui=feature_desc.insert_from_gui,
            update_from_gui=feature_desc.update_from_gui,
            delete_from_gui=feature_desc.delete_from_gui,
            editor_options=feature_desc.editor_options,
            geom_indexed=feature_desc.geom_indexed,
        )

        feature_rec.set_property("remote_spec", feature_desc.remote_spec)

        # Allocate an id
        self.session.add(feature_rec)
        self.session.flush()

        # Add substructure
        feature_rec.setFields(feature_desc)
        feature_rec.setFieldGroups(feature_desc.groups)
        feature_rec.setSearchRules(feature_desc.searches, self.default_language)
        feature_rec.setQueries(feature_desc.queries, self.default_language)
        feature_rec.setFilters(feature_desc.filters)

        feature_rec.set_filter_map(
            feature_desc.filterFields(), self.progress
        )  # ENH: Do this in setFilters()

        return feature_rec

    def alterFeatureRec(self, feature_rec, old_feature_desc, new_feature_desc):
        """
        Update feature meta-data to match NEW_FEATURE_DESC (avoiding redundant updates)

        Returns dict TASKS indicating which dependent data needs rebuilding:
          mutate_table             <bool>
          rebuild_triggers         <bool>
          rebuild_geom_indexes     <bool>
          rebuild_search_strings   <bool>
          dropped_search_rule_recs <list>
          added_search_rule_recs   <list>"""

        # ENH: Replace tasks dict by an object

        tasks = {}

        # Set basic properties (if changed)
        with self.db_driver.nestedTransaction():
            for prop in new_feature_desc.basic_props:
                self.updateFeatureRecProp(feature_rec, prop, new_feature_desc[prop], tasks)
        self.session.flush()

        # Update field metadata (if changed)
        field_diffs = old_feature_desc.fieldDifferences(new_feature_desc)
        if field_diffs:
            with self.progress.operation("Updating field definitions"):
                for field_name, change, diffs_str in field_diffs:
                    self.progress(4, "Field", field_name, ":", change, diffs_str)
                feature_rec.setFields(new_feature_desc)

            tasks["mutate_table"] = not new_feature_desc.tableDescriptor().equals(
                old_feature_desc.tableDescriptor()
            )

        # Check for add/remove delta
        if old_feature_desc.versioned != new_feature_desc.versioned:
            tasks["mutate_table"] = True  # ENH: Use a separate flag?

        # Set field groups (if changed)
        if old_feature_desc.groups != new_feature_desc.groups:
            feature_rec.setFieldGroups(new_feature_desc.groups)

        # Set searches (if changed)
        if old_feature_desc.searches != new_feature_desc.searches:
            (dropped_recs, added_recs) = self.alterSearches(
                feature_rec, old_feature_desc.searches, new_feature_desc.searches
            )
            tasks["dropped_search_rule_recs"] = dropped_recs
            tasks["added_search_rule_recs"] = added_recs
            tasks["rebuild_triggers"] = dropped_recs or added_recs

        # Set queries (if changed)
        if old_feature_desc.queries != new_feature_desc.queries:
            feature_rec.setQueries(new_feature_desc.queries, self.default_language)

        if old_feature_desc.geom_indexed != new_feature_desc.geom_indexed:
            tasks["rebuild_triggers"] = True
            tasks["rebuild_geom_indexes"] = True

        # Set filters (if changed)
        if old_feature_desc.filters != new_feature_desc.filters:

            # Update filter definitions
            feature_rec.setFilters(new_feature_desc.filters)

            # Update filter map (if changed)
            old_filter_fields = old_feature_desc.filterFields()
            new_filter_fields = new_feature_desc.filterFields()

            if new_filter_fields != old_filter_fields:
                feature_rec.set_filter_map(new_filter_fields, self.progress)
                tasks["rebuild_triggers"] = True
                tasks["rebuild_geom_indexes"] = True
                tasks["rebuild_search_strings"] = True

        return tasks

    def alterSearches(self, feature_rec, old_searches, new_searches):
        """
        Update the search rule records for FEATURE_REC

        Returns:
          DROPPED_SEARCH_RULE_RECS   Records that were deleted
          ADDED_SEARCH_RULE_RECS     Records that were added"""

        dropped_search_rule_recs = []
        added_search_rule_recs = []

        # Before we compare any search rules, we add the default language to any that don't have one set.
        for search in new_searches:
            if not search.get("lang", None):
                search["lang"] = self.default_language

        # We cannot assume old searches are unique, because of a bug (21032) in previous versions of this function.
        old_searches_keyed = {repr(search): search for search in old_searches}
        old_searches_count = {
            key: old_searches.count(old_searches_keyed[key]) for key in old_searches_keyed.keys()
        }

        # Make sure that the DB doesn't have any duplicates.
        for search_key, old_count in old_searches_count.items():
            if old_count > 1:
                search = old_searches_keyed[search_key]
                self.progress(2, "Pruning duplicate search rule:", feature_rec, search["value"])
                for _ in range(old_count - 1):
                    search_rule_rec = feature_rec.deleteSearchRule(
                        search["value"], search["description"], search.get("lang")
                    )
                    dropped_search_rule_recs.append(search_rule_rec)

        # Update the arguments to both be de-duplicated, which the following code assumes.
        old_searches = old_searches_keyed.values()
        new_searches = {repr(search): search for search in new_searches}.values()

        # Remove rules no longer present
        for search in old_searches:
            if not search in new_searches:

                self.progress(2, "Dropping search rule:", feature_rec, search["value"])
                search_rule_rec = feature_rec.deleteSearchRule(
                    search["value"], search["description"], search.get("lang")
                )
                dropped_search_rule_recs.append(search_rule_rec)

        # Add rules not already present
        for search in new_searches:
            if not search in old_searches:

                self.progress(2, "Adding search rule:", feature_rec, search["value"])
                search_rule_rec = feature_rec.addSearchRule(
                    search["value"], search["description"], search.get("lang")
                )
                added_search_rule_recs.append(search_rule_rec)

        return dropped_search_rule_recs, added_search_rule_recs

    def updateFeatureRecProp(self, feature_rec, prop, value, tasks={}):
        """
        Update a basic of a feature type, reporting progress and avoiding redundant updates

        TASKS a dict with keys 'rebuilt_triggers' etc that get updated with actions required"""

        # ENH: Move to model?

        # Mapping from property names to field names
        prop_fields = {
            "datasource": "datasource_name",
            "title": "title_expr",
            "short_description": "short_description_expr",
        }

        if prop in ["name"]:  # ENH: Exclude from basic props
            return

        # Map to field name
        fld = prop_fields.get(prop, prop)

        # Check for attempt to change immutable property
        if fld in ["datasource_name"] and feature_rec[fld] != value:
            raise MywError(
                "Change of datasource not supported:", feature_rec[fld], "->", value
            )  # ENH: Permit switch to different external datasource

        # Set the property (logging change)
        changed = feature_rec.set_property(fld, value, self.progress)

        if not changed:
            return

        # Work out what needs rebuilding
        if prop in ["title", "short_description"]:  # Embedded in triggers, index records etc
            tasks["rebuild_triggers"] = True
            tasks[
                "rebuild_search_strings"
            ] = True  # ENH: only set for searches that include myw_title, myw_short_description

        elif prop in ["external_name"]:  # Embedded in triggers and search strings (in mangled form)
            tasks["rebuild_triggers"] = True
            tasks["rebuild_search_strings"] = True

        elif prop in ["track_changes"]:
            tasks["rebuild_triggers"] = True

        elif prop in ["geom_indexed"]:
            tasks["rebuild_triggers"] = True
            tasks["rebuild_geom_indexes"] = True

        elif prop in [
            "geometry_type",
            "versioned",
            "editable",
            "insert_from_gui",
            "update_from_gui",
            "delete_from_gui",
            "indexed",
            "remote_spec",
            "key_name",
            "geometry_type",
            "primary_geom_name",
            "editor_options",
        ]:
            pass

        else:
            raise MywInternalError("Unknown feature property: " + prop)  # Should never happen

        return

    def localFeatureTypeDescriptorFor(self, feature_rec):
        """
        Build feature type descriptor for local version of external feature type FEATURE_REC

        Returns a MywFeatureDescriptor for the myWorld datasource"""

        # Build local definition
        feature_desc = self.featureTypeDescriptor(feature_rec)
        feature_desc.datasource = "myworld"
        feature_desc.name = feature_rec.local_table_name()

        # Remove substructure not populated by MywExtractionEngine
        feature_desc.update({"groups": [], "queries": []})

        return feature_desc

    # ==============================================================================
    #                             BULK METADATA ACCESS
    # ==============================================================================

    def fieldNames(self, datasource, internal_name=None, data_type=None, generator=None):
        """
        Yields names of all feature fields in DATASOURCE (a list of <feature_type>,<field_name> tuples)

        Optional args can be used to filter what is yielded
        """

        for rec in self.fieldRecs(
            datasource, internal_name=internal_name, data_type=data_type, generator=generator
        ):
            yield (rec.table_name, rec.internal_name)

    def fieldRecs(self, datasource, internal_name=None, data_type=None, generator=None):
        """
        Query yielding all field records in DATASOURCE (as MywDDField objects)

        Optional args can be used to filter what is yielded
        """

        # Build query
        fld_defs = self.session.query(MywDDField).filter(MywDDField.datasource_name == datasource)

        if internal_name:
            fld_defs = fld_defs.filter(MywDDField.internal_name == internal_name)
        if data_type:
            fld_defs = fld_defs.filter(MywDDField.type == data_type)
        if generator:
            fld_defs = fld_defs.filter(MywDDField.generator == generator)

        # Yield values
        return fld_defs.order_by(MywDDField.table_name)

    # ==============================================================================
    #                            FEATURE TABLE MANAGEMENT
    # ==============================================================================
    # These are called for datasource 'myworld' only

    def createFeatureTable(self, feature_desc):
        """
        Create feature table as specified in FEATURE_DESC

        FEATURE_DESC is a MywFeatureDescriptor"""

        self.db_driver.createTable(feature_desc.tableDescriptor())

        if feature_desc.versioned:
            for schema in ["base", "delta"]:
                self.db_driver.createTable(feature_desc.tableDescriptor(schema))

    def alterFeatureTable(
        self,
        feature_type,
        old_feature_desc,
        new_feature_desc,
        date_format=None,
        timestamp_format=None,
    ):
        """
        Alter shape of a feature table from OLD_FEATURE_DESC to NEW_FEATURE_DESC

        OLD_FEATURE_DESC and NEW_FEATURE_DESC are MywFeatureDescriptors"""

        # Mutate the table
        changed = self.db_driver.alterTable(
            "data",
            feature_type,
            old_feature_desc.tableDescriptor(),
            new_feature_desc.tableDescriptor(),
            date_format,
            timestamp_format,
        )

        # Create, mutate or drop the delta tables
        for schema in ["base", "delta"]:
            if (not old_feature_desc.versioned) and new_feature_desc.versioned:
                self.db_driver.createTable(new_feature_desc.tableDescriptor(schema))

            elif old_feature_desc.versioned and new_feature_desc.versioned:
                self.db_driver.alterTable(
                    schema,
                    feature_type,
                    old_feature_desc.tableDescriptor(schema),
                    new_feature_desc.tableDescriptor(schema),
                    date_format,
                    timestamp_format,
                )

            elif old_feature_desc.versioned and (not new_feature_desc.versioned):
                self.db_driver.dropTable(schema, feature_type)

        # Remove record exemplar from cache
        self.clearFeatureModels()

        return changed

    def featureTableExists(self, feature_type):
        """
        True if the table for FEATURE_TYPE exists
        """

        return self.db_driver.tableExists("data", feature_type)

    def featureTableIsEmpty(self, feature_type):
        """
        True if the table for FEATURE_TYPE is empty
        """

        # ENH: Use SQLAlchmemy filter with limit

        if not self.db_driver.tableExists("data", feature_type):
            return True

        feature_table = self._getTable(feature_type)

        result = self.session.execute(feature_table.select())

        return result.first() is None

    def emptyFeatureTable(self, feature_type):
        """
        Delete all records (and associated index records) for feature_type

        If feature type is versioned, removes delta and base records too"""
        # ENH: Move to MywFeatureView?

        with self.progress.operation("Dropping data for:", feature_type) as op_stats:
            models = self.featureModelsFor(feature_type)
            op_stats["recs"] = 0

            # Delete records
            for schema in ["data", "delta", "base"]:
                model = models.get(schema)
                if model:
                    self.progress(2, "Deleting records from schema:", schema)
                    n_recs = self.session.query(model).delete()
                    self.progress(3, "Deleted", n_recs, "records")

                    op_stats["recs"] += n_recs

    def dropFeatureTable(self, feature_type):
        """
        Drop feature table for FEATURE_TYPE (if it exists)

        Also drops associated triggers and sequences"""

        # Drop delta tables (first, because delta uses master's sequence)
        for schema in ["base", "delta"]:
            self.db_driver.dropTableIfExists(schema, feature_type)

        # Drop master table
        self.db_driver.dropTableIfExists("data", feature_type)

    # ==============================================================================
    #                          FEATURE MODEL CONSTRUCTION
    # ==============================================================================
    # These are called for datasource 'myworld' only

    def featureModel(self, feature_type, schema="data"):
        """
        Returns SQLAlchemy model for FEATURE_TYPE (constructing if necessary)

        Required because feature tables cannot have pre-defined models"""

        models = self.featureModelsFor(feature_type)

        return models[schema]

    def featureModelsFor(self, feature_type):
        """
        Returns SQLAlchemy models for FEATURE_TYPE (constructing if necessary)

        Returns a dict of models, keyed by schema name"""

        self.progress(7, self, "Getting feature models for", feature_type)

        # Check for feature models out of date
        self._checkFeatureModels()

        # Check for already built
        models = self.feature_models.get(feature_type)
        if models:
            return models

        # Acquire lock to prevent sqlalchemy error "Trying to redefine primary-key column 'id' as a non-primary-key column on table ..."
        with self.feature_model_lock:

            # Check again as another thread may have finished populating the cache
            models = self.feature_models.get(feature_type)
            if models:
                return models

            # Build models from DD info
            models = self.feature_models[feature_type] = self._buildFeatureModels(feature_type)

        self.progress(7, self, "Got feature models for", feature_type)

        return models

    def _checkFeatureModels(self):
        """
        Discard cached feature models if database configuration has changed

        Used to detect changes made by other processes e.g. tools

        Note: Only checks every N seconds to avoid repeated queries on config log sequence"""

        if self.check_rate == None:
            return False

        # Limit frequency of database queries for config version
        if self.db_last_check:
            sec_since_last_check = (datetime.now() - self.db_last_check).total_seconds()
            if sec_since_last_check < self.check_rate:
                return False

        self.db_last_check = datetime.now()

        # Say what we are doing
        self.progress(8, "Checking for configuration changes")

        # If feature configuration has changed in any way ... discard cached models
        # ENH: Test could be more specific .. but probably not worth the bother
        dd_version = self.db_driver.versionStamp("myw_server_config")
        if self.dd_version == dd_version:
            return False

        self.clearFeatureModels()
        self.dd_version = dd_version

        return True

    def _buildFeatureModels(self, feature_type):
        """
        Constructs and returns SQLAlchemy models for FEATURE_TYPE

        Returns a dict of model classes, keyed by schema name ('data', 'base' and 'delta').
        Models including field mappers for geometry, booleans etc (from DD info)"""
        #
        # Required because feature tabled cannot have a pre-defined models

        self.progress(5, self, "Building feature models for", feature_type)

        # Get DD info
        feature_rec = self.featureTypeRec("myworld", feature_type, error_if_none=True)
        feature_desc = self.featureTypeDescriptor(
            feature_rec
        )  # ENH: Exclude searches, queries etc (for speed)
        geom_field_info = self.db_driver.geomFieldInfoFrom(
            feature_rec, feature_rec.dd_field_recs
        )  # ENH: Use feature_desc.fields (for speed)

        # Build table template
        table_def = self._buildTableDef(
            "data", feature_type, feature_rec, feature_desc, geom_field_info
        )

        # Get name for class, which must be ascii (python 2.7 limitation)
        model_name = str(feature_type)
        models = {}

        # Build master model
        models["data"] = type(
            model_name, (self.schema_base["data"], MywFeatureModelMixin), table_def
        )

        # Build delta table models (if required)
        if feature_rec.versioned:
            for schema in ["base", "delta"]:
                delta_table_def = self._buildTableDef(
                    schema, feature_type, feature_rec, feature_desc, geom_field_info
                )

                models[schema] = type(
                    model_name, (self.schema_base[schema], MywFeatureModelMixin), delta_table_def
                )

        # Cache for reuse
        self.feature_models[feature_type] = models

        return models

    def _buildTableDef(self, schema, feature_type, feature_rec, feature_desc, geom_field_info):
        """
        Constructs and returns SQLAlchemy table definition for SCHEMA.FEATURE_TYPE

        Returns a dict suitable for passing to type()"""

        self.progress(8, self, "Building feature model:", schema, feature_type)

        # Build basic definition
        table_def = dict(
            __tablename__=MywFeatureModelMixin.dbTableName(schema, feature_type),
            __table_args__=MywFeatureModelMixin.dbTableArgs(schema),
            _dd=self,
            _descriptor=feature_desc,
            _title_expr=feature_desc.parsedExpressionsFor("title", self.language_parser),
            _short_description_expr=feature_desc.parsedExpressionsFor(
                "short_description", self.language_parser
            ),
            _geom_field_info=geom_field_info,
        )

        # Add field access wrappers
        for field_name, field_desc in list(feature_desc.storedFields().items()):

            # Declare geometry fields
            if field_desc.isGeometry():
                table_def[field_name] = Column(
                    Geometry(srid=4326, **self.db_driver.sqa_geometry_opts)
                )

            # Make Oracle boolean fields return True/False (not 0/1)
            elif field_desc.type == "boolean":
                table_def[field_name] = Column(Boolean)

            # Make Oracle date fields return date only (not date+time)
            elif field_desc.type == "date":
                table_def[field_name] = Column(Date)

        return table_def

    def clearFeatureModels(self):
        """
        Discard cached feature models
        """

        with self.feature_model_lock:

            self.progress(7, self, "Clearing feature models")

            # Discard from SQLAlchemy's caches
            # ENH: Find a clean way
            for schema, base in list(self.schema_base.items()):
                self.progress(10, self, "Clearing SQLAlchemy data for schema:", schema)
                base.metadata.clear()
                base.registry._class_registry.clear()

            # Clear our cache
            self.feature_models.clear()

    def _getTable(self, table_name, schema_name="data"):
        """
        Return the SQLAlchemy table descriptor for TABLE_NAME
        """
        # ENH: Uses different metadata from buildFeatureModel()

        return self.db_driver._getTable(schema_name, table_name)

    # ==============================================================================
    #                              TRIGGER BUILDING
    # ==============================================================================
    # These are called for datasource 'myworld' only

    def rebuildTriggersFor(self, feature_rec):
        """
        Rebuild all triggers for FEATURE_REC (showing progress)

        Warning: Performs a commit"""

        with self.progress.operation("Building triggers for:", feature_rec.feature_name):
            self.buildTriggersFor(feature_rec)

    def buildTriggersFor(self, feature_rec):
        """
        Build all triggers for FEATURE_REC

        Warning: Performs a commit"""

        self._buildTriggersFor("data", feature_rec)

        if feature_rec.versioned:
            self._buildTriggersFor("delta", feature_rec)
            self._buildTriggersFor("base", feature_rec)

    def _buildTriggersFor(self, schema, feature_rec):
        """
        Build all triggers for FEATURE_REC

        Warning: Performs a commit"""

        if not self.db_driver.tableExists(schema, feature_rec.feature_name):
            return

        self.progress(2, "Building triggers in schema:", schema)

        # Prevent error if external name null
        if not feature_rec.external_name:
            feature_rec.external_name = feature_rec.feature_name.replace("_", " ").title()

        # Flush any cached changes to database
        self.session.flush()

        # Prevent deadlock due to sqlalchemy model's session in transaction on table # ENH: Avoid need for this
        self.session.commit()

        # Build triggers
        for trigger_type in ["insert", "update", "delete"]:

            sqls = self.db_driver.featureTriggerSqls(schema, feature_rec, trigger_type)
            for statement in sqls:
                self.session.execute(DDL(statement))

        # Release locks (Postgres 'alter table' acquires exclusive lock on table)
        self.session.commit()

    # ==============================================================================
    #                             INDEX TABLE MAINTENANCE
    # ==============================================================================
    # These are called for datasource 'myworld' only

    def rebuildGeomIndexesFor(self, feature_rec):
        """
        Recreate geometry index records for all features of type FEATURE_REC (and commit)
        """
        # Note: Commits change

        with self.progress.operation("Building geometry indexes for:", feature_rec.feature_name):

            with self.progress.operation("Building index records for schema:", "data") as op:
                op["recs"] = self.db_driver.rebuildGeomIndexesFor("data", feature_rec)

            if feature_rec.versioned:
                with self.progress.operation("Building index records for schema:", "delta") as op:
                    op["recs"] = self.db_driver.rebuildGeomIndexesFor("delta", feature_rec)

            self.db_driver.commit()  # Helps avoids huge transactions (slow on PostgreSQL)

    def rebuildAllSearchStringsFor(self, feature_rec):
        """
        Recreate all the search index entries for FEATURE_REC (and commit)
        """
        # Note: Commits change

        for search_rule_rec in feature_rec.search_rule_recs:
            self.rebuildSearchStringsFor(feature_rec, search_rule_rec)

    def rebuildSearchStringsFor(self, feature_rec, search_rule_rec):
        """
        Recreate the search index entries for SEARCH_RULE_REC (and commit)
        """
        # Note: Commits change

        with self.progress.operation(
            "Building search strings for rule:",
            search_rule_rec.feature_name,
            search_rule_rec.search_val_expr,
        ):

            with self.progress.operation("Building search strings for schema:", "data") as op:
                op["recs"] = self.db_driver.rebuildSearchStringsFor(
                    "data", feature_rec, search_rule_rec
                )

            if feature_rec.versioned:
                with self.progress.operation("Building search strings for schema:", "delta") as op:
                    op["recs"] = self.db_driver.rebuildSearchStringsFor(
                        "delta", feature_rec, search_rule_rec
                    )

            self.db_driver.commit()

    def deleteSearchStringsFor(self, feature_rec, search_rule_rec):
        """
        Delete the search strings for SEARCH_RULE_ID
        """

        with self.progress.operation(
            "Dropping search strings for rule:",
            search_rule_rec.feature_name,
            search_rule_rec.search_val_expr,
        ):
            self.db_driver.deleteSearchStringsFor("data", search_rule_rec.id)

            if feature_rec.versioned:
                self.db_driver.deleteSearchStringsFor("delta", search_rule_rec.id)

    # ==============================================================================
    #                              SEQUENCE MANAGEMENT
    # ==============================================================================
    # These are called for datasource 'myworld' only

    def adjustSequences(self, min_value, max_value, restart=False):
        """
        For all feature types with an ID generator, modify the sequence value

        Returns the names of the feature types whose ID generators were modified"""

        min_value = int(min_value)  # Sequence values must be int
        max_value = int(max_value)

        sequence_fields = self.sequenceFields("myworld")

        for schema, table, field in sequence_fields:
            self.db_driver.adjustSequenceRangeFor(
                schema, table, field, min_value, max_value, restart
            )

        return [item[1] for item in sequence_fields]

    def sequenceFields(self, datasource):
        """
        The feature fields that have a sequence generator (sorted by table name)

        Return a list of tuples of the form:
          (schema,table,field)"""

        fields = []
        for rec in self.fieldRecs(datasource, generator="sequence"):
            field = ("data", rec.table_name, rec.internal_name)
            fields.append(field)

        return fields
