################################################################################
# myWorld configuration manager
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler

from myworldapp.core.server.models.myw_layer import MywLayer
from myworldapp.core.server.models.myw_network import MywNetwork
from myworldapp.core.server.models.myw_application import MywApplication
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
from myworldapp.core.server.models.myw_dd_enum import MywDDEnum
from myworldapp.core.server.models.myw_datasource import MywDatasource
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature


class MywLocalisationManager:
    """
    Enables dumping and loading of all localisable stings
    These are found in: applications, layers, networks, datasources, features, enums.
    """

    def __init__(self, db, progress=MywProgressHandler()):
        """
        Initialise self

        DB is a MywDatabase. Optional PROGRES_PROC(level,*msg) is a
        callback for progress messages"""

        self.db = db
        self.progress = progress
        self.language_parser = db.dd.language_parser

    def localisationData(self, language):
        """
        All localisation data for LANGUAGE
        Used by dump operation
        """

        # Get strings from models
        applications = self._attributeFrom(
            MywApplication, ["external_name", "description"], language
        )
        layers = self._attributeFrom(MywLayer, ["display_name", "description"], language)
        networks = self._attributeFrom(MywNetwork, ["external_name"], language)
        datasources = self._attributeFrom(MywDatasource, ["external_name"], language)
        features = self._buildFeatureLocalisationData(MywDDFeature, language)
        enum = self._buildEnumLocalisationData(MywDDEnum, ["display_value"], language)

        # Compile dict of results
        to_return = {
            "applications": applications,
            "features": features,
            "layers": layers,
            "networks": networks,
            "enum": enum,
            "datasources": datasources,
        }

        return to_return

    def applyLocalisationData(self, localisation_data, language):
        """
        Applies LOCALISATION_DATA to myWorld data
        """

        # Apply data to model
        self._renameTo(
            MywApplication,
            localisation_data["applications"],
            ["external_name", "description"],
            language,
        )
        self._renameTo(
            MywLayer, localisation_data["layers"], ["display_name", "description"], language
        )
        self._renameTo(MywNetwork, localisation_data["networks"], ["external_name"], language)
        self._renameTo(MywDatasource, localisation_data["datasources"], ["external_name"], language)
        self._applyFeatureLocalisationData(MywDDFeature, localisation_data["features"], language)
        self._applyEnumLocalisationData(MywDDEnum, localisation_data["enum"], language)

    def _attributeFrom(self, model, attribs, language, primary_key=None):
        """
        Returns ATTRIB field from records in table MODEL
        """

        # Find records
        recs = self.db.session.query(model)
        attributes = {}

        if primary_key is None:
            primary_key = "name"

        if language == self.db.dd.default_language:
            return_multi_lang_string = True
        else:
            return_multi_lang_string = False

        # Parse attribute from key
        no_value_string = "no value for {}".format(language)
        for rec in recs:
            temp = {}
            for attrib in attribs:
                temp[attrib] = self.language_parser.parse(
                    rec[attrib],
                    no_value_string,
                    language,
                    return_multi_lang_string=return_multi_lang_string,
                )
            attributes[rec[primary_key]] = temp

        return attributes

    def _buildEnumLocalisationData(self, model, attrib, language):
        """
        Helper to build enum display values dict from model
        """

        if language == self.db.dd.default_language:
            return_multi_lang_string = True
        else:
            return_multi_lang_string = False

        attributes = {}

        recs = self.db.session.query(model)

        no_value_string = "no value for {}".format(language)
        for rec in recs:
            enum_definition = rec.definition()
            values = {}
            for value in enum_definition["values"]:
                values[value["value"]] = self.language_parser.parse(
                    value["display_value"],
                    no_value_string,
                    language,
                    return_multi_lang_string=return_multi_lang_string,
                )
            attributes[rec["name"]] = values

        return attributes

    def _buildFeatureLocalisationData(self, model, language):
        """
        Helper to build feature display values dict from MODEL
        RETURNS dict of all features keyed on datasource name
        """

        if language == self.db.dd.default_language:
            return_multi_lang_string = True
        else:
            return_multi_lang_string = False

        recs = self.db.session.query(model)

        no_value_string = "no value for {}".format(language)
        feature_data = {}

        # Loop over all features
        for rec in recs:
            if rec.datasource_name not in feature_data:
                feature_data[rec.datasource_name] = {}

            parsed_feature = {}

            # Parse basic keys
            parsed_feature = {
                "external_name": self.language_parser.parse(
                    rec.external_name, no_value_string, language, return_multi_lang_string
                ),
                "title_expr": self.language_parser.parse(
                    rec.title_expr, no_value_string, language, return_multi_lang_string
                ),
                "short_description_expr": self.language_parser.parse(
                    rec.short_description_expr, no_value_string, language, return_multi_lang_string
                ),
                "fields": {},
                "searches": [],
                "queries": [],
                "field_groups": {},
            }

            # Parse external keys
            parsed_feature["fields"] = self.parse_field_data(
                rec, no_value_string, language, return_multi_lang_string
            )
            parsed_feature["searches"] = self.parse_search_data(
                rec, no_value_string, language, return_multi_lang_string
            )
            parsed_feature["queries"] = self.parse_query_data(
                rec, no_value_string, language, return_multi_lang_string
            )
            parsed_feature["field_groups"] = self.parse_field_groups_data(
                rec, no_value_string, language, return_multi_lang_string
            )

            feature_data[rec.datasource_name][rec.feature_name] = parsed_feature

        return feature_data

    def _renameTo(self, model, data, keys, language):
        """
        Changes property of MODEL to relevant property in DATA, found from KEYS and language
        """
        recs = self.db.session.query(model)

        for rec in recs:
            if rec["name"] not in data:
                continue
            for key in keys:
                new_value = self._getStringFromLocalisationData(
                    rec[key], data[rec["name"]][key], language
                )
                if new_value is not None:
                    rec[key] = new_value
        self.db.session.commit()

    def _applyFeatureLocalisationData(self, model, data, language):
        """
        Changes localisable properties of myWorldDDFeature MODEL to new properties from relevant strings in DATA
        """

        basic_keys = ["external_name", "title_expr", "short_description_expr"]
        external_keys = ["fields", "searches", "queries", "field_groups"]

        recs = self.db.session.query(model)

        feature_data = {}
        for rec in recs:
            # Apply data to basic properties
            for key in basic_keys:
                if rec.datasource_name in data and rec.feature_name in data[rec.datasource_name]:
                    new_feature_data = data[rec.datasource_name][rec.feature_name][key]
                else:
                    continue
                new_value = self._getStringFromLocalisationData(
                    rec[key], new_feature_data, language
                )
                if new_value is not None:
                    rec[key] = new_value

            # Apply data to external keys
            self.apply_field_data(rec, data, language)
            self.apply_query_data(rec, data, language)
            self.apply_search_data(rec, data, language)
            self.apply_field_groups_data(rec, data, language)

        self.db.session.commit()
        return

    def _applyEnumLocalisationData(self, model, data, language):
        """
        Changes localisable properties of myWorldEnum model to new properties from relevant strings in DATA
        """

        recs = self.db.session.query(model)

        for rec in recs:
            # If rec has been added since dump continue
            if rec["name"] not in data:
                continue
            value_recs = rec.value_recs
            for value_rec in value_recs:
                # If value rec has been added since dump continue
                if value_rec["value"] not in data[rec["name"]]:
                    continue
                if value_rec["value"] == None:
                    value_rec["value"] = "null"

                # Get new display value
                old_display_value = value_rec["display_value"]
                new_display_value = data[rec["name"]][value_rec["value"]]
                new_data = self._getStringFromLocalisationData(
                    old_display_value, new_display_value, language
                )
                # Set it
                if new_data is not None:
                    value_rec["display_value"] = new_data

        self.db.session.commit()
        return

    def _getStringFromLocalisationData(self, old_value, new_value, language):
        """
        Formats OLD_VALUE and NEW_VALUE to return a multi language dict
        """

        if self.language_parser.is_multi_language_string(old_value):
            old_value = self.language_parser.load(old_value)
            if isinstance(new_value, str) and "no value" in new_value:
                return
            # update old value
            if language in old_value:
                old_value[language] = new_value
                new_data = old_value
            # Add new value
            else:
                temp = {language: new_value}
                new_data = dict(old_value, **temp)
            return json.dumps(new_data)
        elif isinstance(new_value, str) and "no value" in new_value:
            return
        # If new value is string (not dict) old value's language code must have been the default language
        # So retain old value with default language and add new with language
        else:
            temp = {self.db.dd.default_language: old_value, language: new_value}
            return json.dumps(temp)

    def parse_field_data(self, rec, no_value_string, language, return_multi_lang_string):
        """
        Parse multi language string in feature fields in REC for LANGUAGE.
        If no value for LANGUAGE returns NO_VALUE_STRING
        """

        fields = {}
        field_recs = rec.fieldRecs()
        for field_rec in field_recs:
            fields[field_rec] = self.language_parser.parse(
                field_recs[field_rec]["external_name"],
                no_value_string,
                language,
                return_multi_lang_string,
            )
        return fields

    def parse_search_data(self, rec, no_value_string, language, return_multi_lang_string):
        """
        Parse multi language string in feature searches in REC for LANGUAGE.
        If no value for LANGUAGE returns NO_VALUE_STRING
        """

        searches = []
        search_recs = rec.search_rule_recs
        for search_rec in search_recs:
            if search_rec["lang"] == language:
                temp = {}
                temp["search_desc_expr"] = search_rec["search_desc_expr"]
                temp["search_val_expr"] = search_rec["search_val_expr"]
                searches.append(temp)
        return searches

    def parse_query_data(self, rec, no_value_string, language, return_multi_lang_string):
        """
        Parse multi language string in feature queries in REC for LANGUAGE.
        If no value for LANGUAGE returns NO_VALUE_STRING
        """

        queries = []
        query_recs = rec.query_recs
        for query_rec in query_recs:
            if query_rec["lang"] == language:
                temp = {}
                temp["myw_search_val1"] = query_rec["myw_search_val1"]
                temp["myw_search_desc1"] = query_rec["myw_search_desc1"]
                temp["attrib_query"] = query_rec["attrib_query"]
                queries.append(temp)
        return queries

    def parse_field_groups_data(self, rec, no_value_string, language, return_multi_lang_string):
        """
        Parse multi language string in feature fields in REC for LANGUAGE.
        If no value for LANGUAGE returns NO_VALUE_STRING
        """

        field_groups = {}
        for field_group_rec in rec.field_group_recs:
            display_name = field_group_rec["display_name"]
            display_position = field_group_rec["display_position"]
            field_groups[display_position] = self.language_parser.parse(
                display_name, no_value_string, language, return_multi_lang_string
            )
        return field_groups

    def apply_field_data(self, rec, data, language):
        """
        Apply multi languge strings in DATA to fields recs
        """

        field_recs = rec.fieldRecs()
        if rec.datasource_name in data and rec.feature_name in data[rec.datasource_name]:
            fields_data = data[rec.datasource_name][rec.feature_name]["fields"]
        else:
            return
        for field_rec in field_recs:
            if field_rec in fields_data:
                new_value = self._getStringFromLocalisationData(
                    field_recs[field_rec]["external_name"], fields_data[field_rec], language
                )
                if new_value is not None:
                    field_recs[field_rec]["external_name"] = new_value

    def apply_query_data(self, rec, data, language):
        """
        Apply multi languge strings in DATA to query recs
        """

        if rec.datasource_name in data and rec.feature_name in data[rec.datasource_name]:
            updates = data[rec.datasource_name][rec.feature_name]["queries"]
        else:
            return

        query_recs = rec.query_recs

        # First, check for any query records that match several key properties
        # If any of them match, update them here
        for query_rec in query_recs:
            for updateIndex, update in enumerate(updates):
                if (
                    query_rec["lang"] == language
                    and query_rec["myw_search_val1"] == update["myw_search_val1"]
                    and query_rec["datasource_name"] == rec.datasource_name
                    and query_rec["myw_object_type"] == rec.feature_name
                ):
                    query_rec["myw_search_desc1"] = update["myw_search_desc1"]
                    query_rec["attrib_query"] = update["attrib_query"]
                    updates.pop(updateIndex)

        # For any that haven't been matched, create a new record
        for update in updates:
            rec.addQuery(
                update["myw_search_val1"],
                update["myw_search_desc1"],
                update["attrib_query"],
                language,
            )

    def apply_search_data(self, rec, data, language):
        """
        Apply multi languge strings in DATA to search recs
        """

        if rec.datasource_name in data and rec.feature_name in data[rec.datasource_name]:
            updates = data[rec.datasource_name][rec.feature_name]["searches"]
        else:
            return

        search_recs = rec.search_rule_recs

        # First, check for any query records that match several key properties
        # If any of them match, update them here
        for search_rec in search_recs:
            for updateIndex, update in enumerate(updates):
                if (
                    search_rec["lang"] == language
                    and search_rec["search_val_expr"] == update["search_val_expr"]
                    and search_rec["datasource_name"] == rec.datasource_name
                    and search_rec["feature_name"] == rec.feature_name
                ):
                    search_rec["search_desc_expr"] = update["search_desc_expr"]
                    updates.pop(updateIndex)

        # For any that haven't been matched, create a new record
        for update in updates:
            rec.addSearchRule(update["search_val_expr"], update["search_desc_expr"], language)

    def apply_field_groups_data(self, rec, data, language):
        """
        Apply multi languge strings in DATA to field group recs
        """

        if rec.datasource_name in data and rec.feature_name in data[rec.datasource_name]:
            field_groups = data[rec.datasource_name][rec.feature_name]["field_groups"]
            if not field_groups:
                return
        else:
            return
        for field_group_rec in rec.field_group_recs:
            if field_group_rec["display_position"] in field_groups:
                new_value = field_groups[str(field_group_rec["display_position"])]
            else:
                continue
            new_value = self._getStringFromLocalisationData(
                field_group_rec["display_name"], new_value, language
            )
            if new_value is not None:
                field_group_rec["display_name"] = new_value
