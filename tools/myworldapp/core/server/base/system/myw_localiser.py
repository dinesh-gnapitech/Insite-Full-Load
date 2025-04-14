################################################################################
# Engine for message lookup
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os, codecs, json, re


class MywLocaliser:
    """
    Engine for performing message lookup
    """

    def __init__(self, lang, msg_file, module_dir=None, encoding=None):
        """
        Create lookup engine returning messages from version LANG of MSG_FILE

        MSG_FILE is the file containing the messages (from public/locales/<lang>)
        MODULE_DIR is the path to the module where MSG_FILE is located. If omitted, it defaults to core
        """

        # ENH: Replace module_dir by module name + use myw_product.module().file()

        lang = lang or "<NONE>"  # Avoids confusing traceback building if lang unset

        if module_dir is None:  # Core
            module_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")

        file_name = msg_file + ".msg"
        file_path = os.path.join(module_dir, "public", "locales", lang, file_name)

        self.mapping = {}
        if os.path.exists(file_path):
            with codecs.open(file_path, "r", encoding) as json_stream:
                self.mapping = json.load(json_stream)

    def msg(self, group, id):
        """
        Return the message string ID from GROUP
        """

        if group in self.mapping:
            if id in self.mapping[group]:
                return self.mapping[group][id]

        return id

    def replaceTags(self, group, data):
        """
        Recurse over structure DATA replacing message tags

        Warning: Modifies DATA"""

        if isinstance(data, str):
            return self.replaceTagsIn(group, data)

        elif isinstance(data, list):
            for i in range(len(data)):
                data[i] = self.replaceTags(group, data[i])
            return data

        elif isinstance(data, dict):
            for k in list(data.keys()):
                data[k] = self.replaceTags(group, data[k])
            return data

        else:
            return data

    def replaceTagsIn(self, group, string):
        """
        Replace message tags in STRING with their values

        A message tag is indicated using: {:<msg_id>}"""

        list = re.findall("{:(.+)}", string)

        if not list:
            return string

        for id in list:
            val = self.msg(group, id)
            string = string.replace("{:" + id + "}", val)

        return string
