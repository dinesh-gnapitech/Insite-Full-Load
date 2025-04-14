################################################################################
# Controller for search requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import difflib
from collections import OrderedDict
from sqlalchemy import literal
from sqlalchemy.sql import and_, or_, exists
from pyramid.view import view_config

from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.core.myw_error import MywDbQueryTimeOutError
from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.dd.myw_reference import MywReference

from myworldapp.core.server.models.myw_bookmark import MywBookmark
from myworldapp.core.server.models.myw_query import MywQuery
from myworldapp.core.server.models.myw_search_string import MywSearchString
from myworldapp.core.server.models.myw_delta_search_string import MywDeltaSearchString

from myworldapp.core.server.controllers.base.myw_feature_collection import MywFeatureCollection
from myworldapp.core.server.controllers.base.myw_utils import featuresFromRecs


from myworldapp.core.server.controllers.base.myw_controller import MywController
import myworldapp.core.server.controllers.base.myw_globals as myw_globals


class MywSearchController(MywController):
    """
    Controller for Search requests
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        MywController.__init__(self, request)

        self.db = myw_globals.db
        self.dd = myw_globals.dd

        settings = request.registry.settings
        options = settings.get("myw.search.options", {})
        self.min_term_length = options.get("min_term_length", None)
        self.min_term_length_digits = options.get("min_term_length_digits", None)
        self.timeout = options.get("timeout", None)

        trace_level = options.get("log_level", 0)
        self.progress = MywSimpleProgressHandler(trace_level, "INFO: SEARCH: ")

    @view_config(route_name="myw_search_controller.index", renderer="json")
    def index(self):
        """
        Return all suggestions matching 'term'
        """

        self.current_user.assertAuthorized(self.request)

        # Extract common parameters, build list of accessible feature types
        self.unpickParams(self.request, default_limit=10)

        # Extract search terms (which may be just strings or a query name)
        terms = self.removeSpatialQualifier(self.search_string).split()

        # Get query suggestions
        suggestions = self.querySuggestions(terms, self.feature_types, self.lang)

        # If the search string included "in ..." return only query suggestions
        if self.in_selection != self.in_window:
            return {"suggestions": suggestions}

        # Add bookmark suggestions
        suggestions += self.bookmarkSuggestions(terms, self.current_user.name())

        # Add feature suggestions
        suggestions += self.featureSuggestions(
            self.feature_types, self.delta, self.search_string, terms, self.lang
        )

        self.progress(2, "RETURNING", len(suggestions))

        return {"suggestions": suggestions}

    @view_config(route_name="myw_search_controller.features", renderer="json")
    def features(self):
        """
        Return all features matching 'term'
        """

        self.current_user.assertAuthorized(self.request)

        # Extract common parameters, build list of accessible feature types
        self.unpickParams(self.request, default_limit=200)

        # Extract terms
        terms = self.search_string.split()

        # Get feature suggestions
        suggestions = self.featureSuggestions(
            self.feature_types, self.delta, self.search_string, terms, self.lang
        )

        # Convert to feature references
        # ENH: Pass refs back directly
        refs = []
        for suggestion in suggestions:
            refs.append(suggestion["data"]["urn"])

        # Get feature records
        db_view = self.db.view(self.delta)
        recs = db_view.getRecs(refs)

        # Convert to feature collection
        features = featuresFromRecs(
            recs,
            sorter=self._alphabeticalSorter("title", "myw"),
            include_display_values=True,
            include_lobs=False,
            include_geo_geometry=True,
        )

        self.progress(2, "RETURNING", len(features))

        return MywFeatureCollection(features)

    def unpickParams(self, request, default_limit=None):
        """
        Extract values from request parameters PARAMS into self's slots
        """

        self.application_name = self.get_param(request, "application", mandatory=True)
        self.search_string = self.get_param(request, "term", mandatory=True)
        self.delta = self.get_param(request, "delta")
        self.limit = self.get_param(request, "limit", type=int, default=default_limit)
        self.timeout = self.get_param(request, "timeout", type=int, default=self.timeout)
        lang = self.get_param(request, "lang", default=self.dd.default_language)
        svars = self.get_param(request, "svars", type="json", default={})

        self.progress(1, self.application_name, ":", self.search_string)

        # Build list of accessible feature types
        self.feature_types = self.current_user.featureTypes("myworld", self.application_name)

        # Build full list of session vars
        self.session_vars = self.current_user.sessionVars(
            application=self.application_name, **svars
        )

        # Determine what language identifier to use for this request
        self.lang = self._getLanguageFor(lang)

    def removeSpatialQualifier(self, search_string):
        """
        Strip the "in selection" or "in window" clause from SEARCH_STRING (if present)

        Sets the following slots:
          self.in_window
          self.in_selection
          self.is_spatial"""

        # ENH: Get rid of the slots (just return a string indicating the query type)

        # Set defaults
        self.in_window = False
        self.in_selection = False
        self.is_spatial = False

        search_string = " ".join(search_string.split())  # removes extra whitespace
        index = search_string.find(" in")

        if (
            index > 1
        ):  # require an initial term of at least two characters before idenfifying as a query
            in_clause = search_string[index:]

            # Check for partial in window / in selection query
            # ENH: Clearer with regex
            self.in_window = in_clause in " in window"
            self.in_selection = in_clause in " in selection"
            self.is_spatial = self.in_window or self.in_selection

            # exclude the "in ..." from the search terms
            # we keep it if the statement is just "in" (in that situation both in_selection and in_window are True) as it could
            # be part of a an actual search term, but we then exclude when getting the query suggestions
            if self.in_selection != self.in_window:
                search_string = search_string.replace(in_clause, "")

        return search_string

    def querySuggestions(self, terms, feature_types, lang):
        """
        Query related suggestions for the given terms
        """
        suggestions = []
        query_filter = None

        # add each term to the query with an AND operator
        for term in terms:
            if term == "in":
                continue

            if query_filter is None:
                query_filter = MywQuery.myw_search_val1.like("%" + term + "%")
            else:
                query_filter = and_(query_filter, MywQuery.myw_search_val1.like("%" + term + "%"))

        recs = (
            Session.query(MywQuery)
            .filter(MywQuery.datasource_name == "myworld")
            .filter(query_filter)
            .filter(MywQuery.myw_object_type.in_(feature_types))
            .filter(MywQuery.lang == lang)
            .limit(self.limit)
            .all()
        )

        for row in sorted(recs, key=self._similaritySorter(terms, "myw_search_desc1")):
            if not self.is_spatial or self.in_window:
                suggestions.append(self._queryAsSuggestion(row, "window"))
            if not self.is_spatial or self.in_selection:
                suggestions.append(self._queryAsSuggestion(row, "selection"))
            if not self.is_spatial:
                suggestions.append(self._queryAsSuggestion(row))

        return suggestions

    def _queryAsSuggestion(self, query_rec, spatial_restriction=None):
        """
        Obtains a suggestion object to match to QUERY_REC
        """

        if spatial_restriction:
            valueSuffix = " in " + spatial_restriction
        else:
            valueSuffix = ""

        return {
            "label": query_rec.myw_search_desc1,
            "value": query_rec.myw_search_val1 + valueSuffix,
            "data": {
                "type": "query",
                "id": query_rec.id,
                "feature_type": query_rec.myw_object_type,
                "filter": query_rec.attrib_query,
                "spatial_restriction": spatial_restriction,
            },
        }

    def bookmarkSuggestions(self, terms, username):
        """
        Bookmark related suggestions for the given terms
        """
        suggestions = []
        bookmark_filter = None

        # add each term to the query with an AND operator
        for term in terms:
            if bookmark_filter is None:
                bookmark_filter = MywBookmark.myw_search_val1.like("%" + term + "%")
            else:
                bookmark_filter = and_(
                    bookmark_filter, MywBookmark.myw_search_val1.like("%" + term + "%")
                )

        if username:
            # A username was provided so also get the bookmark records associated with that username.
            bookmark_filter = and_(
                bookmark_filter,
                or_(MywBookmark.username == username, MywBookmark.is_private == False),
            )
        else:
            # A username was not provided so get all of the non-private bookmarks.
            bookmark_filter = and_(bookmark_filter, MywBookmark.is_private == False)

        recs = Session.query(MywBookmark).filter(bookmark_filter).limit(self.limit).all()

        for row in sorted(recs, key=self._similaritySorter(terms, "myw_search_desc1")):
            if row.is_private == False:
                label = row.myw_search_desc1 + " (" + row.username + ")"
            else:
                label = row.myw_search_desc1

            suggestions.append(
                {
                    "label": label,
                    "value": row.myw_search_val1,
                    "data": {"type": "bookmark", "id": row.id},
                }
            )

        return suggestions

    def featureSuggestions(self, feature_types, delta, search_string, terms, lang):
        """
        Return feature suggestions that match TERMS

        A feature suggestion corresponds to a record in the myw.search_string table
        Excludes duplicate suggestions from results (same feature and search_desc)

        Results are ordered
        """

        self.progress(
            3,
            "Finding feature suggestions for:",
            search_string,
            ":",
            len(feature_types),
            "feature types",
        )
        self.progress(10, "Searching feature types:", feature_types)

        sorter = self._alphabeticalSorter("search_desc")

        suggestions = []
        for group, recs in list(
            self.indexRecs(feature_types, delta, search_string, terms, lang, self.limit).items()
        ):

            for rec in sorted(recs, key=sorter):

                ref = MywReference("myworld", rec.feature_name, rec.feature_id)

                suggestions.append(
                    {
                        "label": rec.search_desc,
                        "value": rec.search_val,
                        "data": {"type": "feature", "urn": ref},
                    }
                )

        return suggestions

    def indexRecs(self, feature_types, delta, search_string, terms, lang, limit):
        """
        Find the search_string index records matching TERMS

        Returns a list of lists of records, keyed by search group"""

        results = OrderedDict()

        # Find index records
        try:
            with Session.myw_db_driver.statementTimeout(self.timeout):

                # For each index record ...
                for group, rec in self.indexRecsFor(
                    feature_types, delta, search_string, terms, lang, limit
                ):

                    # Add to result
                    if not group in results:
                        results[group] = []
                    results[group].append(rec)

        except MywDbQueryTimeOutError as cond:
            self.progress("warning", cond, ":", "Search was:", self.search_string)
            return {}  # Return nothing (less confusing than partial result)

        return results

    def indexRecsFor(self, feature_types, delta, search_string, terms, lang, limit):
        """
        Yields feature suggestion index records matching TERMS, excluding duplicates

        Yields:
          GROUP  Result group
          REC    Indes record
        """
        # Formulated as iterator to allow interrupt when limit is reached

        found_items = set()

        for group, query in self.indexFiltersFor(feature_types, delta, search_string, terms, lang):

            for rec in query.limit(limit * 2):  # Note: Limit is just a hint for the optimiser
                self.progress(
                    7,
                    "Matched",
                    group,
                    ":",
                    rec.__table__.name,
                    rec.feature_name,
                    rec.feature_id,
                    ":",
                    rec.search_desc,
                )

                # Check for duplicates
                key = (rec.feature_name, rec.feature_id, rec.search_desc)
                if key in found_items:
                    self.progress(9, "Duplicate")
                    continue
                found_items.add(key)

                # Yield record
                yield group, rec

                # Check for enough found
                if len(found_items) >= limit:
                    self.progress(7, "Limit reached:", limit)
                    return

    def indexFiltersFor(self, feature_types, delta, search_string, terms, lang):
        """
        Yields feature suggestion queries for TERMS

        Yields:
          GROUP  Result group
          QUERY  SQALchemy quiery yielding index records"""

        # Yields deltas before master in case limit is hit

        # Just for clarity
        master_model = MywSearchString
        delta_model = MywDeltaSearchString

        # Build base queries
        master_ft_filter = self.featureTypeFilterFor(master_model, feature_types, lang)
        master_recs = Session.query(master_model).filter(master_ft_filter)

        if delta:
            shadowed = exists().where(
                (delta_model.delta == delta)
                & (delta_model.feature_name == master_model.feature_name)
                & (delta_model.feature_id == master_model.feature_id)
            )

            delta_ft_filter = self.featureTypeFilterFor(delta_model, feature_types, lang)

            delta_recs = Session.query(delta_model).filter(
                delta_ft_filter
                & (delta_model.delta == delta)
                & (delta_model.change_type != "delete")
            )

        # Full string match
        group = "exact"
        master_query = master_recs.filter(master_model.search_val == search_string)

        if delta:
            master_query = master_query.filter(~shadowed)
            delta_query = delta_recs.filter(delta_model.search_val == search_string)
            yield group, delta_query

        yield group, master_query

        # 'Starts with' match
        group = "starts_with"
        like_str = search_string + "%"
        master_query = master_recs.filter(master_model.search_val.like(like_str))

        if delta:
            master_query = master_query.filter(~shadowed)
            delta_query = delta_recs.filter(delta_model.search_val.like(like_str))
            yield group, delta_query

        yield "starts_with", master_query

        # Term matches
        if len(terms) > 1:

            group = "terms"
            master_query = master_recs.filter(self.multiTermFilterFor(master_model, terms))

            if delta:
                master_query = master_query.filter(~shadowed)
                delta_query = delta_recs.filter(self.multiTermFilterFor(delta_model, terms))
                yield group, delta_query

            yield group, master_query

    def featureTypeFilterFor(self, model, feature_types, lang):
        """
        Build SQLAlchemy filter to self the search string records for FEATURE_TYPES

        Returns a SQAlchemy predicate"""

        pred = literal(False)

        feature_defs = self.current_user.featureTypeDefs(self.application_name)
        unfiltered_ids = []

        # Add a clause for each filtered feature type
        for feature_type in feature_types:
            feature_def = feature_defs[("myworld", feature_type)]

            if feature_def["unfiltered"]:
                unfiltered_ids += feature_def["search_rule_ids"].get(lang, [])
            else:
                pred = pred | self.authFilterFor(
                    model, feature_type, feature_def, self.session_vars, lang
                )

        # Add clause for unflitered feature types
        if unfiltered_ids:
            pred = pred | model.search_rule_id.in_(unfiltered_ids)

        return pred

    def authFilterFor(self, model, feature_type, feature_def, session_vars, lang):
        """
        Build SQLAlchemy filter to select index records for FEATURE_DEF

        Returns a SQAlchemy predicate"""

        pred = literal(False)

        feature_model = self.dd.featureModel(
            feature_type, "data"
        )  # ENH: Ideally would know schema ... but this is safe

        # Add clause for each filter
        # ENH: Consolidate into single predicate (?in config_cache)
        for filter_myw_pred in list(feature_def["filter_preds"].values()):
            ftr_pred = model.search_rule_id.in_(feature_def["search_rule_ids"].get(lang, []))

            filter_pred = filter_myw_pred.sqaFilter(
                feature_model.__table__,
                model.__table__,
                feature_def["filter_ir_map"],
                variables=session_vars,
            )
            pred = pred | (ftr_pred & filter_pred)

        return pred

    def multiTermFilterFor(self, model, terms):
        """
        Returns a predicate finding index records from MODEL that match TERMS

        A match occurs when:
        - one term matches the beginning of search_val AND
        - all others match somewhere in extra_value
        """

        filter = literal(False)

        for term in terms:

            if self._is_too_short(term):  # Prevents huge number of matches on very small terms
                self.progress(6, "SKIPPING TERM", term)
                continue

            clause = model.search_val.like(term + "%")

            for extra_term in terms:
                if extra_term != term:
                    clause &= model.extra_values.like("%" + extra_term + "%")

            filter |= clause

        return filter

    def _is_too_short(self, term):
        """
        True if TERM is too short to be used within a search

        Compares with configured limits for numeric and non-numeric cvalues"""

        if self.min_term_length:

            if len(term) < self.min_term_length:
                return True

            if term.isdigit() and (len(term) < self.min_term_length_digits):
                return True

        return False

    def _similaritySorter(self, terms, property_name):
        """
        Returns a lambda which calculates how similar two object are

        The record is compared by accessing its PROPERTY_NAME, which should be a string.
        Values will range from -1 (identical) to 0 (no similarity)
        """
        terms_str = " ".join(terms)
        return lambda rec: -difflib.SequenceMatcher(a=terms_str, b=rec[property_name]).ratio()

    def _alphabeticalSorter(self, property_name, group=None):
        """
        Function for use in sorting records based on PROPERTY_NAME

        Returns a function lambda(rec) that splits rec[PROPRERTY_NAME] into alpha and numerical elements (separated by spaces)
        """
        # ENH: Better to use a regexp to find runs of alpha and numeric

        def safe_float(word):
            try:
                # Check that this is a float first, then return as a zero padded string
                float(word)
                if "." in word:
                    parts = word.split(".")
                    return f"{parts[0].zfill(20)}.{parts[1]}"
                else:
                    return word.zfill(20)
            except Exception:
                return word

        return lambda rec: [
            safe_float(word)
            for word in (rec[group][property_name] if group else rec[property_name])
            .lower()
            .split(" ")
        ]

    def _getLanguageFor(self, lang):
        """
        Given a request's user language returns what language identifier to use when searching the database
        """
        if not lang in self.dd.languages:
            lang = lang.split("-")[0]
            if not lang in self.dd.languages:
                # language is not one of the configured languages, use default language
                lang = self.dd.default_language
        return lang
