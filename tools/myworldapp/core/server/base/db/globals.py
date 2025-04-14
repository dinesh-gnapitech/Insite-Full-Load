################################################################################
# SQLAlchemy session globals
################################################################################

# General imports
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.orm.session import Session as _Session
from .myw_db_driver import MywDbDriver


# Create SQLAlchemy 'global' session (actually a session maker)
# Provides wrapper access to the current thread's actual session
Session: _Session = scoped_session(sessionmaker())


def init_session(session, engine):
    """
    Initialise SESSION after database has been opened

    ENGINE is a SQLAlchemy database engine
    """

    # Connect session to database
    # ENH: Sort out MywDbServer.openSecondarySession() and remove the test
    if hasattr(session, "configure"):
        session.configure(bind=engine)

    # MYW: Add driver for name mapping etc
    session.myw_db_driver = MywDbDriver.newFor(session)
