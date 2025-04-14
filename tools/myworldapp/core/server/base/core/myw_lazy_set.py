################################################################################
# Lazy set
################################################################################
# Copyright: IQGeo Limited 2010-2023


class MywLazySet:
    """
    A keyed set of values, some of which may be lazy evaluated
    """

    def __init__(self):
        """
        Init slots of self
        """

        self.functs = {}
        self.values = {}

    def __str__(self):
        """
        String identifying self
        """

        return "{}({})".format(self.__class__.__name__, len(self.functs) + len(self.values))

    def add(self, key, value, lazy=False):
        """
        Set value for KEY. If LAZY is true, value must be a function

        For lazy entries, the function will be called the first time
        the key is used."""

        if lazy:
            self.functs[key] = value
            self.values.pop(key, None)
        else:
            self.values[key] = value
            self.functs.pop(key, None)

    def get(self, key, default=None):
        """
        Get value for KEY. Returns DEFAULT is key not present
        """

        # Check for lazy
        funct = self.functs.pop(key, None)

        if funct:
            self.values[key] = funct()

        return self.values.get(key, default)
