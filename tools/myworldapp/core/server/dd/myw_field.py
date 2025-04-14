# Copyright: IQGeo Limited 2010-2023

from sqlalchemy.sql import null


class MywField:
    """
    Wrapper for accessing a field of a feature record
    """

    # ENH: Convert to a proper SQLAlchemy field accessor?

    def __init__(self, feature, field_name):
        """
        Init slots of self
        """

        self.feature = feature
        self.name = field_name
        self.desc = feature._descriptor.fields[field_name]
        self.column_def = feature.__table__.columns[field_name] if self.desc.isStored() else None

    def __ident__(self):
        """
        String identifying self
        """

        return "{}.{}".format(self.feature.feature_type, self.name)

    def __str__(self):
        """
        String identifying self in tracebacks
        """

        return "{}({})".format(self.__class__.__name__, self.__ident__())

    def set(self, value):
        """
        Set self's value
        """
        # to be subclassed in fields that require special behaviour and provide a generic method

        self.feature[self.name] = value

    @property
    def raw_value(self):
        """
        Raw value of field
        """

        return self.feature[self.name]

    def asDbValue(self, value):
        """
        Cast property VALUE to GeoAlchemy field format
        """
        # Overridden in subclasses. Default implementation is to handle empty values
        # or return value

        # Make 'None' mean 'null' in database (rather than 'use default')
        if value is None or value == "":
            return null()

        return value

    def asJsonValue(self):
        """
        JSON representation of Value for self
        """
        # Overridden in subclasses. Default implementation is to use raw value

        return self.raw_value

    def displayValue(self):
        """
        Value to show in editor for self (if different from self's raw value)
        """
        # Overridden in subclasses. Default implementation is to use raw value

        return None
