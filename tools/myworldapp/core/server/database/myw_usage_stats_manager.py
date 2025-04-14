# ==============================================================================
# myw_usage_stats_engine
# ==============================================================================
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import math
from datetime import datetime, timedelta
from fnmatch import fnmatch

from sqlalchemy.sql import func, not_

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_usage import MywUsage
from myworldapp.core.server.models.myw_usage_item import MywUsageItem


class MywUsageStatsManager:
    """
    Engine to aggregate stats from usage tables
    """

    def __init__(self, progress=MywProgressHandler()):
        """
        Init UsageStatsManager

        PROGRES_PROC(level,*msg) is a callback for progress messages"""

        self.progress = progress

    def usageBySession(self, name_spec, start=None, end=None):
        """
        Aggregate statistics on system usage by session

        Optional START and END are datetimes.

        Returns a list of dicts ordered by start time"""
        # ENH: Include browser, action count, ...

        stats = []
        for rec in self.sessionRecs(start, end, ordered=True):

            if not fnmatch(rec.username, name_spec):
                continue

            stat = {"user": rec.username, "start_time": rec.start_time, "end_time": rec.end_time}

            stats.append(stat)

        return stats

    def usageByLicence(self, name_spec, start=None, end=None):
        """
        Aggregate statistics on system usage by licece type

        Optional START and END are datetimes.

        Returns a list of sets of user names, keyed by licence name"""

        name_spec = "licence." + name_spec

        # Get stats
        stats = {}
        for (session_rec, item_rec) in self.actionRecs(start, end, name_spec):
            action = item_rec.action

            licence = action.split(".", 1)[-1]

            stat = stats.get(licence)

            if not stat:
                stat = stats[licence] = set()

            stat.add(session_rec.username)

        return stats

    def usageByAction(self, name_spec, start=None, end=None):
        """
        Aggregate statistics on system usage by action

        Optional START and END are datetimes.

        Returns a list of dicts, keyed by action"""

        # Get stats
        stats = {}
        for (session_rec, item_rec) in self.actionRecs(start, end, name_spec):
            action = item_rec.action

            stat = stats.get(action)

            if not stat:
                stat = stats[action] = {"count": 0, "users": set()}

            stat["count"] += item_rec.count
            stat["users"].add(session_rec.username)

        return stats

    def usageByUser(self, name_spec, start=None, end=None):
        """
        Aggregate statistics on system usage by user

        Optional START and END are datetimes.

        Returns a list of counts, keyed by username"""

        # Get stats
        stats = {}
        for rec in self.sessionRecs(start, end):

            if not fnmatch(rec.username, name_spec):
                continue

            if not rec.username in stats:
                stats[rec.username] = 0

            stats[rec.username] += 1  # ENH: Return something more useful

        return stats

    def usageByApplication(self, applications, start=None, end=None):
        """
        Aggregate statistics on system usage by application

        Optional START and END are datetimes.

        Returns a list of sets, keyed by application"""

        # Init stats
        stats = {}
        for application in applications:
            stats[application] = set()

        # Update from database
        for (session_rec, item_rec) in self.actionRecs(start, end):  # ENH: for licence.core only?

            stat = stats.get(item_rec.application_name)

            if stat != None:
                stat.add(session_rec.username)

        return stats

    def usageByLayer(self, layers, start=None, end=None):
        """
        Aggregate statistics on system usage by layer

        Optional START and END are datetimes.

        Returns a list of sets, keyed by layer"""

        # Init stats
        stats = {}
        for layer in layers:
            stats[layer] = set()

        # Update from database
        for (session_rec, item_rec) in self.actionRecs(start, end, "data.layer.*"):
            layer_name = item_rec.action.split(".", 2)[-1]
            stat = stats.get(layer_name)

            if stat != None:
                stat.add(session_rec.username)

        return stats

    def usageProfile(self, bucket_size, start=None, end=None):
        """
        Aggregate statistics on system usage by time period

        BUCKET_SIZE is one of 'hour', 'day', 'week', 'month'.
        Optional START and END are datetimes.

        Returns an oredered list of dicts of the form:
          'period_start'
          'period_end'
          'users'
          'sessions'"""

        # Note: Assumes that returned buckets and DB buckets are on aligned boundaries

        # Deal with defaults
        if not start:
            start = self.sessionRecsStart()
        if not end:
            end = self.sessionRecsEnd()

        # Check for no records in database
        if not start:
            return {}

        # Round start and end out to bucket boundaries (to avoid reporting incomplete buckets)
        (start, junk) = self.bucketFor(start, bucket_size)
        (junk, end) = self.bucketFor(end, bucket_size)

        # Init empty result
        stats = []
        stat_start = start
        while stat_start < end:
            (stat_start, stat_end) = self.bucketFor(stat_start, bucket_size)
            stat = {
                "period_start": stat_start,
                "period_end": stat_end,
                "users": set(),
                "sessions": 0,
            }
            stats.append(stat)

            stat_start = stat_end

        # Add in values from database
        fst_stat = 0
        for rec in self.sessionRecs(start, end, ordered=True):

            # Update statistics for buckets covered by range
            for i_stat in range(fst_stat, len(stats)):
                stat = stats[i_stat]

                stat_start = stat["period_start"]
                stat_end = stat["period_end"]

                # Check for this bucket complete
                if rec.start_time > stat_end:
                    fst_stat += 1

                # Check for session in bucket
                if (rec.end_time >= stat_start) and (rec.start_time < stat_end):
                    stat["users"].add(rec.username)
                    stat["sessions"] += 1

                # Check for session complete
                if rec.end_time < stat_start:
                    break

        return stats

    def bucketFor(self, time, bucket_size):
        """
        The limits of the bucket that includes datetime TIME

        BUCKET_SIZE can be 'hour', 'day', 'week', 'month' or size in seconds.
        If seconds, the number must be an exact divisor of 3600.

        Does not consider leap seconds (neither does Python datetime)

        Returns a pair of datetimes:
          BUCKET_START    Start of bucket
          BUCKET_END      Start of next bucket"""

        if isinstance(bucket_size, int):
            base = datetime(2015, 1, 1)
            offset = time - base
            i_bucket = math.floor(offset.total_seconds() / bucket_size)
            bucket_start = base + timedelta(seconds=bucket_size * i_bucket)
            bucket_end = bucket_start + timedelta(seconds=bucket_size)

        elif bucket_size == "hour":
            bucket_start = datetime(time.year, time.month, time.day, time.hour)
            bucket_end = bucket_start + timedelta(hours=1)

        elif bucket_size == "day":
            bucket_start = datetime(time.year, time.month, time.day)
            bucket_end = bucket_start + timedelta(days=1)

        elif bucket_size == "week":
            bucket_start = datetime(time.year, time.month, time.day) - timedelta(
                days=time.weekday()
            )
            bucket_end = bucket_start + timedelta(days=7)

        elif bucket_size == "month":
            month = time.month
            bucket_start = datetime(time.year, month, 1)
            bucket_end = datetime(
                int(time.year + month / 12), month % 12 + 1, 1
            )  # Datetime expecting integer inputs

        else:
            raise Exception("Bad bucket size: {}".format(bucket_size))

        return bucket_start, bucket_end

    def sessionRecsStart(self):
        """
        The earliest start_period in the database (if there is one)
        """

        query = Session.query(func.min(MywUsage.start_time))

        return query.scalar()

    def sessionRecsEnd(self):
        """
        The latest start_period in the database (if there is one)
        """

        query = Session.query(func.max(MywUsage.end_time))

        return query.scalar()

    def sessionRecs(self, start=None, end=None, ordered=False):
        """
        Returns query yielding usage statistic records

        If optional START and END are provided, yield only buckets that start within that range"""

        query = Session.query(MywUsage)

        if start:
            query = query.filter(MywUsage.end_time >= start)

        if end:
            query = query.filter(MywUsage.start_time < end)

        if ordered:
            query = query.order_by(MywUsage.start_time)

        return query

    def actionRecs(self, start=None, end=None, action_spec=None):
        """
        Returns query yielding (usage, action) records

        If optional START and END are provided, yield only buckets that start within that range.
        Optional ACTION_SPEC is an fnmatch-style action_spec"""

        query = Session.query(MywUsage, MywUsageItem).join(
            MywUsageItem, MywUsageItem.usage_id == MywUsage.id
        )

        if start:
            query = query.filter(MywUsage.start_time >= start)

        if end:
            query = query.filter(MywUsage.end_time < end)

        if action_spec:
            query = query.filter(MywUsageItem.fnmatch_filter("action", action_spec))

        return query

    def pruneUsageStats(self, before_date, include_licences=False):
        """
        Delete usage and related usage_item earlier than BEFORE_DATE
        """

        with self.progress.operation("Pruning usage stats before", before_date.date()) as stats:

            # Find ID of last session to keep
            before_id = (
                Session.query(func.max(MywUsage.id))
                .filter(MywUsage.start_time <= before_date)
                .scalar()
            )

            if before_id == None:
                return

            # Find records to delete
            item_recs = Session.query(MywUsageItem).filter(MywUsageItem.usage_id <= before_id)
            session_recs = Session.query(MywUsage).filter(MywUsage.id <= before_id)

            # Remove action items (first, to avoid reference errors)
            if not include_licences:
                item_recs = item_recs.filter(not_(MywUsageItem.action.like("licence.%")))
            n_item_recs = item_recs.delete(synchronize_session="fetch")
            self.progress(6, n_item_recs, "usage_item records removed")
            Session.flush()

            # Remove session items
            n_session_recs = 0
            if include_licences:
                session_recs = Session.query(MywUsage).filter(MywUsage.id <= before_id)
                n_session_recs = session_recs.delete()
                self.progress(6, n_session_recs, "usage records removed")

            # Update stats
            stats["n_recs"] = n_session_recs + n_item_recs
            self.progress(1, (n_session_recs + n_item_recs), "records removed")

            Session.commit()
