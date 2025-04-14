###############################################################################
# Parser for multi-language strings
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import json
import re

import logging

logger = logging.getLogger(__name__)


class MywMultiLanguageParser:
    """
    Helper to parse a myWorld multi-language strings

    A multi-language string is a json object keyed on language
    ie:  {"en":"English","mi":"(------Language------)"}"""

    def __init__(self, system_languages=[], default_language=None):
        """
        Create a parser for processing multi-language strings"""

        self.system_languages = system_languages
        self.default_language = default_language

    def languages_for(self, multi_language_string):
        """
        Return languages present in a multi-language string"""

        try:
            multi_language_string = json.loads(multi_language_string)
            return list(multi_language_string.keys())
        except:
            return []

    def display_language(self, language):
        """
        Returns the language to be used when displaying a multi-language strings for a given language"""

        # If language is an available language use it.
        if language in self.system_languages:
            return language

        # If language family is an available language use it (ie: use en for en-US)
        language_family = self.parseLanguageFamily(language)
        if language_family in self.system_languages:
            return language_family

        # Use default system language
        return self.default_language

    def parse(
        self,
        multi_language_string,
        missing_language_message="System.language.missing",
        language=None,
        return_multi_lang_string=True,
    ):
        """
        Return a language specific value from a multi-language string"""

        try:
            translations = json.loads(multi_language_string)

            if language not in translations and language:
                return missing_language_message

            lang_value = translations.get(language)
            if lang_value is not None:
                return lang_value
        except (json.JSONDecodeError, TypeError):
            # Return value if it can't be processed as a multi_language_string
            if return_multi_lang_string:
                return multi_language_string
            else:
                return missing_language_message
        except:
            # other errors can occur if the string looks like JSON, but doesn't have a get method after deserialisation.
            logger.warn(
                "MywMultiLanguageParser.parse: couldn't process " + repr(multi_language_string)
            )

        # Return missing_language_message if we can't find an appropriate language value
        return missing_language_message

    def parseLanguageFamily(self, lang):
        """
        Returns the language family for a language code.
        ie: 'pt-PT' and 'pt-BR' would both return the language family 'pt'"""

        if lang is None:
            return lang

        matches = re.search("^([a-z]{2})-[A-Z,a-z]{2}$", lang)
        if matches and matches.group(1):
            return matches.group(1)

        """Returns original input if no match found"""
        return lang

    def is_multi_language_string(self, string):
        """
        Returns TRUE if STRING is a dict (and therefore a multi language string), else FALSE
        """
        try:
            loaded_data = json.loads(string)
            if isinstance(loaded_data, dict):
                return True
            else:
                return False
        except:
            return False

    def stringify(self, multi_lang_dict):
        """
        Helper to stringify MULTI_LANG_DICT
        """
        return json.dumps(multi_lang_dict)

    def load(self, multi_lang_dict):
        """
        Helper to load MULTI_LANG_DICT
        """
        try:
            return json.loads(multi_lang_dict)
        except:
            return
