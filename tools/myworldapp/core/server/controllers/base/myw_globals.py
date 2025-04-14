###############################################################################
# Global instances shared between controllers
###############################################################################
# ENH: Move to app_globals?
# Copyright: IQGeo Limited 2010-2023

# Create shared objects for accessing database
options = None
log_level = None
dd_check_rate = None
db = None
dd = None


def initGlobals(app_config):
    from myworldapp.core.server.base.db.globals import Session
    from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
    from myworldapp.core.server.database.myw_database import MywDatabase

    global options
    global log_level
    global dd_check_rate
    global db
    global dd

    options = app_config.get("myw.feature.options", {})
    log_level = options.get("dd_log_level", 0)
    dd_check_rate = options.get("dd_check_rate", 1)

    db = MywDatabase(
        Session, dd_check_rate=dd_check_rate, progress=MywSimpleProgressHandler(log_level)
    )
    dd = db.dd
