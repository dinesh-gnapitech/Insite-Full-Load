################################################################################
# Object modelling a feature conflict
################################################################################
# Copyright: IQGeo Limited 2010-2023

from collections import OrderedDict


class MywConflict:
    """
    A feature-level conflict

    Holds the delta, master and base versions of the record plus the type of
    change made in master"""

    def __init__(self, master_change, delta_rec, master_rec=None, base_rec=None):
        """
        Init slots of self
        """

        self.master_change = master_change
        self.delta_rec = delta_rec
        self.master_rec = master_rec
        self.base_rec = base_rec

    def definition(self):
        """
        Self as a serialisable structure
        """

        defn = OrderedDict()

        # Add records
        defn["delta"] = self.delta_rec.asGeojsonFeature()
        if self.base_rec:
            defn["base"] = self.base_rec.asGeojsonFeature()
        if self.master_rec:
            defn["master"] = self.master_rec.asGeojsonFeature()

        # Add change info
        defn["master_change"] = self.master_change
        defn["master_fields"] = self.changedFields(self.base_rec, self.master_rec)
        defn["delta_fields"] = self.changedFields(self.base_rec, self.delta_rec)

        return defn

    def changeStr(self, rec1, rec2):
        """
        String summarising the change rec1 -> rec2
        """

        if not rec1 and not rec2:
            return "-"
        if not rec1 and rec2:
            return "insert"
        if rec1 and not rec2:
            return "delete"

        fields = self.changedFields(rec1, rec2)
        return "update({})".format(",".join(fields))

    def changedFields(self, rec1, rec2):
        """
        Names of the fields that have changed rec1 -> rec2 (handling unsets)
        """

        if not rec1 or not rec2:
            return None

        return rec2._differences(rec1)
