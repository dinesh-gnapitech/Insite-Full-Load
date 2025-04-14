################################################################################
# myWorld extensions to the GeoJSON feature collection
################################################################################
# Copyright: IQGeo Limited 2010-2023

from geojson import FeatureCollection


class MywFeatureCollection(FeatureCollection):
    """
    A set of feature objects

    Extends standard FeatureCollection to add limit and offset properties."""

    def __init__(self, features=None, limit=None, offset=None, unlimited_count=None, **extra):
        """
        Initialize self
        """

        super(MywFeatureCollection, self).__init__(features, **extra)

        self.limit = limit

        # Add the unlimited feature count (no. features with any limits)
        self.unlimited_count = unlimited_count

        # Set the current offset
        if offset:
            self.offset = offset
        else:
            self.offset = 0

        # Set the feature count
        self.count = len(features)

        # Set the offsets
        if not self.limit or self.limit > self.count:
            self.next_offset = None
        else:
            self.next_offset = self.limit + self.offset

        if not self.limit or self.offset == 0:
            self.previous_offset = None
        else:
            self.previous_offset = max((self.offset - self.limit), 0)

    @property
    def __geo_interface__(self):
        """
        Returns self's spatial properties as a keyed set
        """
        # Subclassed to add the limit and offset properties

        d = super(MywFeatureCollection, self).__geo_interface__

        d.update(limit=self.limit)
        d.update(count=self.count)
        d.update(unlimited_count=self.unlimited_count)
        d.update(offset=self.offset)
        d.update(next_offset=self.next_offset)
        d.update(previous_offset=self.previous_offset)

        return d
