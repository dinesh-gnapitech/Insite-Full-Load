################################################################################
# myWorld uniform resource name
################################################################################
# Copyright: IQGeo Limited 2010-2023

from collections import OrderedDict


class MywReference:
    """
    A reference to a myWorld database object

    Consists of a record identifier plus optional qualifiers
    (c.f. a graph database attributed link).

    Provides facilities for parsing from a URN string"""

    @classmethod
    def parseUrn(self, urn, datasource="myworld", error_if_bad=False):
        """
        Build a reference from a myWorld URN string (uniform resource name)

        DATASOURCE is the default datasource to use if not present
        in the URN. If format error raises ValueError or returns None

        URN format is:
           [<datasource>] / <feature_type> / <id> [?<qualifier>=<value>] [&<qualifier>=<value>] ..

        Example:
           copper_cable/1537684?from_pair=1&to_pair=3"""

        def error(*msg):
            if error_if_bad:
                raise ValueError(" ".join(msg))

        # Extract qualifiers
        qualifiers = OrderedDict()
        if "?" in urn:
            (base, qualifiers_str) = urn.split("?")

            for qualifier_str in qualifiers_str.split("&"):  # ENH: Faster to do this lazily
                (key, val) = qualifier_str.split("=")
                qualifiers[key] = val
        else:
            base = urn

        # Extract feature type and ID
        base_parts = base.split("/")
        n_parts = len(base_parts)

        if (n_parts < 2) or (n_parts > 3):
            error("Bad feature reference:", base)
            return None

        feature_id = base_parts.pop()
        feature_type = base_parts.pop()
        if base_parts:
            datasource = base_parts.pop()

        return MywReference(datasource, feature_type, feature_id, qualifiers)

    def __init__(self, datasource, feature_type, id, qualifiers={}):
        """
        Init slots of self
        """

        self.datasource = datasource
        self.feature_type = feature_type
        self.id = id
        self.qualifiers = qualifiers

    def assert_myworld(self):
        """
        Raise ValueError if self is not from the myWorld datasource
        """

        # ENH: Strictly, datasource None means same as owning record .. so this is not entirely correct
        if self.datasource != "myworld":
            raise ValueError("Not a myWorld feature: " + self.base)

    def urn(self, include_qualifiers=True):
        """
        Self as a URN string
        """

        # Build base
        urn = self.base

        # Add qualifiers
        if include_qualifiers:
            sep = "?"
            for qual, val in list(self.qualifiers.items()):
                urn += "{}{}={}".format(sep, qual, val)
                sep = "&"

        return urn

    @property
    def base(self):
        """
        Self's unqualified URN
        """
        # ENH: get rid of this?

        # Add datasource (if required)
        urn = ""
        if self.datasource != "myworld":
            datasource_prefix = "{}/".format(self.datasource)

        # Add feature ref
        urn += "{}/{}".format(self.feature_type, self.id)

        return urn

    def __str__(self):
        """
        String used to identify self in GUI
        """

        return "{}({})".format(self.__class__.__name__, self.urn())

    def __myw_json__(self):
        """
        Representation of self for JSON
        """

        return self.urn()
