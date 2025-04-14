################################################################################
# Misc controller helper procs
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json
from pyramid.httpexceptions import HTTPBadGateway
from sqlalchemy import literal
from sqlalchemy.exc import DataError

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.base.core.utils import interpret_data_error


def featuresFromRecs(feature_recs, sorter=None, **opts):
    """
    Builds a list of geojson features from FEATURE_RECS

    OPTS are passed on to MywFeatureModel.asGeojsonFeature()"""
    # ENH: Better as constructor on MywFeatureCollection?

    # Avoid unnecesary work in geo_geom finding
    if "cache" not in opts:
        opts["cache"] = {}

    # Build list
    features = []
    for rec in feature_recs:
        features.append(rec.asGeojsonFeature(**opts))

    if sorter:
        features = sorted(features, key=sorter)

    return features


def mywAbort(msg, **params):
    """
    Abort a controller request, returning MSG and PARAMS to client
    """
    # Raises a 502 with a special message tag that is interpreted by JavaScript helper

    payload = {"msg": str(msg), "params": params}

    raise HTTPBadGateway("mywAbort:" + json.dumps(payload))


def data_error_tween_factory(handler, _):
    """Factory function for a pyramid tween, which catches SQLA DataErrors (anticipated in some
    config pages) and retrieves the user an error message."""

    def data_error_tween(request):
        try:
            response = handler(request)
        except DataError as e:
            # myw_pyramid_app already tries to do this, but seems to miss mywAbort exceptions.
            Session.rollback()  # pylint: disable=no-member
            mywAbort(interpret_data_error(e))

        return response

    return data_error_tween


# ==============================================================================
#            Generating SQLA filters for MywFeatureTable objects.
# ==============================================================================


def filterFor(
    current_user,
    model,
    feature_type,
    geom_field_names,
    world,
    geom_wkb,
    filter_name,
    session_vars,
    mode="intersects",
    dist=None,
):
    """
    Returns SQLAlchemy filter to perform spatial scan defined by args
    """

    spatialFilter = renderSpatialFilter(model, geom_field_names, world, geom_wkb, mode, dist)

    # Add record filter (if there is one)
    if filter_name:
        return spatialFilter & sqlaFilterOf(
            feature_type, filter_name, current_user, model.__table__, session_vars
        )

    return spatialFilter


def sqlaFilterOf(feature_type, filter_name, current_user, feature_table, session_vars):
    """
    The sqlalchemy filter for FILTER_NAME of FEATURE_TYPE

    FEATURE_TABLE is the feature's sqlalchemny table descriptor"""

    pred = current_user.featureTypeFilter(
        None, "myworld", feature_type, filter_name
    )  # ENH: pass in application name

    return pred.sqaFilter(feature_table, variables=session_vars)


def renderSpatialFilter(model, geom_field_names, world, geom_wkb, mode, dist):
    """
    Returns SQLAlchemy filter to perform spatial scan defined by args
    """
    filter = None
    for geom_field_name in geom_field_names:
        field_filter = fieldSpatialFilter(model, geom_field_name, world, geom_wkb, mode, dist)
        filter = field_filter if filter is None else filter | field_filter

    return filter


def fieldSpatialFilter(model, geom_field_name, world, geom_wkb, mode="intersects", dist=None):
    """
    Returns SQLAlchemy filter to perform spatial scan defined by args
    """
    filter = None

    # Add world filter
    world_field_name = model._geom_field_info[
        geom_field_name
    ]  # TODO: Skip query if int and no gwn field
    if world_field_name:
        world_column = getattr(model, world_field_name)
        filter = world_column == world
    elif world != "geo":
        # internal world and no gwn field - query shouldn't return any features
        return literal(False)

    # Add spatial filter
    geom_column = getattr(model, geom_field_name)
    if mode == "covered_by":
        spatial_filter = geom_column.ST_CoveredBy(geom_wkb)
    elif mode == "within_dist":
        spatial_filter = geom_column.ST_DWithin(geom_wkb, dist)
    else:
        # by default, we use ST_INTERSECTS here.
        spatial_filter = geom_column.ST_Intersects(geom_wkb)
    filter = spatial_filter if filter is None else filter & spatial_filter

    return filter
