################################################################################
# Record exemplar for myw.network
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Boolean, Column
from collections import OrderedDict

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
from myworldapp.core.server.models.myw_network_feature_item import MywNetworkFeatureItem


class MywNetwork(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.network
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "network")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    directed = Column(Boolean)

    def set_backstops(self):
        """
        Set backstop values for unpopulated fields (called on insert)
        """
        # ENH: Find a way to get this called automatically

        if not self.external_name:  # pylint: disable=access-member-before-definition
            self.external_name = self.name.replace("_", " ").title()

    # ==============================================================================
    #                                    SUBSTRUCTURE
    # ==============================================================================

    def substructure(self):
        """
        The records that depend on self
        """

        return self.feature_item_recs.all()

    @property
    def feature_item_recs(self):
        """
        Return a query yielding the network_feature_item records for self
        """

        return Session.query(MywNetworkFeatureItem).filter(
            MywNetworkFeatureItem.network_name == self.name
        )

    # ==============================================================================
    #                                 SERIALIZATION
    # ==============================================================================

    def definition(self):
        """
        Return self as a dict (for serialisation in requests)
        """

        props = OrderedDict()
        props["name"] = self.name
        props["external_name"] = self.external_name
        props["description"] = self.description
        props["topology"] = self.topology
        props["directed"] = self.directed
        props["engine"] = self.engine
        props["feature_types"] = self.feature_item_defs()

        return props

    def feature_item_defs(self):
        """
        Feature items for self

        Returns a dict of dicts, keyed by feature type"""

        items = {}

        # Build list of items
        query = (
            Session.query(MywNetworkFeatureItem, MywDDFeature)
            .filter(MywNetworkFeatureItem.network_name == self.name)
            .join(MywDDFeature, MywDDFeature.id == MywNetworkFeatureItem.feature_id)
        )

        for item_rec, ftr_rec in query:

            item_data = OrderedDict()

            for prop in ["upstream", "downstream", "length", "filter"]:
                value = item_rec[prop]

                if value != None:
                    item_data[prop] = value

            items[ftr_rec.feature_name] = item_data

        # Sort (to avoid jitter in tests)
        items = OrderedDict(sorted(items.items()))

        return items

    def set_feature_items(self, ftr_item_defs, skip_unknown=False, progress=MywProgressHandler()):
        """
        Update the network feature item records associated with SELF

        FTR_ITEM_DEFS is a dict of item defs, keyed by feature type (as per .network file)
        """

        # Delete old feature items
        for rec in self.feature_item_recs:
            Session.delete(rec)
        Session.flush()

        # Create new ones
        for ftr_name, ftr_props in list(ftr_item_defs.items()):

            # Get feature record
            ftr_rec = self.dd_feature_rec_for("myworld", ftr_name)

            # Check for not such feature
            if not ftr_rec:
                if skip_unknown:
                    progress("warning", "Unknown feature type:", ftr_name)
                    continue
                else:
                    raise MywError("Unknown feature type:", ftr_name)

            # Create record
            rec = MywNetworkFeatureItem(network_name=self.name, feature_id=ftr_rec.id)

            for prop, value in list(ftr_props.items()):
                for prop, value in list(ftr_props.items()):
                    rec[prop] = value

            Session.merge(rec)

    def dd_feature_rec_for(self, datasource_name, name):
        """
        Returns the dd_feature record for feature with internal name NAME (if there is one)
        """

        return (
            Session.query(MywDDFeature)
            .filter(MywDDFeature.datasource_name == datasource_name)
            .filter(MywDDFeature.feature_name == name)
            .first()
        )

    # ==============================================================================
    #                                    VALIDATION
    # ==============================================================================
    # TODO
