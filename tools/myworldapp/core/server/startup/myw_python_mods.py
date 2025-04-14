import os, sys, site

# Modification of the site.addsitedir function to prioritise our code
# over that in the default python site-packages directory
def addprioritysitedir(sitedir, known_paths=None):
    """Add 'sitedir' argument to sys.path if missing and handle .pth files in
    'sitedir'"""
    if known_paths is None:
        known_paths = site._init_pathinfo()
        reset = 1
    else:
        reset = 0
    sitedir, sitedircase = site.makepath(sitedir)
    if not sitedircase in known_paths:
        sys.path.insert(0, sitedir)  # Add path component
    try:
        names = os.listdir(sitedir)
    except os.error:
        return
    dotpth = os.extsep + "pth"
    names = [name for name in names if name.endswith(dotpth)]
    for name in sorted(names):
        site.addpackage(sitedir, name, known_paths)
    if reset:
        known_paths = None
    return known_paths


# In Windows, the default sqlite3.dll that ships with Python 3 does not have Rtree support
# By loading the DLL with Rtree support here, we can trick Python to use that version instead
sqlite3_handler = None


def injectsqlite3dll():
    global sqlite3_handler
    if sqlite3_handler is None:
        if sys.platform == "win32":
            import ctypes
            from myworldapp.core.server.base.system.myw_product import MywProduct

            dll_path = os.path.join(
                MywProduct().root_dir, "Externals", "win32", "DLLs", "sqlite3.dll"
            )
            sqlite3_handler = ctypes.cdll.LoadLibrary(dll_path)


def configure_geojson_lib():
    # This file is imported by every entry point. We put this configuration here, at import time, so it
    # affects every instance (server, tools, etc)
    import geojson.geometry

    geojson.geometry.DEFAULT_PRECISION = 16
