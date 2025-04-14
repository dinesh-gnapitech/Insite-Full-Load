# ******************************************************************************
# Coordinate System Definition
# ******************************************************************************
# Copyright: IQGeo Limited 2010-2023

import os, re
import pyproj
from pyproj.crs import CRS
import pyproj.exceptions

from myworldapp.core.server.base.core.myw_error import MywCoordSystemError


class MywCoordSystem:
    """
    A geographic coordinate system definition

    Wraps pyproj.Proj. Provided to retain epsg name (for srid)"""

    # ENH: Nicer as a subclass

    def __init__(self, cs_def):
        """
        Init slots of self

        CS_DEF is one of:
         <pro4_str>    e.g. "+proj=longlat +datum=WGS84 +no_defs"
         <name>        e.g. "epsg:4326"
         <srid>        e.g. 4326
         <dict>        e.g. dict of proj4 params"""

        # Case: Proj4 Def
        if isinstance(cs_def, str) and cs_def.startswith("+"):
            try:
                crs = CRS(cs_def)
                self.srid = crs.to_epsg()
            except pyproj.exceptions.CRSError as ex:
                raise MywCoordSystemError("Bad coodinate system definition. pyproj error:", str(ex))

        # Case: Name
        elif isinstance(cs_def, str):
            self.srid = int(cs_def.split(":")[-1])

        # Case: SRID
        elif isinstance(cs_def, int):
            self.srid = cs_def

        # Case: Dict
        elif isinstance(cs_def, dict):
            if "init" in cs_def:
                self.srid = cs_def["init"].split(":")[-1]
            else:
                self.srid = self.sridFor(cs_def)

        # Other
        else:
            raise MywCoordSystemError("Bad coodinate system definition:", cs_def)

        # Set name
        self.name = "epsg:{}".format(self.srid)

        # Build transform
        try:
            self.proj = pyproj.Proj(self.name, preserve_units=True)
        except Exception as cond:
            raise MywCoordSystemError("Bad coodinate system definition:", self.name, "(", cond, ")")

    def __ident__(self):
        """
        String used to indetify self in myWorld error messages
        """

        return self.name

    def __repr__(self):
        """
        String used to indentify self in tracebacks etc
        """

        return f"MywCoordSystem({self.name})"

    def __eq__(self, another):
        """
        True if self and ANOTHER are equivalent
        """

        return isinstance(another, self.__class__) and self.name == another.name

    def __ne__(self, another):
        """
        True if self and ANOTHER are not equivalent
        """

        return not (self == another)

    # ==============================================================================
    #                                   SRID CATALOGUE
    # ==============================================================================

    # Mapping from epsg srid to proj4 param dicts (init lazily, empty dict is Falsey)
    __srid_defs__ = {}

    @classmethod
    def getSridDefs(cls):
        """
        Returns the list of SRID defs, ensuring they have been read first
        """
        cls._ensureSrids()
        return cls.__srid_defs__

    @classmethod
    def getCRSDef(cls, crs):
        """
        Gets the parsed CRS definition for the provided CRS
        """
        cls._ensureSrids()
        if crs in cls.__srid_defs__:
            return cls.__srid_defs__[crs]
        else:
            raise MywCoordSystemError("Undefined coordinate system:", crs)

    @classmethod
    def sridFor(cls, target_crs):
        """
        The epsg code corresponding to proj4 dict definition TARGET_CRS

        Provided because Fiona sometimes fails to recognise SRID codes"""

        cls._ensureSrids()

        # Do lookup
        for srid, crs in list(cls.__srid_defs__.items()):
            if crs == target_crs:
                return srid

        raise MywCoordSystemError("Cannot determine SRID for coordinate system:", target_crs)

    @classmethod
    def _ensureSrids(cls):
        """
        Ensures that the list of SRIDs is populated
        """
        if not cls.__srid_defs__:
            cls.__srid_defs__ = cls._readSridDefs()

    @classmethod
    def _readSridDefs(cls):
        """
        Get definitions of known EPSG spatial reference ids (from GDAL data)

        Returns a dict of proj4 dict objects, keyed by SRID"""

        # ENH: Replace by osr.SpatialReference().exportToWKT()['PROJCS']['AUTHORITY'] ?
        # ENH: Or, migrate this to the new WKT2 format that the EPSG dataset is published in.

        catalog_file = os.path.join(os.path.dirname(__file__), "epsg")

        srid_defs = {}
        regex = re.compile(r"\<(\d+)\>\s*(.*)\s*\<\>")

        with open(catalog_file) as strm:
            for line in strm:
                if line.startswith("#"):
                    continue

                match = regex.match(line)
                if match is not None:
                    srid = int(match.group(1))
                    proj4_str = match.group(2)

                    srid_defs[srid] = cls._parseProj4(proj4_str)

        return srid_defs

    @classmethod
    def _parseProj4(cls, proj4_str):
        """
        Converts proj4 string to a dict of params
        """

        regex = re.compile(r"\+(.+)=(.*)")

        params = {}

        for item in proj4_str.split():
            if not item:
                continue

            if "=" in item:
                match = regex.match(item)  # ENH: Warn if no match
                param = match.group(1)
                val = match.group(2)
            else:
                param = item
                val = True

            params[param] = val

        return params
