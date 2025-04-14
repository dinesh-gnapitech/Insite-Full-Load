################################################################################
# Controller returning info about the current user
################################################################################
# Copyright: IQGeo Limited 2010-2023

from collections import OrderedDict
from pyramid.view import view_config


from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywCurrentUserController(MywController):
    """
    Controller returning info about the current user

    User may not have a corresponding record in myw.user e.g. LDAP user. Info comes
    from config cache or user properties tables (application state etc)"""

    @view_config(
        route_name="myw_current_user_controller.get_name", request_method="GET", renderer="json"
    )
    def get_name(self):
        """
        return username for current user
        """

        self.current_user.assertAuthorized(self.request)

        return {"name": self.current_user.name()}

    @view_config(
        route_name="myw_current_user_controller.get_roles", request_method="GET", renderer="json"
    )
    def get_roles(self):
        """
        return roles for current user

        Returns a list of the myWorld roles names granted to the current user"""

        self.current_user.assertAuthorized(self.request)

        return {"roles": self.current_user.roleNames()}

    @view_config(
        route_name="myw_current_user_controller.get_rights", request_method="GET", renderer="json"
    )
    def get_rights(self):
        """
        return rights for current user

        Returns a JSON with key 'rights' that contains a list of dicts, keyed by application name.
        Each dict has keys which are right names, and values which are either True, or a dict
        with name and restrictions."""

        # ENH: Return something more sensible

        self.current_user.assertAuthorized(self.request)

        all_rights = OrderedDict()

        for app_name in self.current_user.applicationNames():
            app_rights = {}
            for permission in self.current_user.rights(app_name):
                name = permission["name"]
                restrictions = permission["restrictions"]
                app_rights[name] = True if restrictions is None else {"restrictions": restrictions}

            all_rights[app_name] = app_rights

        return {"rights": all_rights}
