################################################################################
# Controller for patches and module versions
################################################################################
# Copyright: IQGeo Limited 2010-2023

from pyramid.view import view_config

from myworldapp.core.server.controllers.base.myw_controller import MywController
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.system.myw_code_manager import MywCodeManager


class MywModuleController(MywController):
    """
    Controller for accessing myw.version_stamp
    """

    @view_config(route_name="myw_module_controller.index", request_method="GET", renderer="json")
    def index(self):
        """
        return all records
        """
        self.current_user.assertAuthorized(self.request)

        code_manager = MywCodeManager(MywProduct())

        return code_manager.get_module_info()
