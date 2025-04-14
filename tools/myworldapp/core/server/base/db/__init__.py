# Database drivers and descriptor objects

# Module initialisation
from sqlalchemy.dialects.postgresql.base import ischema_names as postgres_ischema_names
from .myw_string_mappers import MywNullMappingString

# Make Postgres treat "" as NULL (for Oracle compatibility)
postgres_ischema_names["character varying"] = MywNullMappingString
