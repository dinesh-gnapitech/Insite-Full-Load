################################################################################
# Engine for accessing a specified version of feature data
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError, MywUnknownFeatureTypeError

from .myw_feature_table import MywFeatureTable
from .myw_versioned_feature_table import MywVersionedFeatureTable
from .myw_reference import MywReference


class MywFeatureView:
    """
    Manager for accessing a specified version of the myWorld database's feature data

    Provides facilities for accessing feature tables (.table()). Also has
    helpers for retrieving records direct from URNs etc (.get())"""

    # ==============================================================================
    #                                 CONSTRUCTION
    # ==============================================================================

    def __init__(self, db, delta="", schema="data"):
        """
        Init slots of self

        DB is a MywDatabase.
        DELTA identifies the delta to look at (or exclude when SCHEMA is 'delta')
        SCHEMA specifies the set of data to look at:
          'data': master + the specified delta (if given)
          'delta': all deltas except the specified one (if given)
        """

        self.db = db
        self.delta = delta
        self.schema = schema if schema else "data"
        self.session = db.session
        self.progress = db.progress

    def getCachingView(self):
        """
        Some use cases require a view with caching, which is not write-safe:
        """
        from .myw_caching_feature_view import MywCachingFeatureView

        return MywCachingFeatureView(self)

    def __ident__(self):
        """
        String identifying self in progress messages etc
        """

        return "{}({})".format(self.__class__.__name__, self.delta)

    # ==============================================================================
    #                                  TABLE ACCESS
    # ==============================================================================

    def __iter__(self):
        """
        Yields feature tables of self (MywFeatureTables)
        """

        for feature_type in self.db.dd.featureTypes("myworld"):
            yield self.table(feature_type)

    def __getitem__(self, feature_type):
        """
        Returns table for FEATURE_TYPE (a MywFeatureTable)
        """

        return self.table(feature_type)

    def table(self, feature_type, versioned_only=False, error_if_none=True):
        """
        Returns object for accessing records of FEATURE_TYPE (a MywFeatureTable)
        """

        # Get models
        try:
            models = self.db.dd.featureModelsFor(feature_type)

        except MywUnknownFeatureTypeError:
            if error_if_none:
                raise
            return None

        # Build table accessor
        if self.delta or self.schema == "delta":
            if models["data"]._descriptor.versioned:
                return MywVersionedFeatureTable(
                    self,
                    feature_type,
                    models["data"],
                    models["base"],
                    models["delta"],
                    self.delta,
                    self.schema,
                )

            if versioned_only:
                raise MywError(self, ":", "Feature type is not versioned:", feature_type)

        return MywFeatureTable(self, feature_type, models["data"])

    # ==============================================================================
    #                                  RECORD ACCESS
    # ==============================================================================

    def getRecs(self, refs, error_if_bad=True):
        """
        Returns records referenced by REFS (a list of MywReferences or URNs)

        Missing records are ignored. Order of result is undefined

        If ERROR_IF_BAD is True, raises ValueError on malformed URNs"""

        # Group IDs by feature type (for speed)
        ids_by_type = {}
        for ref in refs:

            # Convert URN -> Ref (if necessary)
            if not isinstance(ref, MywReference):
                ref = MywReference.parseUrn(ref, error_if_bad=error_if_bad)
                if not ref:
                    continue

            # Add to list
            ids = ids_by_type.get(ref.feature_type)
            if not ids:
                ids = ids_by_type[ref.feature_type] = set()
            ids.add(ref.id)

        # Get features
        recs = []
        for feature_type, ids in list(ids_by_type.items()):
            table = self.table(feature_type)
            recs += table.getRecs(ids)

        return recs

    def get(self, ref, error_if_bad=True):
        """
        Returns the record referenced by REF (a MywReference or URN) if there is one

        If ERROR_IF_BAD is True, raises ValueError on malformed URNs"""

        # Cast to reference
        if not isinstance(ref, MywReference):
            ref = MywReference.parseUrn(ref, error_if_bad=error_if_bad)
            if not ref:
                return None

        # Check is a myworld feature
        if ref.datasource != "myworld":
            if error_if_bad:
                ref.assert_myworld()
            return None

        # Get record (if it exists)
        return self.table(ref.feature_type).get(ref.id)
