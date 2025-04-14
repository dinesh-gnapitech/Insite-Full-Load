################################################################################
# Shared behaviour for record exemplars
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Column, Sequence
from sqlalchemy.ext.declarative import declarative_base
from geoalchemy2 import Geometry as GeometryBase

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.db.globals import Session

# SQLAlchemy superclass (and registry) for system table models
ModelBase = declarative_base(name="system")


class MywModelMixin:
    """
    Shared behaviour for myWorld record exemplars

    Provides helpers for table name building etc"""

    # ==============================================================================
    #                              CLASS METHODS
    # ==============================================================================
    # These are used in model declarations

    @classmethod
    def dbTableName(self, schema, table):
        """
        Helper returning database name of TABLE
        """
        return Session.myw_db_driver.dbNameFor(schema, table)

    @classmethod
    def dbTableArgs(self, schema):
        """
        Helper returning table args
        """

        return {
            "schema": Session.myw_db_driver.dbNameFor(schema),
            "extend_existing": True,
            "autoload": True,
            "autoload_with": Session.bind,
        }

    @classmethod
    def keyColumn(self, schema, table, field, sqa_type, generator=None):
        """
        Helper returning explicit column definition for a key field
        """

        if not generator:
            return Column(sqa_type, primary_key=True)

        elif generator == "sequence":
            db_schema = Session.myw_db_driver.dbNameFor(schema) or None
            db_seq_name = Session.myw_db_driver.dbSequenceNameFor(schema, table, field)
            sequence = Sequence(db_seq_name, schema=db_schema)
            return Column(sqa_type, sequence, primary_key=True)

        else:
            raise Exception("Unknown generator: " + generator)  # Internal error

    @classmethod
    def geometry_column_names(self):
        """
        Names of self's geometry columns
        """

        return [c.name for c in self.__table__.columns if isinstance(c.type, GeometryBase)]

    @classmethod
    def fnmatch_filter(self, column_name, spec):
        """
        Returns a 'like' predicate on COLUMN_NAME matching fnmatch-style pattern SPEC
        """
        # Implemented on model because SQLAlchemy bugs force passing of an explicit escape char
        # Sqlite requires an explicit escape char .. and postgres won't accept the default ('\') as arg

        escape_ch = "^"

        sql_spec = self._likePatternFor(spec, escape_ch)

        return self.__table__.columns[column_name].like(sql_spec, escape=escape_ch)

    @classmethod
    def _likePatternFor(self, spec, escape_ch):
        """
        Convert fnmatch-style pattern SPEC to a SQL LIKE pattern
        """

        # Escape LIKE specials
        spec = spec.replace(escape_ch, escape_ch + escape_ch)
        spec = spec.replace("%", escape_ch + "%")
        spec = spec.replace("_", escape_ch + "_")

        # Convert fnmatch specials to LIKE specials format
        spec = spec.replace("*", "%")
        spec = spec.replace("?", "_")

        return spec

    # ==============================================================================
    #                                   UTILS
    # ==============================================================================

    def setFields(self, props, skip=[], immutable=[]):
        """
        Update self from the values in dict PROPS

        SKIP and IMMUTABLE are lists of properties to ignore"""

        for prop, value in list(props.items()):

            if prop in skip:
                continue

            if prop in immutable:
                if value != self[prop]:
                    raise MywError("Change not permitted:", prop, ":", self[prop], "->", value)
                continue

            self[prop] = value

    def __getitem__(self, prop):
        """
        Get value of field via []
        """
        return getattr(self, prop)

    def __setitem__(self, prop, val):
        """
        Set value of field via []
        """
        if not prop in list(self.__table__.c.keys()):
            raise MywError("Unknown property:", prop)

        setattr(self, prop, val)
