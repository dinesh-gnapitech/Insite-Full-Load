# Command line utility for maintenance the myWorld product
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

# NOTE: most commands will import a fix/monkey patch for geojson here, in case it is used in the
# command. However, myw_product has a mode which _installs_ geojson, and none of its other modes
# use it. So we are safe to skip. All other commands should apply the fix.

# Load code
from myworldapp.core.server.commands.myw_product_command import MywProductCommand

# Run command
MywProductCommand().run(*sys.argv[1:])
