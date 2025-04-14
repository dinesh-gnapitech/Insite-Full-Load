# Copyright: IQGeo Limited 2010-2023

from sqlalchemy.sql import null

from .myw_field import MywField
from .myw_reference import MywReference


class MywStoredReferenceField(MywField):
    """
    Wrapper for accessing a stored reference_set, reference or foreign_key field

    Provides methods for getting and setting values by URN or feature"""

    # ENH: Split out sub-classes for reference, etc

    def asDbValue(self, value):
        """
        Cast property VALUE to GeoAlchemy field format
        """

        # Make 'None' mean 'null' in database (rather than 'use default')
        if value is None or value == "":
            return null()

        if isinstance(value, list):
            return ";".join(value)

        return value

    def asJsonValue(self):
        """
        Json formatted value of field
        """

        value = self.raw_value
        if self.desc.type_desc.base == "reference_set":
            if value is None or value == "":
                return []
            else:
                return value.split(";")

        return value

    def displayValue(self):
        """
        Value to show in editor for self (if different from self's raw value)
        """

        value = self.raw_value
        type_desc = self.desc.type_desc

        # Case foreign_key: Return record title
        if type_desc.base == "foreign_key":

            if value is None:
                return None

            # Get record title
            try:
                return self.rec()._title()
            except:  # ENH: Be more specific
                return "error|" + value

        # Case reference: Return record title (myWorld records only)
        if type_desc.base == "reference":

            if value is None:
                return None

            # Check for external data source
            urn_parts = value.split("/")
            if len(urn_parts) > 2 and urn_parts[0] != "myworld":  # ENH: Encapsulate
                return None  # ENH: Do better

            # Get record title
            try:
                return self.rec()._title()
            except:  # ENH: Be more specific
                return "error|" + value

        # Case reference_set: Return item count
        if type_desc.base == "reference_set":
            return len(self.refs())  # ENH: Cheaper to count the ';'s

    def rec(self):
        """
        The feature referenced by self
        """
        # For reference and foreign_key fields only

        # ENH: Split into subclasses

        recs = self.recs()
        if not recs:
            return None

        return recs[0]

    def recs(self, feature_types=[], skip_bad_refs=False, ordered=False):
        """
        The features referenced by self

        If optional FEATURE_TYPES are provided, only return records for those types
        """

        # ENH: Warn about bad refs?

        error_if_bad = not skip_bad_refs

        refs = self.refs(*feature_types)
        # ignore non myworld references
        refs = [ref for ref in refs if ref.datasource == "myworld"]

        recs = []
        if len(refs) > 0:
            recs = self.feature._view.getRecs(refs, error_if_bad)

            if ordered:
                # sort by urn
                return sorted(recs, key=lambda rec: rec._urn())
            else:
                # sort by refs order for result consistency with previous versions
                urns = [ref.urn(False) for ref in refs]
                ordering = {id: i for i, id in enumerate(urns)}
                return sorted(recs, key=lambda rec: ordering.get(rec._urn()))

        return recs

    def urn(self, include_qualifiers=True):
        """
        URN of the feature referenced by self
        """
        # ENH: Move to separate class

        urns = self.urns(include_qualifiers=include_qualifiers)

        if not urns:
            return None

        return urns[0]

    def urns(self, include_qualifiers=True):
        """
        URNs of the features referenced by self
        """

        urns = []

        for ref in self.refs():
            urn = ref.urn(include_qualifiers=include_qualifiers)
            urns.append(urn)

        return urns

    def refs(self, *feature_types):
        """
        Self's feature references (a list of MywReferences)

        If optional FEATURE_TYPES are provided, only return refs for those types"""

        # Get field metadata
        type_desc = self.desc.type_desc

        # Get field value
        value = self.raw_value
        if not value:
            return []

        # Build list of refs
        if type_desc.base == "foreign_key":
            ref_feature_type = type_desc.args[0]

            if feature_types and not (ref_feature_type in feature_types):
                return []

            ref = MywReference("myworld", ref_feature_type, value)
            return [ref]

        else:
            refs = []

            for urn in value.split(";"):
                ref = MywReference.parseUrn(urn, error_if_bad=False)  # ENH: Report bad urns

                if feature_types and not (ref.feature_type in feature_types):
                    continue

                if ref:
                    refs.append(ref)

            return refs

    def add(self, feature):
        """
        Adds FEATURE to the set referenced by self (if not already present)

        Self must be a reference_set field"""

        urns = self.urns()  # ENH: Cheaper to use .refs()

        urn = feature._urn()

        if not urn in urns:
            urns.append(urn)
            self.setUrns(urns)

    def set(self, features):
        """
        Sets the features referenced by self
        """

        # Get field metadata
        type_desc = self.desc.type_desc

        if type_desc.base == "foreign_key":  # ENH: Split out to separate class, rename arg
            self.feature[self.name] = features._id

        else:
            urns = []
            for feature in features:
                urns.append(feature._urn())

            self.setUrns(urns)

    def addUrn(self, urn):
        """
        Adds URN to the set referenced by self (if not already present)

        Self must be a reference_set field"""

        urns = self.urns()

        if not urn in urns:
            urns.append(urn)
            self.setUrns(urns)

    def setUrns(self, urns):
        """
        Sets the URNs referenced by FIELD_NAME

        FIELD_NAME is a stored field of type:
          reference_set"""

        self.feature[self.name] = ";".join(urns)
