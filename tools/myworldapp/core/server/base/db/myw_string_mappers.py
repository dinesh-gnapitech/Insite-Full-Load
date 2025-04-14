# Copyright: IQGeo Limited 2010-2023

import sqlalchemy.types as types
import json


class MywNullMappingString(types.TypeDecorator):
    """
    Database string field accessor mapping "" to null

    Used to make Postgres behave like Oracle"""

    impl = types.String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """
        Going into the db, convert empty strings to NULL
        """
        if value == "":
            return None

        return value

    def process_result_value(self, value, engine):
        """
        Comming out of the DB, convert empty strings to NULL
        """
        if value == "":
            return None

        return value


class MywUTF8MappingString(types.TypeDecorator):
    """
    Database string field accessor mapping unicode binds to UTF8

    Used to fix Oracle performance issue (see Fogbugz 6000)"""

    impl = types.String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """
        Going into the db, conert unicode strings to UTF8
        """

        if isinstance(value, str):
            return value.encode("utf-8")

        return value


class MywJsonString(types.TypeDecorator):
    """
    Database field holding a JSON value as a string
    """

    # Note: Performs mapping when record is fetched .. so can affect performance

    impl = types.String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """
        Going into the db, encode value as JSON string
        """

        if value is not None:
            value = json.dumps(value)

        return value

    def process_result_value(self, value, dialect):
        """
        Comming out of the DB, decode JSON from string
        """

        print("Getting value")

        if value is not None:
            value = json.loads(value)

        return value
