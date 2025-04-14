################################################################################
# Record exemplar for myw.user
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from collections import OrderedDict
from sqlalchemy import Column, Integer, Boolean
import json

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_user_role import MywUserRole
from myworldapp.core.server.models.myw_role import MywRole
from myworldapp.core.server.models.myw_bookmark import MywBookmark
from myworldapp.core.server.models.myw_application import MywApplication
from myworldapp.core.server.models.myw_application_state import MywApplicationState


class MywUser(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.user
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "user")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "user", "id", Integer, generator="sequence")
    locked_out = Column(Boolean)

    @property
    def user_role_recs(self):
        """
        Self's join records to the roles table
        """
        return Session.query(MywUserRole).filter(MywUserRole.user_id == self.id)

    @property
    def bookmark_recs(self):
        """
        Self's bookmark records
        """
        return Session.query(MywBookmark).filter(MywBookmark.username == self.username)

    @property
    def application_state_recs(self):
        """
        Self's layer list item records
        """
        return Session.query(MywApplicationState).filter(
            MywApplicationState.username == self.username
        )

    def substructure(self):
        """
        The records that depend on self
        """
        return (
            self.user_role_recs.all() + self.bookmark_recs.all() + self.application_state_recs.all()
        )

    def definition(self, for_config_page=False):
        """
        Self in serializable format
        """

        role_ids = [r.role_id for r in self.user_role_recs]

        user_def = {
            "username": self.username,
            "email": self.email,
            "locked_out": self.locked_out,
            "last_login": self.last_login,
            "session_id": self.session_id,
        }

        # ENH: Fix config pages and get rid of this
        if for_config_page:
            user_def["id"] = self.id
            user_def["roles"] = [r.role_id for r in self.user_role_recs]

        return user_def

    def role_names(self):
        """
        Names of the roles granted to selt
        """
        qry = (
            Session.query(MywUserRole, MywRole)
            .join(MywRole, MywUserRole.role_id == MywRole.id)
            .filter(MywUserRole.user_id == self.id)
        )

        roles = []
        for user_role, role in qry:
            roles.append(role.name)

        return roles

    def set_roles(self, role_recs):
        """
        Set selfs roles to be ROLE_RECS
        """

        # Delete old join records
        self.user_role_recs.delete()

        # Create new ones
        for role_rec in role_recs:
            int_rec = MywUserRole(user_id=self.id, role_id=role_rec.id)
            Session.add(int_rec)

    def application_states(self):
        """
        Returns self's application states (a dict of states, keyed by application name)

        Each state is a dict

        where optional sub_list is for items that are layer groups"""

        app_states = OrderedDict()

        for app_rec in Session.query(MywApplication).order_by(MywApplication.id):
            app_state = self.stateFor(app_rec)

            if app_state:
                app_states[app_rec.name] = app_state

        return app_states

    def stateFor(self, app_rec):
        """
        Returns self's layer list for APP_REC (if there is one)

        Returns a list of lists of the form:
           [ <layer_name>,<on>,<sub_list> ]

        where optional sub_list is for items that are layer groups"""

        # ENH: Duplicates logic with a controller

        rec = self.application_state_recs.filter(
            MywApplicationState.application_name == app_rec.name
        ).first()

        if rec:
            return json.loads(rec.state)
        else:
            return None

    def setState(self, state):
        """
        Set self's application state

        STATE is a list of application state dicts, keyed by application name
        """

        for app_name, app_state in list(state.items()):

            rec = self.application_state_recs.filter(
                MywApplicationState.application_name == app_name
            ).first()

            if not rec:
                rec = MywApplicationState(username=self.username, application_name=app_name)
                Session.add(rec)

            rec.state = json.dumps(app_state)

        Session.flush()

    def bookmarks(self):
        """
        Returns self's bookmarks (a dict of dicts, keyed by bookmark name)
        """

        bookmarks = OrderedDict()
        for rec in self.bookmark_recs.order_by("myw_title"):

            # Get properties as dict
            # ENH: Move to bookmark model
            props = OrderedDict()
            props["centre"] = [rec.lng, rec.lat]
            props["zoom"] = rec.zoom
            props["private"] = rec.is_private

            if rec.basemap:
                props["basemap"] = rec.basemap
            if rec.layer_names:
                props["layers"] = rec.layer_names

            bookmarks[rec.myw_title] = props

        return bookmarks

    def setBookmarks(self, bookmarks):
        """
        Set self's bookmarks to BOOKMARKS (a dict of dicts, keyed by bookmark name)
        """

        # Delete existing bookmarks
        self.bookmark_recs.delete()

        # Add new ones (in name order, to make tests repeatable)
        for name, props in sorted(bookmarks.items()):
            self.setBookmark(name, props)

    def setBookmark(self, name, props):
        """
        Set bookmark NAME with properties PROPS (a dict)
        """

        # ENH: Warn for missing mandatory properties + bad properties
        # ENH: Move to bookmark model

        # Copy values (since we will destroy them)
        props = dict(props)

        # Get properties
        centre = props.pop("centre")
        zoom = props.pop("zoom")
        private = props.pop("private")
        basemap = props.pop("basemap", None)
        layer_names = props.pop("layers", None)
        # ENH: Check props now empty

        # Delete existing definition (if there is one)
        self.bookmark_recs.filter(MywBookmark.myw_title == name).delete()

        # Create record
        rec = MywBookmark()
        rec.set_name(name)
        rec.username = self.username
        rec.lng = centre[0]
        rec.lat = centre[1]
        rec.zoom = zoom
        rec.is_private = private

        rec.set_basemap_and_layers(basemap, layer_names)

        Session.add(rec)
