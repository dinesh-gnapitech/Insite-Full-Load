################################################################################
# Controller for table_set requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from pyramid.view import view_config
import pyramid.httpexceptions as exc
from json import loads

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_table_set import MywTableSet

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywTableSetController(MywController):
    """
    Controller for myw.table_set requests
    """

    @view_config(route_name="myw_table_set_controller.no_id", request_method="GET", renderer="json")
    def index(self):
        """
        Returns definitions of all table sets
        """

        self.current_user.assertAuthorized(self.request, application="config")

        table_sets = []
        for table_set in Session.query(MywTableSet):
            table_sets.append(table_set.definition())

        return {"table_sets": table_sets}

    @view_config(
        route_name="myw_table_set_controller.no_id", request_method="POST", renderer="json"
    )
    def create(self):
        """
        Create a new tablet_set
        """

        self.current_user.assertAuthorized(
            self.request, right="manageReplicas", application="config"
        )

        # Unpick request
        table_set_def = loads(self.request.body)

        # Create record
        rec = MywTableSet(id=table_set_def["name"])

        # Check for duplicate tableset name
        confilcting_name = Session.query(MywTableSet).filter(MywTableSet.id == rec.id).first()
        if confilcting_name:
            raise exc.HTTPConflict()

        Session.add(rec)
        Session.flush()

        # Set its properties
        rec.update_from(table_set_def)
        Session.commit()

        return rec.definition()

    @view_config(
        route_name="myw_table_set_controller.with_id", request_method="PUT", renderer="json"
    )
    def update(self):
        """
        Update table_set ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(
            self.request, right="manageReplicas", application="config"
        )

        # Unpick request
        table_set_def = loads(self.request.body)

        # Get the record
        rec = Session.query(MywTableSet).get(id)

        # Update its properties
        rec.update_from(table_set_def)
        Session.commit()

        return rec.definition()

    @view_config(
        route_name="myw_table_set_controller.with_id", request_method="DELETE", renderer="json"
    )
    def delete(self):
        """
        Delete table_set ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(
            self.request, right="manageReplicas", application="config"
        )

        rec = Session.query(MywTableSet).get(id)
        rec.delete()
        Session.commit()

        return {"id": id}
