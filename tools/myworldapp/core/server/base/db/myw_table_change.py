###############################################################################
# Objects representing table muations
###############################################################################
# Copyright: IQGeo Limited 2010-2023


class MywTableChange:
    """
    Abstract superclass for objects representing a change to the structure of a table
    """

    def __init__(self, change_type, schema, tablename, field_names):
        """
        Init slots of self
        """
        self.change_type = change_type
        self.schema = schema
        self.tablename = tablename
        self.field_names = field_names

    def description(self):
        """
        Textual description of the change
        """

        return "{} {}".format(self.change_type, ",".join(self.field_names))


class MywAddColumnChange(MywTableChange):
    """
    Defines addition fo a column to a table
    """

    def __init__(self, schema, tablename, field_name, column_desc):
        """
        Init slots of self
        """
        super(MywAddColumnChange, self).__init__("add field", schema, tablename, [field_name])
        self.field_name = field_name
        self.column_desc = column_desc


class MywAlterColumnChange(MywTableChange):
    """
    Defines mutation of a table column
    """

    def __init__(self, schema, tablename, field_name, old_column_desc, new_column_desc):
        """
        Init slots of self

        OLD_COLUMN_DESC and NEW_COLUMN_DESC are MywDbColumn descriptors"""

        super(MywAlterColumnChange, self).__init__("alter field", schema, tablename, [field_name])
        self.field_name = field_name
        self.old_column_desc = old_column_desc
        self.new_column_desc = new_column_desc

    def description(self):
        """
        Textual description of the change

        Subclassed to add change details"""

        desc = super(MywAlterColumnChange, self).description()

        for prop in self.old_column_desc.differences(self.new_column_desc):
            old_value = self.old_column_desc.get(prop)
            new_value = self.new_column_desc.get(prop)
            desc += " {}({}->{})".format(prop, old_value, new_value)

        return desc


class MywDropColumnChange(MywTableChange):
    """
    Defines removal of a table column
    """

    def __init__(self, schema, tablename, field_name, column_desc):
        """
        Init slots of self
        """
        super(MywDropColumnChange, self).__init__("drop field", schema, tablename, [field_name])
        self.field_name = field_name
        self.column_desc = column_desc


class MywAddIndexChange(MywTableChange):
    """
    Defines addition of an index
    """

    def __init__(self, schema, tablename, index_desc):
        """
        Init slots of self

        INDEX_DESC is a MywDbIndex descriptor"""

        super(MywAddIndexChange, self).__init__(
            "add index", schema, tablename, index_desc.column_names
        )
        self.index_desc = index_desc


class MywDropIndexChange(MywTableChange):
    """
    Defines drop of an index
    """

    def __init__(self, schema, tablename, index_desc):
        """
        Init slots of self

        INDEX_DESC is a MywDbIndex descriptor"""
        super(MywDropIndexChange, self).__init__(
            "drop index", schema, tablename, index_desc.column_names
        )
        self.index_desc = index_desc
