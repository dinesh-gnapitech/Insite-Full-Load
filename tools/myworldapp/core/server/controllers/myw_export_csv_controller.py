################################################################################
# Controller for creating CSV exports
################################################################################
# Copyright: IQGeo Limited 2010-2023

import csv, json, datetime, zipfile, urllib.request, urllib.parse, urllib.error, codecs, io
from pyramid.view import view_config

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywExportCsvController(MywController):
    """
    Controller for creating CSV exports
    """

    @view_config(route_name="myw_export_csv_controller.generate", request_method="POST")
    def generate(self):
        """
        Write features to csv file
        """
        encoding = self.request.params.get("encoding")
        # check request is authorized or not
        self.current_user.assertAuthorized(self.request)

        # get data from the request
        data = json.loads(
            urllib.parse.unquote(self.request.body.decode("utf-8"))
        )  # Added decoding since IE8 escapes the stringified json
        results = data["results"]

        # check for objects size
        if len(results) == 1:
            # Got one type of collection. so create a single report
            objectName = list(results.keys())[0]
            fileName, content = self.writeCSVFile(encoding, objectName, results[objectName])
            self.request.response.content_type = "text/csv"
            self.request.response.content_disposition = 'attachment; filename="' + fileName + '"'
            self.request.response.body = content
        else:
            # got so many collections. so generate separate file for each collection and zip them
            fileName = "Report_" + datetime.datetime.today().strftime("%b-%d-%Y_%H-%M-%S") + ".zip"
            with io.BytesIO() as fileLike:
                with zipfile.ZipFile(fileLike, "w", zipfile.ZIP_DEFLATED) as zf:
                    for key, value in results.items():
                        innerFileName, content = self.writeCSVFile(encoding, key, value)
                        zf.writestr(innerFileName, content, zipfile.ZIP_DEFLATED)

                self.request.response.content_type = "application/octet-stream"
                self.request.response.content_disposition = (
                    'attachment; filename="' + fileName + '"'
                )
                self.request.response.body = fileLike.getvalue()

        return self.request.response

    def _sanitizeNameForFile(self, name):
        """
        Returns a string based on NAME which will be safe to be included
        as part of a file or path name.
        """
        return "".join(c for c in name if c.isalnum() or c == "_")

    def _sanitizeEncoding(self, encoding):
        """
        Just like the python codecs internals, we check for specific encodings in all lower
        case, with underscores not hyphens.
        """
        return encoding.lower().replace("-", "_")

    def writeCSVFile(self, encoding, objName, data):
        """
        Generates a single CSV file
        """
        strm = io.StringIO()

        # sanitize objName before building a filename from it
        objName = self._sanitizeNameForFile(objName)

        # temp file name with current date and time
        tempFileName = (
            objName + "_report_" + datetime.datetime.today().strftime("%b-%d-%Y_%H-%M-%S") + ".csv"
        )

        # open file for writing
        with io.BytesIO() as f:
            if self._sanitizeEncoding(encoding) == "utf_8":
                # Write the BOM (optional in the standard) to the start of the file, for Excel
                f.write(codecs.BOM_UTF8)

            # Redirect output to a strm
            writer = csv.writer(strm, delimiter=",")

            # Write Headers to the csv file
            keys = sorted(data[0])
            u_keys = [element.upper() for element in keys]
            writer.writerow(u_keys)

            # Write content to the csv file
            for feature in data:
                values = []
                for a_key in keys:
                    if a_key == "myWorldLink":
                        val = '=HYPERLINK("' + urllib.parse.unquote(feature[a_key]) + '")'
                    else:
                        val = feature[a_key]
                    values.append(str(val))
                writer.writerow(values)

                # Fetch output from the strm ...
                data = strm.getvalue()

                # write to the target stream
                f.write(data.encode(encoding, errors="replace"))

                # empty strm
                strm.seek(0)
                strm.truncate(0)

            # close the file
            fileContent = f.getvalue()

        # return filename and content
        return tempFileName, fileContent
