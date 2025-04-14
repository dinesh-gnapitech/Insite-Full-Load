################################################################################
# Record exemplar for myw.group
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from collections import OrderedDict
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin

from .myw_group_item import MywGroupItem


class MywGroup(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.group
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "group")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    def definition(self):
        """
        Return self in a serializable format
        """

        return {
            "owner": self.owner,
            "name": self.name,
            "description": self.description,
            "members": self.members,
        }

    def substructure(self):
        """
        Records owned by self
        """

        return self.item_recs.all()

    @property
    def item_recs(self):
        """
        Query yielding member records of self
        """

        return Session.query(MywGroupItem).filter(MywGroupItem.group_id == self.id)

    def setId(self):
        """
        Constructs self's ID from name owner and name fields

        Note: Uses a 'natural key' to ensure groups preserved over feature dump/load.
        Combines owner and name into single field to make transaction logging easier"""

        self.id = self.owner + ":" + self.name

    @property
    def members(self):
        """
        Members of self (a dict of bools, keyed by username)
        """

        members = OrderedDict()
        for item_rec in self.item_recs:
            members[item_rec.username] = item_rec.manager

        return members

    def setMembers(self, members):
        """
        Sets substructure of self

        MEMBERS is a dict of bools, keyed by username. Values indicate which users are group managers.
        """

        # Remove old items
        self.item_recs.delete()
        Session.flush()

        # Add new ones
        for (username, manager) in list(members.items()):
            self._addMember(username, manager)

    def _addMember(self, username, manager):
        """
        Adds a member to self
        """

        item = MywGroupItem(group_id=self.id, username=username, manager=manager)
        Session.add(item)

    def isManager(self, username):
        """
        True is USERNAME is a manager (or owner) of self
        """

        # Check for owner
        if self.owner == username:
            return True

        # Check for member
        member_item = self.item_recs.filter(MywGroupItem.username == username).first()
        if not member_item:
            return False

        return member_item.manager
