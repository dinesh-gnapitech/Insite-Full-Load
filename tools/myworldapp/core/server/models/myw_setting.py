################################################################################
# Record exemplar for myw.setting
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.models.base import ModelBase, MywModelMixin
import json


class MywSetting(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.setting
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "setting")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    def definition(self):
        """
        Return self in a serializable format
        """
        return {"name": self.name, "type": self.type, "value": self.value}

    def formattedValue(self):
        """
        Self's stored value, converted as per self.type
        """

        # Permitted values for boolean settings (case insensitive)
        bool_mappings = {"true": True, "false": False}

        # Format the value
        # ENH: (?)Duplicates code with JavaScript
        # ENH: Report conversion errors cleanly
        if self.type == "STRING":
            return self.value

        elif self.type == "BOOLEAN":
            try:
                return bool_mappings[self.value.lower()]
            except Exception as cond:
                raise Exception(
                    "Setting {}: Bad value for {}: {}".format(self.name, self.type, self.value)
                )

        elif self.type == "INTEGER":
            return int(self.value)

        elif self.type == "FLOAT":
            return float(self.value)

        elif self.type == "JSON":
            return json.loads(self.value)

        else:
            raise Exception("Setting {}: Bad type: {}".format(self.name, self.type))

    def setValue(self, formatted_value):
        """
        Set self's stored value and type
        """

        # Determine type
        # TODO: If you already set, retain it?
        if isinstance(formatted_value, str):
            data_type = "STRING"
            value = formatted_value

        elif isinstance(formatted_value, (bool)):
            data_type = "BOOLEAN"
            value = str(formatted_value)

        elif isinstance(formatted_value, int):
            data_type = "INTEGER"
            value = str(formatted_value)

        elif isinstance(formatted_value, (float)):
            data_type = "FLOAT"
            value = str(formatted_value)

        elif isinstance(formatted_value, (dict, list)):
            data_type = "JSON"
            value = json.dumps(formatted_value)

        else:
            raise Exception(self.name, "Cannot determine storage type for", formatted_value)

        self.type = data_type
        self.value = value
