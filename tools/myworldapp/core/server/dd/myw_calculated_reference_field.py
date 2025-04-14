# Copyright: IQGeo Limited 2010-2023

import re
from myworldapp.core.server.base.core.myw_error import MywError
from sqlalchemy.sql import or_

from .myw_field import MywField


class MywCalculatedReferenceField(MywField):
    """
    Wrapper for accessing a calculated reference or reference_set field

    Provides methods for getting features"""

    # Regex for parsing calculated field select() expression
    select_regex = re.compile("^select\((.*)\)$")

    def rec(self):
        """
        The feature referenced by self
        """
        # For reference fields only

        # ENH: Split into subclasses

        recs = self.recs()
        if not recs:
            return None

        return recs[0]

    def recs(self, feature_types=[], skip_bad_refs=False, ordered=False, additional_filters={}):
        """
        The features referenced by self

        If optional FEATURE_TYPES are provided, only return records for those types
        """

        recs = []
        queries = {}

        # For each field in the select specifier ...
        for feature_type, field_name in self._scanInfo(*feature_types):

            # Find referenced table
            ref_table = self.feature._view.table(feature_type, error_if_none=not skip_bad_refs)
            if not ref_table:
                continue

            # Get referenced field
            field_desc = ref_table.model._descriptor.fields.get(field_name)
            if not field_desc:
                if skip_bad_refs:
                    continue
                raise MywError("No such field:", feature_type, field_name)

            # Determine value on which join is based
            if ref_table.model._descriptor.fields[field_name].type_desc.base == "foreign_key":
                ref_value = str(self.feature._id)
            else:
                ref_value = self.feature._urn()

            # Compose filter, which also matches qualified urns
            query = queries.get(feature_type, None)
            if query is None:
                query = queries[feature_type] = {"ref_table": ref_table, "fields": []}

            query["fields"].append({"field_name": field_name, "ref_value": ref_value})

        # Get records
        for feature_type, query in queries.items():

            filter_builder = lambda model: self.improved_filter(
                model, query, additional_filters.get(feature_type, None)
            )
            for rec in query["ref_table"].filterWith(filter_builder).recs():
                recs.append(rec)

        if ordered:
            return sorted(recs, key=lambda rec: (rec.feature_type, rec._id))

        return recs

    def improved_filter(self, model, query, additional_filter=None):
        """
        Returns SQLAlchemy filter that gets feature with urn equal to or like the REF_VALUE in FIELD_NAME
        """

        filters = []
        for field_entry in query["fields"]:
            field_name = field_entry["field_name"]
            ref_value = field_entry["ref_value"]
            referenced_field_column = getattr(model, field_name)
            filters.append((referenced_field_column == ref_value))
            # ENH: support qualified URNs - requires different indexes

        filter = or_(*filters)

        if additional_filter is not None:
            filter &= additional_filter

        return filter

    def filter(self, model, ref_table, field_name, ref_value, additional_filter=None):
        """
        Returns SQLAlchemy filter that gets feature with urn equal to or like the REF_VALUE in FIELD_NAME
        """
        referenced_field_column = getattr(model, field_name)
        filter = (
            referenced_field_column == ref_value
        )  # ENH: support qualified URNs - requires different indexes

        # If additional_filter is specified, combine it with this one
        if additional_filter is not None:
            filter &= additional_filter

        return filter

    def _scanInfo(self, *feature_types):
        """
        Yields the datbase columns referenced by self

        Yields:
           FEATURE_TYPE
           FIELD_NAME

        If optional FEATURE_TYPES are provided, only return those types"""

        # Unpick the value expression
        match = self.select_regex.match(self.desc.value)

        if not match:
            raise MywError("Field", self, ": Bad select expression:", self.desc.value)

        # Split and yield the scan info
        field_specs = match.group(1)

        # Unfortunately, split() will always return at least one item, even if the arg list is
        # empty, so we check if empty to avoid trying to parse a field from nothing. Equally, the
        # contents of the string may be invalid for other reasons, e.g. if loaded from a config
        # file rather than from the config app UI.
        if field_specs.strip():
            db_columns = []
            try:
                # Parse all the fields before we yield any, so we don't return a subset of columns
                # from an invalid string.
                for field_spec in field_specs.split(","):
                    feature_type, field_name = field_spec.split(".", 1)

                    if feature_types and feature_type not in feature_types:
                        continue

                    db_columns.append((feature_type, field_name))

                for col in db_columns:
                    yield col
            except TypeError:
                # ENH: Add progress and log the error here, noting which reference field has an
                # invalid config.
                pass
