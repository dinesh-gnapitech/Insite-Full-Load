################################################################################
# Controller generating the error page
################################################################################
# Copyright: IQGeo Limited 2010-2023

from pyramid.view import exception_view_config
from pyramid.renderers import render
from pyramid.response import Response
import pyramid.httpexceptions as exc


class ErrorController:
    """
    Generates error page

    @ENH: Show traceback method properly"""

    def __init__(self, exc, request):
        self.request = request
        self.exc = exc

    @exception_view_config(exc.HTTPBadGateway)
    def bad_gateway(self):
        return exc.HTTPBadGateway(self.exc.detail)

    @exception_view_config(exc.HTTPError, is_debug=False)
    def http_non_debug(self):
        """
        Render the error document
        """
        return self._error_format(self.exc.code, self.exc.explanation)

    # @exception_view_config(Exception, is_debug=True)
    # def debug(self):
    #    return self._error_format(500, 'Internal Server Error')

    @exception_view_config(exc.HTTPError, is_debug=True)
    def http_debug(self):
        return self._error_format(self.exc.code, self.exc.explanation, self.exc.detail)

    def _error_format(self, code, explanation, stack=None):
        template_values = {"code": code, "explanation": explanation, "stack": stack}
        output = render("/error.html", template_values)
        response = Response(output)
        response.status_code = code
        return response
