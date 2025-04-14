###############################################################################
# Store for OIDC state information
###############################################################################
# Copyright: IQGeo Limited 2010-2023

from functools import cached_property

from myworldapp.core.server.base.core.utils import getCacheManager
from myworldapp.core.server.base.core.utils import SharedDict

from oidcrp.state_interface import StateInterface


class MywOidcStateCache(StateInterface):
    """
    State Interface for storing OIDC state information

    state is stored in a shared beaker cache.
    """

    @cached_property
    def sharedCacheManager(self):
        """
        A shared cache manager (memcache) or None if not configured
        """
        return getCacheManager("oidc", 2 * 86400)

    def __init__(self):
        super().__init__()

        if self.sharedCacheManager:
            sharedCache = self.sharedCacheManager.get_cache("statedb")
            self._db = SharedDict(sharedCache)
        else:
            self._db = {}
