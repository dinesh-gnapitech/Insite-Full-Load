# Copyright: IQGeo Limited 2010-2023

import os
from pyramid.view import view_config
import pyramid.httpexceptions as exc
from pyramid.response import FileResponse

from myworldapp.core.server.base.system.myw_product import MywProduct

# Singleton for building paths
product_mgr = MywProduct()


class FileController:
    """
    Controller for accessing module resources
    """

    def __init__(self, request):
        self.request = request

    @view_config(route_name="file.serve", request_method="GET")
    def serve(self):
        """
        Returns file FILE_ID from public directory of MODULE
        """
        module = self.request.matchdict["module"]
        file_id = self.request.matchdict["file_id"]
        file_id = os.path.join(*file_id)

        # Build path to file
        module_public_dir = os.path.join(product_mgr.modules_dir, module, "public")
        path = os.path.abspath(os.path.join(module_public_dir, file_id))

        # Prevent access to files outside of the module's public directory
        # Not strictly necessary since Apache flattens paths .. but best to be safe
        if os.path.commonprefix([module_public_dir, path]) != module_public_dir:
            raise exc.HTTPNotFound()  # Could use 403 but this is more secure

        # Check for doesn't exist
        if not os.path.exists(path):
            raise exc.HTTPNotFound()

        return FileResponse(path)

    @view_config(route_name="file.serve_doc", request_method="GET")
    def serve_doc(self):
        """
        Get a file from the documentation tree, handling backstop language
        """
        file_id = self.request.matchdict["file_id"]
        file_id = os.path.join(*file_id)
        lang = self.request.params.get("lang", "en")

        # Build path to file
        doc_dir = os.path.join(product_mgr.root_dir, "Doc")
        path = os.path.abspath(os.path.join(doc_dir, lang, file_id))

        # If not found, try backstop language
        if not os.path.exists(path):
            lang = "en"
            path = os.path.abspath(os.path.join(doc_dir, lang, file_id))

        # Redirect to it
        # Note: Redirect is necessary because documentation internal links do not preserve lang param
        raise exc.HTTPFound(
            "{}/{}/{}/{}".format(self.request.application_url, "doc_file", lang, file_id)
        )

    @view_config(route_name="file.serve_doc_for", request_method="GET")
    def serve_doc_for(self):
        """
        Get a file from the LANG documentation tree
        """
        file_id = self.request.matchdict["file_id"]
        file_id = os.path.join(*file_id)
        lang = self.request.matchdict["lang"]

        # Build path to file
        doc_dir = os.path.join(product_mgr.root_dir, "Doc")
        path = os.path.abspath(os.path.join(doc_dir, lang, file_id))

        # Prevent access to files outside of the doc tree
        # This is necessary since lang could be used to smuggle in the change of root
        if os.path.commonprefix([doc_dir, path]) != doc_dir:
            raise exc.HTTPNotFound()  # Could use 403 but this is more secure

        # Check for not found
        if not os.path.exists(path):
            raise exc.HTTPNotFound()

        # Return it
        return FileResponse(path)
