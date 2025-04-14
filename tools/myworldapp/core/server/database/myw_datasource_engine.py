################################################################################
# Superclass for External Datasource implementations
################################################################################
# Copyright: IQGeo Limited 2010-2023

from abc import ABC, abstractmethod
import warnings
from collections import OrderedDict
from fnmatch import fnmatchcase

import requests
from urllib.error import HTTPError
from requests.exceptions import RequestException
from urllib3.exceptions import InsecureRequestWarning

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError

# Suppress info messages from requests package
import logging

logging.getLogger("requests").setLevel(logging.WARNING)


class MywDatasourceEngine(ABC):
    """
    Engine for communicating with an external data server

    Subclasses must implement:
       properties()
       all_feature_type_infos()
       get_feature_type_def(feature_type)
       get_feature_data(feature_type,bounds=None,geom_name=None)

    The may also override:
       services()"""

    def __init__(self, base_url, username=None, password=None, user_agent=None, progress=None):
        """
        Init slots of self

        BASE_URL is the URL of the datasource
        PROGRES_PROC(level,*msg) is a callback for progress messages
        Optional USER_AGENT is the client user agent that origininated
        the request (for avoiding cross-origin issues)"""

        self.base_url = base_url
        self.username = username
        self.password = password
        self._user_agent = user_agent
        self.progress = progress or MywProgressHandler()
        self._session = None  # Init lazily

    @property
    def session(self):
        """
        Requests session for communicating with the external server (init lazily)
        """

        if not self._session:
            self._session = requests.session()

        return self._session

    def services(self):
        """
        Services supported by self's server (a dict, keyed by service name)
        """
        # Backstop returns empty dict

        return {}

    def _find_service(self, services, name):
        """
        Gets service NAME from capabilities document SERVICES

        Raises MywError if not found"""
        # ENH: Get rid of this?

        service = services.get(name)

        if not service:
            raise MywError("Server does not support service:", name)

        return service

    def feature_types(self, name_spec="*"):
        """
        Names of feature types in self's server (in sorted order)
        """

        names = []

        # Case: Wildcards
        if "*" in name_spec or "?" in name_spec:

            for name in sorted(self.all_feature_type_infos().keys()):
                if fnmatchcase(name, name_spec):
                    names.append(name)

        # Case: No wildcard
        else:
            feature_type = name_spec
            if self.feature_type_info_for(feature_type, False):
                names.append(feature_type)

        return names

    def feature_type_info_for(self, feature_type, error_if_none=True):
        """
        Short info for feature_type (if it exists)
        """

        info = self.all_feature_type_infos().get(feature_type)

        if error_if_none and not info:
            raise MywError("Feature type not found:", feature_type)

        return info

    def external_name_for(self, name):
        """
        Construct a nice external name from raw name NAME
        """

        return name.title().replace("_", " ")

    def normalise_feature_data(self, raw_recs):
        """
        Convert RAW_RECS to a form suitable for dumping as CSV

        As read, one "record" may not contain the same subset of properties as the next
        so the records may be sparse. To write a CSV file, we need to flesh out the data so
        there is an element for every property in every record. Note that this still may not
        be the complete set of properties for the feature type, only the union of the set
        properties for the features selected

        Also fixes up dates"""
        # ENH: EXTDD: Replace by a 'external record' object .. and/or fix to csv dumper

        # Build list of properties over all records
        props = set()
        for raw_rec in raw_recs:
            for prop in list(raw_rec.keys()):
                props.add(prop)

        # Get in repeatable order, to keep tests clean
        props = sorted(props)

        # Build list of fully populated records
        recs = []
        for raw_rec in raw_recs:

            # Construct fully populated rec
            rec = OrderedDict()
            for prop in props:
                rec[prop] = raw_rec.get(prop)

            recs.append(rec)

        return recs

    # ==============================================================================
    #                                 ABSTRACT METHODS
    # ==============================================================================

    @abstractmethod
    def properties(self, full=False):
        raise NotImplementedError()

    @abstractmethod
    def all_feature_type_infos(self):
        raise NotImplementedError()

    @abstractmethod
    def get_feature_type_def(self, feature_type, force=False):
        raise NotImplementedError()

    @abstractmethod
    def get_feature_data(
        self, feature_type, bounds=None, geom_name=None, geom_format="", limit=None
    ):
        raise NotImplementedError()

    # ==============================================================================
    #                                 REQUEST HELPERS
    # ==============================================================================

    def send_get_request(self, url, **params):
        """
        Make a GET request to URL

        Returns body of response"""

        return self._send_request("get", url, params)

    def send_post_request(self, url, params=None, data=None, content_type=None):
        """
        Make a POST request to URL with DATA data

        Returns body of response"""

        return self._send_request("post", url, params=params, data=data, content_type=content_type)

    def _send_request(self, req_type, url, params=None, data=None, content_type=None):
        """
        Make a request to URL with parameters PARAMS (and check result)

        Returns response content (or raises MywError)"""

        headers = {}
        if self._user_agent:
            headers["User-Agent"] = self._user_agent
        if content_type:
            headers["Content-Type"] = content_type

        self.progress(8, "Sending request:", self._log_string_for(url, params), headers)

        # Send request (and check response)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", InsecureRequestWarning)

            try:
                if req_type == "get":
                    resp = self.session.get(url, params=params, headers=headers)

                elif req_type == "post":
                    resp = self.session.post(url, params=params, data=data, headers=headers)

                else:
                    raise MywInternalError("Bad request type:", req_type)

                if not resp.status_code == requests.codes.ok:  # pylint: disable=no-member
                    resp.raise_for_status()

            except RequestException as cond:
                raise MywError("Request failed:", str(cond))

            except HTTPError as cond:
                raise MywError("Request failed:", url, "error=", str(cond))

        # Return response content
        data = resp.content
        self.progress(12, "Got response:", data)

        return data

    def _log_string_for(self, url, params):
        """
        Constructs url in form suitable for cut-and-paste to browser (for logging purposed only)

        Does not do encoding etc"""
        # ENH: Get this from requests liv

        if "?" in url:
            sep = "&"
        else:
            sep = "?"

        if params is None:
            return url
        elif isinstance(params, str):
            url += "{}={}".format(sep, params)
        else:
            for name, val in list(params.items()):
                url += "{}{}={}".format(sep, name, val)
                sep = "&"

        return url
