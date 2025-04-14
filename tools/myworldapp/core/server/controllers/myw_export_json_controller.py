################################################################################
# Controller for creating JSON exports
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json, datetime
from pyramid.view import view_config

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywExportJsonController(MywController):
    """
    Controller for creating GeoJSON exports
    """

    @view_config(route_name="myw_export_json_controller.generate", request_method="POST")
    def generate(self):
        """
        Write features to json file
        """

        # check request is authorized or not
        self.current_user.assertAuthorized(self.request)

        # get data from the request
        data = json.loads(self.request.body)

        fileName, content = self.writeJSONFile("myw", data)

        # return file name
        self.request.response.content_type = "text/plain"
        self.request.response.content_disposition = 'attachment; filename="' + fileName + '"'
        self.request.response.text = content
        return self.request.response

    def writeJSONFile(self, objName, data):
        """
        Genarates a single JSON file
        """

        # temp file name with current date and time
        tempFileName = (
            objName + "_report_" + datetime.datetime.today().strftime("%b-%d-%Y_%H-%M-%S") + ".json"
        )
        content = json.dumps(data, indent=4, sort_keys=True, ensure_ascii=False)

        # return filename and filepath
        return tempFileName, content
