###############################################################################
# Controller for performing operations on delta tables
###############################################################################
# Copyright: IQGeo Limited 2010-2023

from collections import OrderedDict
from pyramid.view import view_config

from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.database.myw_database import MywDatabase

from myworldapp.core.server.controllers.base.myw_controller import MywController
from myworldapp.core.server.controllers.base.myw_feature_collection import MywFeatureCollection
from myworldapp.core.server.controllers.base.myw_utils import featuresFromRecs


class DeltaController(MywController):
    """
    Controller for performing operations on delta tables
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        self.trace_level = 0  # ENH: Make configurable from .ini

        MywController.__init__(self, request)

        self.db = MywDatabase(Session)
        self.progress = MywSimpleProgressHandler(self.trace_level)

    @view_config(route_name="myw_delta_controller.index", request_method="GET", renderer="json")
    def index(self):
        """
        Return delta records for DELTA
        """
        delta = self.getRequestDelta()

        # Unpick args
        # ENH: Support feature_types, aspects, session vars, change_type etc
        application = self.get_param(self.request, "application")

        # Check authorised
        self.current_user.assertAuthorized(self.request, application=application)
        # TODO: limit to accessible feature types

        # Find records

        db_view = self.db.view(delta)
        recs = []
        for feature_type in self.db.dd.featureTypes("myworld", versioned_only=True):
            table = db_view[feature_type]
            recs += table._delta_recs.all()

        # Build result
        features = featuresFromRecs(recs)

        return MywFeatureCollection(features)

    @view_config(route_name="myw_delta_controller.conflicts", request_method="GET", renderer="json")
    def conflicts(self):
        """
        Return ifno for records of FEATURE_TYPE that are in conflict with master
        """
        delta = self.getRequestDelta()

        # Unpick args
        # ENH: Support feature types, aspects, session vars, change_type etc?
        application = self.get_param(self.request, "application")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, application=application
        )  # ENH: Check feature types

        db_view = self.db.view(delta)

        # Find conflicts
        conflicts = {}
        for feature_type in self.db.dd.featureTypes("myworld", versioned_only=True):
            table = db_view[feature_type]

            # Build result
            ft_conflicts = {}
            for delta_rec in table._delta_recs:
                conflict = table.conflictFor(delta_rec)

                if conflict:
                    ft_conflicts[delta_rec._id] = conflict.definition()

            if ft_conflicts:
                conflicts[feature_type] = ft_conflicts

        return {"conflicts": conflicts}

    @view_config(route_name="myw_delta_controller.resolve", request_method="POST", renderer="json")
    def resolve(self):
        """
        Resolve conflicts for supplied features

        Apply changes and rebases the features"""
        delta = self.getRequestDelta()

        # ENH: Support revert

        # Unpick args
        application = self.get_param(self.request, "application")

        # ENH: Better to take a flat feature collection, using myw.feature_type to determine type?
        features = self.get_param(self.request, "features", "geojson")

        # Check authorised
        # ENH: Check authorised to edit delta owner?
        # ENH: Check authorised to edit all feature types?
        self.current_user.assertAuthorized(
            self.request, application=application, require_reauthentication=True
        )

        db_view = self.db.view(delta)

        # Rebase records (in single transaction)
        for feature_type in sorted(features.keys()):
            self.progress(0, "Resolving conflicts for", feature_type)

            table = db_view.table(feature_type, versioned_only=True)

            for feature in features[feature_type]:
                id = feature.properties[table.descriptor.key_field_name]
                self.progress(0, "Resolving", feature_type, id)
                delta_rec = table._deltaRec(id)
                table.resolve(delta_rec, feature)

        self.db.commit()

        return {}  # ENH: Return features

    @view_config(route_name="myw_delta_controller.promote", request_method="POST", renderer="json")
    def promote(self):
        """
        Apply change in DELTA to master

        Returns list of change counts, keyed by feature type"""
        delta = self.getRequestDelta()

        # ENH: Check for conflicts?

        # Unpick args
        application = self.get_param(self.request, "application")

        # Check authorised
        # ENH: Check authorised to edit delta owner?
        # ENH: Check authorised to edit all feature types?
        self.current_user.assertAuthorized(
            self.request, application=application, require_reauthentication=True
        )

        db_view = self.db.view(delta)
        counts = OrderedDict()

        # Apply changes to master (in single transaction)
        for feature_type in self.db.dd.featureTypes("myworld", versioned_only=True, sort=True):
            table = db_view[feature_type]

            self.progress(2, "Promoting records from", table)

            n_recs = 0
            for delta_rec in table._delta_recs:
                table.promote(delta_rec)
                n_recs += 1

            counts[feature_type] = n_recs

        self.db.commit()

        return {"counts": counts}

    @view_config(route_name="myw_delta_controller.delete", request_method="POST", renderer="json")
    def delete(self):
        """
        Delete delta records for FEATURE_TYPE to master

        Returns list of record counts, keyed by feature type"""
        delta = self.getRequestDelta()

        # Unpick args
        application = self.get_param(self.request, "application")

        # Check authorised
        # ENH: Check authorised to edit delta owner?
        # ENH: Check authorised to edit all feature types?
        self.current_user.assertAuthorized(
            self.request, application=application, require_reauthentication=True
        )

        db_view = self.db.view(delta)
        counts = OrderedDict()

        # Apply changes to master (in single transaction)
        for feature_type in self.db.dd.featureTypes("myworld", versioned_only=True, sort=True):
            table = db_view[feature_type]

            self.progress(2, "Deleting delta records from", table)

            n_recs = table.truncate()
            self.progress(3, "Deleted", n_recs, "delta records")

            if n_recs:
                counts[feature_type] = n_recs

        self.db.commit()

        return {"counts": counts}

    def getRequestDelta(self):
        """
        Returns the delta specified in the request
        """
        return self.request.matchdict["feature_type"] + "/" + self.request.matchdict["id"]
