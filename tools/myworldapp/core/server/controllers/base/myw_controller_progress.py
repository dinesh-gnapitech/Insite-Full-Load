################################################################################
# Progress message handlers for myWorld engines. Persists progress in a record
################################################################################
# Copyright: IQGeo Limited 2010-2023

from sqlalchemy.orm import sessionmaker
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.models.myw_configuration_task import MywConfigurationTask


class MywControllerProgressHandler(MywSimpleProgressHandler):
    """
    Progress handler that writes progress messages to a database record

    Used to monitor progress of controller operations for reporting in client"""

    # ENH: Rename as MywTaskProgressHandler .. and inherit direct from MywProgress

    __tableName__ = "configuration_task"

    def __init__(self, level, task_id, engine):
        """
        Init slots of self

        LEVEL is the maximum message level to log. TASK_ID is the
        key for the myw.configuration_task record to
        create. db_engine is a SQLAlchemy database engine."""

        MywSimpleProgressHandler.__init__(self, level)

        self.task_id = task_id

        # Create new session (so that we can use models)
        # Note: Assumes this is cleaned up automatically when self dies
        sm = sessionmaker(bind=engine)
        self.session = sm()

    def write_line(self, indent_level, msg_level, *msg):
        """
        Write message (if appropriate)

        Subclassed to write message into table"""

        # Check for not of interest
        if msg_level > self.level:
            return

        # Get record to update (creating if necessary)
        task_rec = self.session.query(MywConfigurationTask).get(self.task_id)

        if not task_rec:
            task_rec = MywConfigurationTask(id=self.task_id, status="Starting")
            self.session.add(task_rec)

        # Set record to first line of message (avoiding overflow)
        msg_lines = self.format_message(msg).splitlines()
        task_rec.status = msg_lines[0][:128]

        # Make it visible to other threads
        self.session.commit()

        # Enable line below to allow checking of messages in GUI
        # time.sleep(1.2)

    def cleanup(self):
        """
        Delete self's task record (if it exists)
        """

        task_rec = self.session.query(MywConfigurationTask).get(self.task_id)

        if task_rec:
            self.session.delete(task_rec)
            self.session.commit()
