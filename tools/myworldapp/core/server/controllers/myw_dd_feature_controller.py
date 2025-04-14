################################################################################
# Controller for myw.dd_feature
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import simplejson, traceback
from contextlib import contextmanager
from sqlalchemy import func

from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.base.db.myw_filter_parser import MywFilterParser

from myworldapp.core.server.models.myw_datasource import MywDatasource
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
from myworldapp.core.server.models.myw_layer import MywLayer
from myworldapp.core.server.models.myw_layer_feature_item import MywLayerFeatureItem
from myworldapp.core.server.models.myw_search_rule import MywSearchRule
from myworldapp.core.server.models.myw_query import MywQuery
from myworldapp.core.server.models.myw_filter import MywFilter

from myworldapp.core.server.dd.myw_dd import MywDD
from myworldapp.core.server.dd.myw_feature_descriptor import MywFeatureDescriptor

from myworldapp.core.server.controllers.base.myw_utils import mywAbort
from myworldapp.core.server.controllers.base.myw_controller import MywController
from myworldapp.core.server.controllers.base.myw_controller_progress import (
    MywControllerProgressHandler,
)
from collections import defaultdict

import myworldapp.core.server.controllers.base.myw_globals as myw_globals


class MywDDFeatureController(MywController):
    """
    Controller for feature type definition operations
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        MywController.__init__(self, request)
        self.dd = myw_globals.dd

        settings = request.registry.settings
        self.log_level = settings.get("myw.feature.options", {}).get("dd_log_level", 0)

    @view_config(
        route_name="myw_dd_feature_controller.index", request_method="GET", renderer="json"
    )
    def index(self):
        """
        Get properties of all feature types

        Returns a list of dicts"""
        datasource = self.request.matchdict["datasource"]

        self.current_user.assertAuthorized(
            self.request, application="config"
        )  # This is also used by settings

        # For speed, get layer codes using only one query
        # ENH: Move this to model (?as class method)
        layer_codes_query = (
            Session.query(MywDDFeature, MywLayer)
            .outerjoin((MywLayerFeatureItem, MywLayerFeatureItem.feature_id == MywDDFeature.id))
            .outerjoin((MywLayer, MywLayer.id == MywLayerFeatureItem.layer_id))
            .order_by(MywDDFeature.feature_name, MywLayer.name)
        )

        feature_layer_codes = {}
        for feature, layer in layer_codes_query:
            if layer and layer.code:

                layer_codes = feature_layer_codes.get(feature.feature_name)

                if not layer_codes:
                    layer_codes = feature_layer_codes[feature.feature_name] = []

                layer_codes.append(layer.code)

        # For speed, get search rule counts in one query
        search_rule_counts = self.count_by_lang(MywSearchRule, "feature_name")
        query_counts = self.count_by_lang(MywQuery, "myw_object_type")

        filter_counts = (
            Session.query(MywFilter.feature_name, func.count(MywFilter.feature_name))
            .group_by(MywFilter.feature_name)
            .all()
        )
        filter_counts = dict(filter_counts)

        # Build list of feature definitions
        feature_props = []
        feature_query = (
            Session.query(MywDDFeature)
            .filter(MywDDFeature.datasource_name == datasource)
            .order_by(MywDDFeature.feature_name)
        )

        for feature in feature_query:

            layer_codes = feature_layer_codes.get(feature.feature_name, [])

            props = {
                "id": feature.id,
                "datasource": feature.datasource_name,
                "name": feature.feature_name,
                "external_name": feature.external_name,
                "geometry_type": feature.geometry_type,
                "editable": feature.editable,
                "track_changes": feature.track_changes,
                "versioned": feature.versioned,
                "layers": ",".join(sorted(layer_codes)),
                "search_rule_count": search_rule_counts.get(feature.feature_name, 0),
                "query_count": query_counts.get(feature.feature_name, 0),
                "filter_count": filter_counts.get(feature.feature_name, 0),
            }

            feature_props.append(props)

        # Sort list (to get consistent results on all platforms)
        # Note: Necessary because Postgres prioritises underscore differently on windows and linux
        sort_proc = lambda item: item["name"]
        feature_props = sorted(feature_props, key=sort_proc)

        return {"feature_types": feature_props}

    def count_by_lang(self, Model, feature_name):
        """
        Creates a dict for the feature_name with number of queries keyed on lang
        Returns the following format:
        {<feature_name>: {<lang1>: <num_queries_in_lang1>, <lang2>: <num_queries_in_lang2>} }}
        """
        counts = defaultdict(lambda: defaultdict(lambda: 0))

        for q in Session.query(Model):
            name = q[feature_name]
            lang = q.lang

            counts[name][lang] += 1
        return counts

    @view_config(
        route_name="myw_dd_feature_controller.with_feature_type",
        request_method="GET",
        renderer="json",
    )
    def get(self):
        """
        Get definition of FEATURE_TYPE
        """
        datasource = self.request.matchdict["datasource"]
        feature_type = self.request.matchdict["feature_type"]

        self.current_user.assertAuthorized(self.request, right="manageFeatures")

        feature_rec = self.dd.featureTypeRec(datasource, feature_type)
        feature_desc = self.dd.featureTypeDescriptor(feature_rec)

        return feature_desc.definition(extras=True)

    @view_config(
        route_name="myw_dd_feature_controller.create", request_method="POST", renderer="json"
    )
    def create(self):
        """
        Create a new feature definition record
        """
        datasource = self.request.matchdict["datasource"]

        self.current_user.assertAuthorized(self.request, right="manageFeatures")

        # Get options
        props = simplejson.loads(self.request.body)
        task_id = self.request.params.get("task_id")

        # Add properties implied by rest routing
        props["datasource"] = datasource

        # Remove pseudo-properties that were added by extras and the backbone model (if present)
        props.pop("id", None)
        props.pop("geometry_type", None)
        props.pop("search_rule_count", None)
        props.pop("query_count", None)

        # Apply the change (tracking progress if requested)
        try:
            with self.dd_for_task(task_id) as dd:
                feature_desc = MywFeatureDescriptor.fromDef(props, add_defaults=True)
                feature_rec = dd.createFeatureType(feature_desc)

        except MywError as e:
            if self.log_level > 3:
                traceback.print_exc()
            mywAbort(e.msg)

        except Exception as e:
            traceback.print_exc()
            mywAbort("Internal error: " + str(e))

        Session.commit()

        # Return what we created
        return self.dd.featureTypeDescriptor(feature_rec).definition(extras=True)

    @view_config(
        route_name="myw_dd_feature_controller.with_feature_type",
        request_method="PUT",
        renderer="json",
    )
    def update(self):
        """
        Update the feature definition record for ID (and rebuild dependent data)
        """
        datasource = self.request.matchdict["datasource"]
        feature_type = self.request.matchdict["feature_type"]

        self.current_user.assertAuthorized(self.request, right="manageFeatureConfig")

        # Get options
        props = simplejson.loads(self.request.body)
        task_id = self.request.params.get("task_id")

        # Add properties implied by rest routing
        props["datasource"] = datasource

        # Remove pseudo-properties that were added by extras and the backbone model (if present)
        props.pop("id", None)
        props.pop("geometry_type", None)
        props.pop("search_rule_count", None)
        props.pop("query_count", None)

        # Apply the change (tracking progress if requested)
        try:
            with self.dd_for_task(task_id) as dd:
                feature_rec = dd.featureTypeRec(datasource, feature_type, error_if_none=True)
                feature_desc = MywFeatureDescriptor.fromDef(props)
                dd.alterFeatureType(
                    feature_rec,
                    feature_desc,
                    check_filter_usage=True,
                    permit_mutation=self.current_user.hasRight("manageFeatures"),
                )

        except MywError as e:
            if self.log_level > 3:
                traceback.print_exc()
            mywAbort(e.msg)

        except Exception as e:
            traceback.print_exc()
            mywAbort("Internal error: " + str(e))

        Session.commit()

        return self.dd.featureTypeDescriptor(feature_rec).definition(extras=True)

    @view_config(
        route_name="myw_dd_feature_controller.with_feature_type",
        request_method="DELETE",
        renderer="json",
    )
    def delete(self):
        """
        Delete the feature definition record
        """
        datasource = self.request.matchdict["datasource"]
        feature_type = self.request.matchdict["feature_type"]

        self.current_user.assertAuthorized(self.request, right="manageFeatures")

        # Get options
        task_id = self.request.params.get("task_id")

        # Apply the change (tracking progress if requested)
        try:
            with self.dd_for_task(task_id) as dd:
                feature_rec = dd.featureTypeRec(datasource, feature_type, error_if_none=True)

                if datasource == "myworld":
                    dd.emptyFeatureTable(feature_type)

                dd.dropFeatureType(feature_rec)

        except MywError as e:
            if self.log_level > 3:
                traceback.print_exc()
            mywAbort(e.msg)

        except Exception as e:
            traceback.print_exc()
            mywAbort("Internal error: " + str(e))

        Session.commit()

        return {"name": feature_type}

    @contextmanager
    def dd_for_task(self, task_id=None, progress_level=5):
        """
        Context manager yielding data dictionary engine for update operations

        Optional TASK_ID (a string) is a key against which progress will be tracked"""

        # If progress monitoring requested .. create progress handler (writes to table 'myw.configruation_task')
        # ENH: Avoid having to create new MywDD just to set the progress handler
        if task_id:
            progress = MywControllerProgressHandler(progress_level, task_id, Session.bind)
            dd = MywDD(Session, progress=progress)
        else:
            progress = None
            dd = self.dd

        # Do the operation
        try:
            yield dd

        # Tidy up the task record
        finally:
            if progress:
                progress.cleanup()

    @view_config(route_name="myw_dd_feature_controller.count", request_method="GET")
    def count(self):
        """
        Returns the number of records for FEATURE_TYPE
        """
        # Provided to avoid auth issues in config pages. DATASOURCE is ignored
        datasource = self.request.matchdict["datasource"]
        feature_type = self.request.matchdict["feature_type"]

        self.current_user.assertAuthorized(self.request, right="manageFeatures")

        limit = self.request.params.get("limit")

        model = self.dd.featureModel(feature_type)  # ENH: Should include all delta too?

        count = Session.query(model).limit(limit).count()

        self.request.response.text = str(count)
        return self.request.response

    @view_config(
        route_name="myw_dd_feature_controller.check_filter", request_method="GET", renderer="json"
    )
    def check_filter(self):
        """
        Tests that the query in parameter FILTER is valid
        """

        from sqlalchemy.exc import SQLAlchemyError

        datasource = self.request.matchdict["datasource"]
        feature_type = self.request.matchdict["feature_type"]

        self.current_user.assertAuthorized(self.request, right="manageFeatureConfig")

        filter_str = self.request.params["filter"]

        # Get SQLAlchemy object for accessing table
        model = self.dd.featureModel(feature_type)

        # Test the filter
        result = "ok"
        try:
            # Check the syntax
            pred = MywFilterParser(filter_str).parse()

            # Check the fields exist
            filter = pred.sqaFilter(model.__table__)

            # Check for type conversion errors etc
            Session.query(model).filter(filter).limit(1).first()

        except MywError as cond:
            result = str(cond)

        except SQLAlchemyError as cond:
            result = str(cond).splitlines()[0]
            result = result.replace("(ProgrammingError) ", "")  # ENH: use a regex

        return {"result": result}

    @view_config(
        route_name="myw_dd_feature_controller.import_feature", request_method="PUT", renderer="json"
    )
    def import_feature(self):
        """
        Import / update a feature definition from an external data source

        Returns"""
        datasource = self.request.matchdict["datasource"]
        feature_type = self.request.matchdict["feature_type"]

        self.current_user.assertAuthorized(self.request, right="manageFeatures")

        # Get parameters
        task_id = self.request.params.get("task_id")

        # Get datasource engine
        # ENH: EXTDD: Check for no engine
        ds_rec = Session.query(MywDatasource).get(datasource)
        if not ds_rec:
            raise exc.HTTPNotFound()

        ds_engine = ds_rec.engine(user_agent=self.request.headers.get("User-Agent"))

        # Import definition
        with self.dd_for_task(task_id, 4) as dd:

            # Do the import
            try:
                ds_engine = ds_rec.engine(
                    user_agent=self.request.headers.get("User-Agent"), progress=dd.progress
                )

                ds_rec.importFeatureType(dd, feature_type, ds_engine)

            except MywError as cond:
                print(cond)
                mywAbort(cond.msg)

            # Get warnings raise
            # ENH: Find a cleaner / safer way e.g. return stats from importFeatureType()
            if hasattr(dd.progress, "warnings"):
                warnings = dd.progress.warnings()
            else:
                warnings = []

        Session.commit()

        return {"warnings": warnings}

    @view_config(
        route_name="myw_dd_feature_controller.import_dd", request_method="PUT", renderer="json"
    )
    def import_dd(self):
        """
        Import / update feature definitions from an external data source

        Returns info on changes made (a dict of lists, keyed by feature type)"""
        datasource = self.request.matchdict["datasource"]

        self.current_user.assertAuthorized(self.request, right="manageFeatures")

        # Get parameters
        task_id = self.request.params.get("task_id")
        options = simplejson.loads(self.request.body)
        feature_types = options.get("feature_types")

        # Get datasource
        ds_rec = Session.query(MywDatasource).get(datasource)
        if not ds_rec:
            raise exc.HTTPNotFound()

        # Import feature types (recording progress in task record)
        changes = {}
        with self.dd_for_task(task_id, 4) as dd:

            try:
                # Get engine
                ds_engine = ds_rec.engine(
                    user_agent=self.request.headers.get("User-Agent"),
                    error_if_none=True,
                    progress=dd.progress,
                )

                # Deal with defaults
                if feature_types == None:
                    feature_types = ds_engine.feature_types()

            except Exception as cond:  # ENH: EXTDD: Map invalid URN etc to MywError in engine
                mywAbort(cond)

            # Import feature definitions
            for feature_type in feature_types:

                try:
                    change_type = ds_rec.importFeatureType(dd, feature_type, ds_engine)
                    change_info = [change_type]

                except MywError as cond:
                    dd.progress("error", feature_type, ":", cond)
                    change_info = ["error", str(cond)]

                changes[feature_type] = change_info

            Session.commit()

        return changes
