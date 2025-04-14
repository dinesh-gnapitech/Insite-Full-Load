# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.dd.myw_reference import MywReference
from .myw_feature_view import MywFeatureView


class MywCachingFeatureView(MywFeatureView):
    """
    A feature view with in-memory cache - for intensive read-only operations.

    For use cases where a short-lived read-only instance is useful. This class does not prevent
    you from writing to the database, which will invalidate its cache, so use it with
    appropriate caution."""

    def __init__(self, db_view, cache_max_size=10000):
        """
        Construct a Caching feature view
        """

        super().__init__(db_view.db, db_view.delta, db_view.schema)

        self.features = {}  # Keyed by urn
        self.max_size = cache_max_size

    def getCachingView(self):
        """
        For API-compatibility with the base class, we override this since this is already a caching view.
        """
        return self

    def getRecs(self, refs, error_if_bad=True):
        """
        Returns records referenced by REFS (a list of MywReferences or URNs)

        Missing records are ignored. Order of result is undefined

        If ERROR_IF_BAD is True, raises ValueError on malformed URNs

        Subclassed to return feature from cache (if easy)"""

        if len(refs) == 1:
            rec = self.get(refs[0], error_if_bad)
            if rec:
                return [rec]
            return []

        recs = super().getRecs(refs, error_if_bad=error_if_bad)

        # Clear cache if it's full:
        if self.max_size and len(self.features) + len(recs) > self.max_size:
            self.features = {}

        # Cache the features before we return them.
        for rec in recs:
            # Build cache key
            if isinstance(rec, MywReference):
                urn = rec.urn()
            else:
                urn = rec

            self.features[urn] = rec

        return recs

    def get(self, ref, error_if_bad=True):
        """
        Returns the record referenced by REF (a MywReference or URN) if there is one

        If ERROR_IF_BAD is True, raises ValueError on malformed URNs

        Subclassed to return feature from cache (if present)"""

        # Build cache key
        if isinstance(ref, MywReference):
            urn = ref.urn()
        else:
            urn = ref

        # Read feature (if necessary)
        if not urn in self.features:

            # Clear cache if it's full:
            if self.max_size and len(self.features) >= self.max_size:
                self.features = {}

            self.features[urn] = super().get(ref, error_if_bad=error_if_bad)

        # Return it
        return self.features[urn]
