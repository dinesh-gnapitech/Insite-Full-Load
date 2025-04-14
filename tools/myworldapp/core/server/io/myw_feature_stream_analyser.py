################################################################################
# myWorld engine for inferring table structure from set of features
################################################################################
# Copyright: IQGeo Limited 2010-2023

# General imports
from collections import OrderedDict


class MywFeatureStreamAnalyser:
    """
    Engine for inferring table structure from a feature set

    Used for dynamically creating feature tables during data import"""

    def featureDefinitionFor(self, ftr_name, feature_strm):
        """
        Analyse FEATURE_STRM and create a feature definition to support the data in ths stream

        Returns a dict with structure similar to .def file"""

        prop_descs = OrderedDict()

        # Build property descriptors
        for rec in feature_strm:

            for prop_name, prop_value in list(rec.items()):

                # If already seen ...
                if prop_name in list(prop_descs.keys()):
                    desc = prop_descs[prop_name]

                    # Ensure size is adequate
                    if desc["type"] == "string" and prop_value != None:
                        desc["size"] = max(desc["size"], len(prop_value))

                else:
                    desc = prop_descs[prop_name] = {}

                    # Determine field type
                    if hasattr(prop_value, "type"):  # Case: GeoJSON geometry
                        desc["type"] = prop_value.type.lower()

                    elif isinstance(prop_value, bool):  # Note: Must come before 'int'
                        desc["type"] = "boolean"

                    elif isinstance(prop_value, int):
                        desc["type"] = "integer"

                    elif isinstance(prop_value, float):
                        desc["type"] = "double"

                    else:
                        desc["type"] = "string"

                        if isinstance(prop_value, str):
                            desc["size"] = max(100, len(prop_value))
                        else:
                            desc["size"] = 100

        # Convert property definitions to field definitions
        for prop_name, prop_desc in list(prop_descs.items()):
            prop_desc["name"] = prop_name

            size = prop_desc.pop("size", None)
            if size:
                prop_desc["type"] += "({})".format(size)

        key_name = feature_strm.key_name

        if not key_name in prop_descs:
            prop_descs[key_name] = {"name": key_name, "type": "integer", "generator": "sequence"}

        prop_descs[key_name]["key"] = True

        # Build feature defininition
        ftr_def = {"name": ftr_name, "fields": list(prop_descs.values())}

        return ftr_def
