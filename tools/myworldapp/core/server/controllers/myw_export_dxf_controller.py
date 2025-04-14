################################################################################
# Controller for creating DXF exports
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json, datetime
from pyramid.view import view_config

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywExportDxfController(MywController):
    """
    Controller for creating DXF exports
    """

    @view_config(route_name="myw_export_dxf_controller.generate", request_method="POST")
    def generate(self):
        """
        Write features to DXF file
        """

        # check request is authorized or not
        self.current_user.assertAuthorized(self.request)

        # get data from the request
        data = json.loads(self.request.body)

        fileName, content = self.writeDXFFile("myw", data)

        # return file name
        self.request.response.content_type = "text/plain"
        self.request.response.content_disposition = 'attachment; filename="' + fileName + '"'
        self.request.response.text = content
        return self.request.response

    @staticmethod
    def writeDXFFile(objName, data):
        """
        Genarates a single DXF file
        """

        from myworldapp.core.server.io.myw_dxf_exporter import DXFExporter

        # temp file name with current date and time
        tempFileName = (
            objName + "_report_" + datetime.datetime.today().strftime("%b-%d-%Y_%H-%M-%S") + ".dxf"
        )

        exporter = DXFExporter()
        return tempFileName, exporter.export(data)
