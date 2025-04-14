################################################################################
# Decorator for converting to JSON
################################################################################
# Copyright: IQGeo Limited 2010-2023

# import warnings
import simplejson
from geojson.codec import PyGFPEncoder as GeoJSONEncoder
import decimal, datetime


class JsonifyError(Exception):
    pass


class MywJsonEncoder(GeoJSONEncoder):
    """
    Extended JSON encoder handling PostgreSQL types

    ENH: Upgrade to simplejson 3.3.1 and remove this"""

    def default(self, obj):
        """
        Cast OBJ to a JSON-serialisable type
        """

        if hasattr(obj, "__myw_json__"):
            return obj.__myw_json__()

        if hasattr(obj, "isoformat"):
            return obj.isoformat()

        if isinstance(obj, (decimal.Decimal, datetime.date, datetime.datetime)):
            return str(obj)

        return super(MywJsonEncoder, self).default(obj)


class MywJsonEncoderFactory:
    def __call__(self, info):
        def _render(value, system):
            request = system.get("request")
            if request is not None:
                response = request.response
                ct = response.content_type
                if ct == response.default_content_type:
                    response.content_type = "application/json"
            try:
                output = simplejson.dumps(value, cls=MywJsonEncoder, allow_nan=True)
            except ValueError:
                import json

                s = json.dumps(value)
                raise ValueError(f"value crashed encoder: {s}")

            if not output.startswith("{"):
                msg = (
                    "Function returned output which was JSON encoded as something other "
                    "than a JSON object. "
                    "JSON responses should just contain a single top level object or they may be susceptible to "
                    "cross-site data leak attacks."
                )
                raise JsonifyError(msg)

            return output

        return _render
