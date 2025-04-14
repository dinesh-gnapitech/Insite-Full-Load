################################################################################
# Controller for bookmark requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy.sql import and_
from pyramid.view import view_config
import pyramid.httpexceptions as exc
import json

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_bookmark import MywBookmark
from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywBookmarkController(MywController):
    """
    Controller for accessing myw.bookmark
    """

    @view_config(route_name="myw_bookmark_controller.no_id", request_method="GET", renderer="json")
    def index(self):
        """
        Bookmarks owned by the current user
        """
        self.current_user.assertAuthorized(self.request)
        bookmarkRecord = Session.query(MywBookmark).filter(
            MywBookmark.username == self.current_user.name()
        )
        bookmarks = []

        for bookmark in bookmarkRecord:
            bookmarks.append(bookmark.definition())

        return {"bookmarks": bookmarks}

    @view_config(
        route_name="myw_bookmark_controller.get_by_name", request_method="GET", renderer="json"
    )
    def get_by_name(self):
        """
        Get current user's bookmark with name TITLE (if there is one)

        If the bookmark doesn't exist for current user get the bookmark for 'default' user
        """
        title = self.request.matchdict["title"]

        self.current_user.assertAuthorized(self.request)

        bookmark = (
            Session.query(MywBookmark)
            .filter(
                and_(
                    MywBookmark.myw_search_val1 == title.lower(),
                    MywBookmark.username == self.current_user.name(),
                )
            )
            .first()
        )

        if bookmark is None:
            bookmark = (
                Session.query(MywBookmark)
                .filter(
                    and_(
                        MywBookmark.myw_search_val1 == title.lower(),
                        MywBookmark.username == "default",
                    )
                )
                .first()
            )

        if bookmark is None:
            raise exc.HTTPNotFound()

        return bookmark.definition()

    @view_config(route_name="myw_bookmark_controller.no_id", request_method="POST", renderer="json")
    def create(self):
        """
        Create a new bookmark record
        """
        self.current_user.assertAuthorized(self.request)

        # Get the incoming bookmark and a few of its properties.
        properties = json.loads(self.request.body)
        properties["username"] = self.current_user.name()

        # Any bookmark that matches the incoming bookmark will be deleted.
        incoming_bookmark_filter = and_(
            MywBookmark.myw_search_val1 == properties["myw_search_val1"],
            MywBookmark.username == properties["username"],
        )

        Session.query(MywBookmark).filter(incoming_bookmark_filter).delete()

        rec = MywBookmark(**properties)
        Session.add(rec)
        Session.commit()

        # Return what we created
        self.request.response.status_code = 201
        return rec.definition()

    @view_config(
        route_name="myw_bookmark_controller.with_id", request_method="GET", renderer="json"
    )
    def get(self):
        """
        Get the bookmark ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request)

        bookmark = Session.query(MywBookmark).filter(MywBookmark.id == id).first()

        if bookmark is None:
            raise exc.HTTPNotFound()

        if bookmark.is_private and bookmark.username != self.current_user.name():
            raise exc.HTTPUnauthorized
        else:
            return bookmark.definition()

    @view_config(
        route_name="myw_bookmark_controller.with_id", request_method="PUT", renderer="json"
    )
    def update(self):
        """
        Update properties of a bookmark record
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request)

        # Unpick request
        props = json.loads(self.request.body)

        # Get record to update
        rec = Session.query(MywBookmark).get(id)

        if rec.username != self.current_user.name():
            raise exc.HTTPUnauthorized

        # Update it
        for prop, value in list(props.items()):
            rec[prop] = value

        Session.commit()

        # Return what we created
        self.request.response.status_code = 201
        return rec.definition()

    @view_config(
        route_name="myw_bookmark_controller.with_id", request_method="DELETE", renderer="json"
    )
    def delete(self):
        """
        Delete an existing bookmark record
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request)

        # Get record to delete
        rec = Session.query(MywBookmark).get(id)

        if rec.username != self.current_user.name():
            raise exc.HTTPUnauthorized

        # Delete it
        Session.delete(rec)

        Session.commit()

        return {"id": id}
