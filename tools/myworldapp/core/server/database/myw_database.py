################################################################################
# High-level API for manipulating the myWorld database
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import fnmatch
from collections import OrderedDict
from datetime import datetime

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_units import MywUnitScale

from myworldapp.core.server.models.myw_setting import MywSetting
from myworldapp.core.server.models.myw_right import MywRight
from myworldapp.core.server.models.myw_checkpoint import MywCheckpoint
from myworldapp.core.server.models.myw_version_stamp import MywVersionStamp
from myworldapp.core.server.models.myw_extract import MywExtract
from myworldapp.core.server.models.myw_extract_config import MywExtractConfig
from myworldapp.core.server.models.myw_role import MywRole
from myworldapp.core.server.models.myw_replica import MywReplica

from .myw_raw_database import MywRawDatabase


class MywDatabase(MywRawDatabase):
    """
    High-level object for manipulating the primary myWorld database

    Provides protocols for querying and changing system
    settings, checkpoints, version stamps, locks etc. Also
    provides engines for loading and dumping data, manipulating
    the DD, etc.

    Internally, uses SQLAlchemy session and models for database access

    *Warning*: The model classes used by this object are based on
    global Session (not necessarily the session passed into the
    constructor)"""

    def __init__(self, session, progress=MywProgressHandler(), dd_check_rate=None):
        """
        Init slots of self

        SESSION is a SQLAlchemy session object. Optional
        DD_CHECK_RATE is a frequency (in seconds) at which
        to check if feature models have expired (see MywDD.__init__())"""

        super(MywDatabase, self).__init__(session, progress=progress)

        self.dd_check_rate = dd_check_rate
        self._dd = None  # Init lazily
        self._config_manager = None  # Init lazily
        self._data_loader = None  # Init lazily
        self._stats_manager = None  # Init lazily
        self._localisation_manager = None  # Init lazily

    # ==============================================================================
    #                                  PROPERTIES
    # ==============================================================================

    @property
    def dd(self):
        """
        Self's data dictionary engine
        """

        # Loaded lazily to improve performance ..and avoid session-not-init problems
        from myworldapp.core.server.dd.myw_dd import MywDD

        if not self._dd:
            self._dd = MywDD(self.session, check_rate=self.dd_check_rate, progress=self.progress)

        return self._dd

    @property
    def config_manager(self):
        """
        Self's engine managing other configuration data
        """

        # Loaded lazily to improve performance ..and avoid session-not-init problems
        from myworldapp.core.server.database.myw_config_manager import MywConfigManager

        if not self._config_manager:
            self._config_manager = MywConfigManager(self, progress=self.progress)

        return self._config_manager

    @property
    def data_loader(self):
        """
        Self's engine managing data loading
        """

        # Loaded lazily to improve performance ..and avoid session-not-init problems
        from myworldapp.core.server.database.myw_data_loader import MywDataLoader

        if not self._data_loader:
            self._data_loader = MywDataLoader(self, progress=self.progress)

        return self._data_loader

    @property
    def stats_manager(self):
        """
        Self's engine managing usage stats
        """

        # Loaded lazily to improve performance ..and avoid session-not-init problems
        from myworldapp.core.server.database.myw_usage_stats_manager import MywUsageStatsManager

        if not self._stats_manager:
            self._stats_manager = MywUsageStatsManager(self.progress)

        return self._stats_manager

    @property
    def localisation_manager(self):
        """
        Self's engine managing localisation of database
        """

        # Loaded lazily to improve performance ..and avoid session-not-init problems
        from myworldapp.core.server.database.myw_localisation_manager import MywLocalisationManager

        if not self._localisation_manager:
            self._localisation_manager = MywLocalisationManager(self, self.progress)

        return self._localisation_manager

    # ==============================================================================
    #                                 FEATURE TABLES
    # ==============================================================================

    @property
    def tables(self):
        """
        Master view of feature tables (a MywFeatureView)
        """

        return self.view()

    def view(self, delta="", schema="data"):
        """
        View for accessing data in version DELTA of self's feature data (a MywFeatureView)
        """

        from myworldapp.core.server.dd.myw_feature_view import MywFeatureView

        return MywFeatureView(self, delta, schema)

    # ==============================================================================
    #                                 SEQUENCES
    # ==============================================================================

    def db_sequences(self, schema):
        """
        Yields names of sequences in SCHEMA
        """

        self.session.myw_db_driver.listSequences(schema)

    # ==============================================================================
    #                                   RIGHTS
    # ==============================================================================

    def rights(self, filter="*"):
        """
        Yields the names of self's rights, in name order

        Optional filter is a glob-style filter"""

        for rec in self.session.query(MywRight).order_by(MywRight.name):
            if fnmatch.fnmatch(rec.name, filter):
                yield rec.name

    def addRight(self, name, description, config):
        """
        Create a new right
        """

        rec = MywRight(name=name, description=description, config=config)

        self.session.add(rec)

        return rec

    def rightRec(self, name):
        """
        Get definition of system right NAME (if there is one)

        Returns record (or None)"""

        return self.session.query(MywRight).filter(MywRight.name == name).first()

    # ==============================================================================
    #                                UNIT CONVERSION
    # ==============================================================================

    def unitScale(self, scale_type):
        """
        Return a units converter for properties of SCALE_TYPE (a MywUnitScale)

        Scale is built from info in setting 'core.units'"""

        scale_def = self.setting("core.units", error_if_none=True).get(scale_type)

        if not scale_def:
            raise MywError("Definition missing for unit scale:", scale_type)

        return MywUnitScale(scale_type, scale_def)

    # ==============================================================================
    #                                SYSTEM SETTINGS
    # ==============================================================================

    def settings(self, filter="*"):
        """
        Yields the names of self's settings, in name order

        Optional filter is a glob-style filter"""

        for rec in self.session.query(MywSetting).order_by(MywSetting.name):
            if fnmatch.fnmatch(rec.name, filter):
                yield rec.name

    def setting(self, name, error_if_none=False):
        """
        Get the value of system setting NAME (if there is one)

        Returns the value, formatted according to its type"""

        rec = self.session.query(MywSetting).get(name)

        if not rec:
            if not error_if_none:
                return
            raise MywError("No such setting:", name)

        return rec.formattedValue()

    def setSetting(self, name, value):
        """
        Set (or update) the value of system setting NAME

        Returns the value, formatted according to its type"""

        rec = self.session.query(MywSetting).get(name)

        if value != None:
            # Case: Insert
            if not rec:
                rec = MywSetting()
                rec.name = name
                rec.setValue(value)
                self.session.add(rec)

            # Case: Update
            else:
                rec.setValue(value)

        else:
            # Case: Delete
            if rec:
                self.session.delete(rec)

        self.session.flush()  # ENH: Not necessary?
        self.dd.checkLanguageSettings(name)

    def settingRec(self, name):
        """
        Get the record for setting NAME (if there is one)

        Returns the value, formatted according to its type"""

        return self.session.query(MywSetting).get(name)

    # ==============================================================================
    #                              VERSION STAMPS
    # ==============================================================================

    def versionStamps(self, filter="*"):
        """
        Yields the names of self's version stamps, in name order

        Optional filter is a glob-style filter"""

        for rec in self.session.query(MywVersionStamp).order_by(MywVersionStamp.component):
            if fnmatch.fnmatch(rec.component, filter):
                yield rec.component

    def versionStamp(self, component):
        """
        Get the value of the version stamp for COMPONENT (which must exist)
        """

        rec = self.versionStampRec(component)

        if not rec:
            return None

        return rec.version

    def versionStampRec(self, component):
        """
        Get the version stamp record for COMPONENT (is there is one)
        """

        return self.session.query(MywVersionStamp).get(component)

    def setVersionStamp(self, component, version, date=datetime.utcnow()):
        """
        Set the value of the version stamp for COMPONENT
        """

        rec = self.versionStampRec(component)

        if not rec:
            rec = MywVersionStamp()
            rec.component = component
            self.session.add(rec)

        rec.version = version
        rec.date = date

        self.session.flush()  # ENH: Not necessary?

    def incrementVersionStamp(self, component):
        """
        Increment the value of the version stamp for COMPONENT (which must exist)

        Returns value of stamp after increment. Guaranteed atomic"""

        sql = "UPDATE myw.version_stamp SET version = version + 1 WHERE component='{}'".format(
            component
        )

        self.session.execute(sql)

        return self.versionStamp(component)  # ENH: Make more atomic

    def deleteVersionStamp(self, component):
        """
        Delete version stamp for COMPONENT (which must exist)
        """

        rec = self.session.query(MywVersionStamp).get(component)

        self.session.delete(rec)

    # ==============================================================================
    #                                CHECKPOINTS
    # ==============================================================================

    def checkpoints(self, filter="*"):
        """
        Yields the names of self's checkpoints, in name order

        Optional filter is a glob-style filter"""

        for rec in self.session.query(MywCheckpoint).order_by(MywCheckpoint.name):
            if fnmatch.fnmatch(rec.name, filter):
                yield rec.name

    def checkpointRec(self, name):
        """
        'Record' for checkpoint NAME (if there is one)
        """

        rec = self.session.query(MywCheckpoint).get(name)

        if not rec:
            return None

        return {"name": name, "version": rec.version, "date": rec.date}

    def setCheckpoint(self, name, version=None):
        """
        Create or reposition checkpoint NAME

        If option version is not supplied, save at disk version"""

        # Deal with default
        if version == None:
            version = self.versionStamp("data")

        # If checkpointing current version, start new transaction
        if version == self.versionStamp("data"):
            self.setVersionStamp("data", version + 1)

        # Create or reposition checkpoint
        date = datetime.utcnow()
        self._setCheckpoint(name, version, date)

        return version

    def _setCheckpoint(self, name, version, date):
        """
        Create or reposition checkpoint NAME
        """

        rec = self.session.query(MywCheckpoint).get(name)

        if not rec:
            rec = MywCheckpoint()
            rec.name = name
            self.session.add(rec)

        rec.version = version
        rec.date = date

        return rec

    def dropCheckpoint(self, name, error_if_none=True):
        """
        Delete checkpoint NAME
        """

        rec = self.session.query(MywCheckpoint).get(name)

        if not rec:
            if not error_if_none:
                return
            raise MywError("No such checkpoint:", name)

        self.session.delete(rec)
        self.session.flush()

    def dataVersionFor(self, name, error_if_none=True):
        """
        Data version for NAME (if there is one)

        NAME is a checkpoint name or string representation of a version stamp"""

        version = None

        # Find checkpoint
        rec = self.checkpointRec(name)
        if rec:
            version = rec["version"]

        # If not found, try version id
        if version == None:
            try:
                version = int(name)
            except ValueError:
                pass

        # Check for not found
        if (version == None) and error_if_none:
            raise MywError("No such checkpoint or version: {}".format(name))

        return version

    def earliestNamedDataVersion(self):
        """
        Lowest numbered data version that is references by a checkpoint

        If no checkpoints exist, returns current data version"""

        rec = self.session.query(MywCheckpoint).order_by(MywCheckpoint.version).first()

        if rec:
            return rec.version
        else:
            return self.versionStamp("data")

    # ==============================================================================
    #                                DELTA TABLE OPS
    # ==============================================================================
    # ENH: Move to MywFeatureView?

    def deltas(self, delta_spec="*", sort=False):
        """
        The names of the deltas that match DELTA_SPEC

        Derives names for value of myw_delta in all delta records"""

        # Note: No need to check base as base record should always have a matching delta record

        # Find names referenced in delta records
        deltas = set()

        for feature_type in self.dd.featureTypes("myworld", versioned_only=True):
            model = self.dd.featureModel(feature_type, "delta")
            recs = self._deltaRecsFor(feature_type, delta_spec)

            for rec in recs.distinct(model.myw_delta):
                deltas.add(rec.myw_delta)

        # Sort them
        if sort:
            deltas = sorted(deltas)

        return deltas

    def deltaStats(self, delta_spec="*", feature_type_spec="*"):
        """
        Returns statistics for specified deltas and feature types

        Returns a list of lists of table_stats, keyed by delta name."""

        # ENH: Do more in database query (use distinct, count, ...)

        stats = {}

        for feature_type in self.dd.featureTypes(
            "myworld", feature_type_spec, versioned_only=True, sort=True
        ):
            # Build stats
            for rec in self._deltaRecsFor(feature_type, delta_spec):
                delta = rec.myw_delta
                change_type = rec.myw_change_type

                # Update total stats
                stat = stats.get(delta)
                if not stat:
                    stat = stats[delta] = {}

                # Update per-table stats
                table_stat = stat.get(feature_type)
                if not table_stat:
                    table_stat = stat[feature_type] = {"insert": 0, "update": 0, "delete": 0}

                if not rec.myw_change_type in table_stat:
                    table_stat[
                        rec.myw_change_type
                    ] = 0  # unexpected but protects so the command still runs with bad data

                table_stat[rec.myw_change_type] += 1

        return stats

    def _deltaRecsFor(
        self, feature_type, delta_spec=None, schema="delta", pred=None, ordered=False
    ):
        """
        Query yielding delta or base records for deltas matching DELTA_SPEC

        Optional DELTA_SPEC is a fnmatch-style wildcard"""

        # ENH: Move to MywDatabase or somewhere

        model = self.dd.featureModel(feature_type, schema)

        recs = self.session.query(model)

        if delta_spec:
            recs = recs.filter(model.fnmatch_filter("myw_delta", delta_spec))

        if pred is not None:
            recs = recs.filter(pred.sqaFilter(model.__table__))

        if ordered:
            recs = recs.order_by(model.myw_delta, model._key_column())

        return recs

    # ==============================================================================
    #                                CHANGE DETECTION
    # ==============================================================================

    transaction_log_table_names = [
        "transaction_log",
        "delta_transaction_log",
        "base_transaction_log",
        "configuration_log",
    ]

    def hasChanges(self, version):
        """
        True if transaction log has any entries for VERSION

        Note: Does not take change consolidation into account, so
        result of True does not guarantee .featureChanges() will
        return any changes
        """
        # Note: Can't use SQLAlchemy query here as can miss trigger changes

        # Ensure any pending updates are written to DB
        self.session.flush()

        # Check log tables
        for table_name in self.transaction_log_table_names:
            db_table_name = self.session.myw_db_driver.dbNameFor("myw", table_name, True)
            sql = "SELECT * FROM {} WHERE version = {} LIMIT 1".format(db_table_name, version)

            if self.session.execute(sql).first():
                return True

        return False

    def hasChangesSince(self, version, feature_types=None, excluded_settings=[]):
        """
        True if transaction log has any entries since VERSION

        Optional FEATURE_TYPES is a list of feature type names to
        limit the check. If not given, checks for changes to any
        feature type.

        Note: Does not take change consolidation into account, so
        result of True does not guarantee .featureChanges() will
        return any changes
        """
        # Note: Can't use SQLAlchemy query here as can miss changes from triggers

        # Ensure any pending updates are written to DB
        self.session.flush()

        # Check log tables
        for table_name in self.transaction_log_table_names:
            db_table_name = self.session.myw_db_driver.dbNameFor("myw", table_name, True)

            # Build query
            sql = "SELECT * FROM {} WHERE version > {}".format(db_table_name, version)

            # Add feature type filter
            if table_name != "configuration_log" and feature_types != None:
                if not feature_types:  # Avoid error if list empty
                    continue

                quoted_feature_types = ["'{}'".format(ft) for ft in feature_types]

                sql += " AND feature_type in ({})".format(",".join(quoted_feature_types))

            # Add setting name filter
            if table_name == "configuration_log" and excluded_settings:
                quoted_names = ["'{}'".format(name) for name in excluded_settings]

                sql += " AND NOT (table_name='setting' AND record_id IN ({}))".format(
                    ",".join(quoted_names)
                )

            sql += " LIMIT 1"

            # Run it
            if self.session.execute(sql).first():
                return True

        return False

    def featureChanges(self, feature_type, since_version):
        """
        Changes made to table FEATURE_TYPE since transaction SINCE_VERSION

        Processes info in transaction log, consolidating multiple changes
        to same feature. For example:
            insert + update          -> insert
            insert + update + delete -> <no change>
            delete + insert          -> update

        Returns a dict of the form:
           <feature_id>: <operation>     'insert','update' or 'delete'
        """
        # Note: Can't use SQLAlchemy query here as can miss trigger changes

        # ENH: Move to MywFeatureView?

        # Ensure any pending updates are written to DB
        self.session.flush()

        # Build query
        transaction_log = "transaction_log"

        sql = "SELECT operation,feature_id FROM {} WHERE feature_type = '{}' AND version > {} ORDER BY id"

        sql = sql.format(
            self.session.myw_db_driver.dbNameFor("myw", transaction_log, True),
            feature_type,
            since_version,
        )

        changes = {}

        # For each raw change (in order) ..
        for trans_rec in self.session.execute(sql):
            change = trans_rec["operation"]
            feature_id = trans_rec["feature_id"]

            # Consolidate with previous chage to same feature (if there is one)
            prev_change = changes.get(feature_id)

            if prev_change == "delete" and change == "insert":
                change = "update"
            elif prev_change == "insert" and change == "update":
                change = "insert"

            # Note: These changes consolidate 'automatically'
            #   update + update -> update
            #   update + delete -> delete
            #   insert + delete -> delete (insert could have come from replicas and we want that replica to receive the deletion)

            # Record the change
            if change:
                changes[feature_id] = change
            else:
                del changes[feature_id]

        return changes

    def deltaChanges(self, feature_type, since_version, schema="delta"):
        """
        Changes made to table FEATURE_TYPE since transaction SINCE_VERSION

        Processes info in transaction log, consolidating multiple changes
        to same feature. For example:
            insert + update          -> insert
            insert + update + delete -> <no change>
            delete + insert          -> update

        Returns a dict of the form:
           (<delta>,<feature_id>): <operation>     'insert', 'update' or 'delete'
        """
        # Note: Can't use SQLAlchemy query here as can miss trigger changes

        # ENH: Add delta_spec
        # ENH: Move to MywFeatureView?

        transaction_logs = {"delta": "delta_transaction_log", "base": "base_transaction_log"}

        # Ensure any pending updates are written to DB
        self.session.flush()

        # Build query
        transaction_log = transaction_logs[schema]

        sql = "SELECT operation,feature_id,delta FROM {} WHERE feature_type = '{}' AND version > {} ORDER BY id"

        sql = sql.format(
            self.session.myw_db_driver.dbNameFor("myw", transaction_log, True),
            feature_type,
            since_version,
        )

        changes = {}

        # For each raw change (in order) ..
        for trans_rec in self.session.execute(sql):
            change = trans_rec["operation"]
            feature_id = (trans_rec["delta"], trans_rec["feature_id"])

            # Consolidate with previous chage to same feature (if there is one)
            prev_change = changes.get(feature_id)

            if prev_change == "delete" and change == "insert":
                change = "update"
            elif prev_change == "insert" and change == "update":
                change = "insert"

            # Note: These changes consolidate 'automatically'
            #   update + update -> update
            #   update + delete -> delete
            #   insert + delete -> delete (insert could have come from replicas and we want that replica to receive the deletion)

            # Record the change
            if change:
                changes[feature_id] = change
            else:
                del changes[feature_id]

        return changes

    def configChanges(self, table_name, since_version, record_id_filter="*"):
        """
        Changes made to configuration table TABLE_NAME since transaction SINCE_VERSION

        Processes info in transaction log, consolidating multiple changes
        to same feature. For example:
            insert + update          -> insert
            insert + update + delete -> <no change>
            delete + insert          -> update

        Returns a dict of the form:
           <record_id>: <operation>     'insert','update' or 'delete'

        If optional RECORD_ID_FILTER is given, return only keys that match that filter

        Note: For TABLE_NAME dd_feature, record IDs include a datasource prefix"""

        # Note: Can't use SQLAlchemy query here as can miss trigger changes

        # Ensure any pending updates are written to DB
        self.session.flush()

        # Build name of table to query
        db_config_log_name = self.session.myw_db_driver.dbNameFor("myw", "configuration_log", True)

        # Build query
        sql = "SELECT operation,record_id FROM {} WHERE table_name = '{}' AND version > {} ORDER BY id"

        sql = sql.format(
            self.session.myw_db_driver.dbNameFor("myw", "configuration_log", True),
            table_name,
            since_version,
        )

        changes = {}

        # For each raw change (in order) ..
        for trans_rec in self.session.execute(sql):
            change = trans_rec["operation"]
            record_id = trans_rec["record_id"]

            # Consolidate with previous chage to same feature (if there is one)
            prev_change = changes.get(record_id)

            if prev_change == "delete" and change == "insert":
                change = "update"
            elif prev_change == "insert" and change == "update":
                change = "insert"
            elif prev_change == "insert" and change == "delete":
                change = None

            # Note: These changes consolidate 'automatically'
            #   update + update -> update
            #   update + delete -> delete

            # Record the change
            if change:
                changes[record_id] = change
            else:
                del changes[record_id]

        # Sort and filter
        ordered_changes = OrderedDict()
        for record_id in sorted(changes.keys()):
            if fnmatch.fnmatch(record_id, record_id_filter):
                ordered_changes[record_id] = changes[record_id]

        return ordered_changes

    def pruneTransactionLogs(self, to_version):
        """
        Delete from transaction logs all records up to and including TO_VERSION
        """
        # ENH: Support dry_run option?

        from myworldapp.core.server.models.myw_transaction_log import MywTransactionLog
        from myworldapp.core.server.models.myw_delta_transaction_log import MywDeltaTransactionLog
        from myworldapp.core.server.models.myw_base_transaction_log import MywBaseTransactionLog
        from myworldapp.core.server.models.myw_configuration_log import MywConfigurationLog

        with self.progress.operation("Pruning transaction logs at version", to_version, "..."):
            # For each log ..
            for tab in [
                MywTransactionLog,
                MywDeltaTransactionLog,
                MywBaseTransactionLog,
                MywConfigurationLog,
            ]:
                tab_name = tab.__table__.name  # ENH: Use db-independent name

                # Remove records up to requested version
                with self.progress.operation("Pruning", tab_name) as stats:
                    recs = self.session.query(tab).filter(tab.version <= to_version)
                    n_recs = recs.delete()
                    self.progress(1, "Deleted", n_recs, "records")
                    stats["recs"] = n_recs

    # ==============================================================================
    #                               EXTRACT META-DATA
    # ==============================================================================

    def extractNames(self, filter="*"):
        """
        Names of the extracts known to self
        """

        query = self.session.query(MywExtract).order_by(MywExtract.name)

        names = []
        for rec in query:
            if fnmatch.fnmatch(rec.name, filter):
                names.append(rec.name)

        # ENH: Warn if none found?

        return names

    def extractRoles(self, name):
        """
        Roles with access to extract NAME
        """
        # ENH: rename, move to model?
        query = (
            self.session.query(MywExtractConfig)
            .join(MywExtract, MywExtract.name == MywExtractConfig.extract_name)
            .join(MywRole, MywRole.name == MywExtractConfig.role_name)
            .filter(MywExtract.name == name)
            .with_entities(MywRole.name)
        )

        ret = []
        for rec in query:
            ret += rec

        return ret

    def extractRec(self, name):
        """
        Database record for extract NAME (if there is one)
        """

        return self.session.query(MywExtract).filter(MywExtract.name == name).first()

    def extractConfigs(self, name):
        """
        List of IDs for extract NAME (if there is one)
        """
        return self.session.query(MywExtractConfig).filter(MywExtractConfig.extract_name == name)

    def addExtract(self, name, region, table_set, include_deltas=False):
        """
        Database record for extract NAME (if there is one)
        """

        rec = MywExtract(
            name=name, region=region, table_set=table_set, include_deltas=include_deltas
        )
        self.session.add(rec)

        return rec

    def setExtractDownload(
        self, extract_name, role_name, writable_by_default=False, expiry=None, folder_name=None
    ):
        """
        Configures an extract for download
        """
        if role_name == "all" and (writable_by_default or expiry or folder_name):
            """'all' roles call get's split into two records"""
            self.setExtractDownload(extract_name, None, writable_by_default, expiry, folder_name)
            self.setExtractDownload(extract_name, "all")
            return

        # check extract exists
        if extract_name != "all":
            extract = self.extractRec(extract_name)
            if not extract:
                raise MywError("Extract does not exist:", extract_name)

        # check role name is valid
        roles = self.session.query(MywRole)
        valid_roles = [rec.name for rec in roles]
        valid_roles.append("all")
        valid_roles.append("none")
        if role_name is not None and role_name not in valid_roles:
            raise MywError("Role does not exist:", role_name)

        query = self.session.query(MywExtractConfig).filter(
            MywExtractConfig.extract_name == extract_name
        )

        if role_name == "none":
            # remove role entries for this extract
            query.filter(MywExtractConfig.role_name != None).delete()
            return

        rec = query.filter(MywExtractConfig.role_name == role_name).first()
        if not rec:
            # create record
            rec = MywExtractConfig(
                extract_name=extract_name,
                role_name=role_name,
                writable_by_default=writable_by_default,
                expiry_time=expiry,
                folder_name=folder_name,
            )
            self.session.add(rec)
        else:
            # update record
            rec.writable_by_default = writable_by_default
            if expiry:
                rec.expiry_time = expiry
            if folder_name:
                rec.folder_name = folder_name

    def saveExtractKey(self, name, encryption_key):
        """
        Add or update the encryption key for extract NAME
        """
        # This model was added at 7.0, but this file is imported by myw_db, which needs to be
        # highly compatible for inspecting and upgrading old dbs. Therefore, we cannot import
        # at top level, and we do so as late as possible to maximise compatibility.
        from myworldapp.core.server.models.myw_extract_key import MywExtractKey

        rec = self.session.query(MywExtractKey).filter(MywExtractKey.extract_name == name).first()

        if rec:
            rec.extract_key = encryption_key
        else:
            self.session.add(MywExtractKey(extract_name=name, extract_key=encryption_key))

    def deleteExtractKey(self, name):
        """
        Delete the encryption key for extract NAME
        """
        from myworldapp.core.server.models.myw_extract_key import MywExtractKey

        self.session.query(MywExtractKey).filter(MywExtractKey.extract_name == name).delete()

    # ==============================================================================
    #                                 ROLE META-DATA
    # ==============================================================================
    def roles(self, filter="*"):
        for rec in self.session.query(MywRole).order_by(MywRole.name):
            if fnmatch.fnmatch(rec.name, filter):
                yield rec.name

    # ==============================================================================
    #                               REPLICA META-DATA
    # ==============================================================================

    def replicaNames(self, filter="*", extract_type=None):
        """
        Names of the replicas known to self
        """

        query = self.session.query(MywReplica).order_by(MywReplica.registered)

        if extract_type:
            query = query.filter(MywReplica.type == extract_type)

        names = []
        for rec in query:
            if fnmatch.fnmatch(rec.id, filter):
                names.append(rec.id)

        # ENH: Warn if none found?

        return names

    def replicaRecs(self, filter="*", extract_type=None, dead=None):
        """
        Meta-data records of the replicas known to self
        """

        query = self.session.query(MywReplica).order_by(MywReplica.registered)

        if extract_type:
            query = query.filter(MywReplica.type == extract_type)

        if dead != None:
            query = query.filter(MywReplica.dead == dead)

        recs = []
        for rec in query:
            if fnmatch.fnmatch(rec.id, filter):
                recs.append(rec)

        # ENH: Warn if none found?

        return recs

    def replicaRec(self, replica_id):
        """
        Database record for replica REPLICA_ID (if there is one)
        """

        return self.session.query(MywReplica).get(replica_id)

    def replicationEngine(self):
        """
        Self's replication engine

        Self must be a master database"""

        # Convenience wrapper for use in tests.

        from myworldapp.core.server.replication.myw_master_replication_engine import (
            MywMasterReplicationEngine,
        )

        return MywMasterReplicationEngine(self, progress=self.progress)
