# Command line utility for managing myWorld databases
import site, os, sys

# Add the product root dir to the module search path
product_root_dir = os.getenv("MYW_PRODUCT_ROOT_DIR")
if product_root_dir:
    site.addsitedir(product_root_dir)

# Add myWorld modules to module search path and ensure they have priority over default python paths
from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

site_dirs = os.getenv("MYW_PYTHON_SITE_DIRS")
if site_dirs:
    for site_dir in site_dirs.split(";"):
        addprioritysitedir(site_dir)

# Patch sqlite DLL on windows.
from myworldapp.core.server.startup.myw_python_mods import injectsqlite3dll, configure_geojson_lib

injectsqlite3dll()
configure_geojson_lib()

# Load code
from myworldapp.core.server.commands.myw_db_command import MywDbCommand

# Run command
MywDbCommand().run(*sys.argv[1:])
