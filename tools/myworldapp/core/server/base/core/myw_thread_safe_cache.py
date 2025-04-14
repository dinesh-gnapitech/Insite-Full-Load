################################################################################
# Cache to be used across threads
################################################################################
# Copyright: IQGeo Limited 2010-2023

import threading


class MywThreadSafeCache:
    """
    In-memory cache of rights granted by a set of roles

    Stores partial definitions of the layers, feature types etc
    accessible to each application the roles can access"""

    def __init__(self):
        """
        Initialises slots to hold cache and thread management
        """
        self.cache = {}
        self.locks = {}

    def get(self, key, proc, *args):
        """
        Obtains value for given KEY
        If KEY hasn't been populated it runs PROC with ARGS and stores the result in the cache
        If the value for KEY is already being calculated by another thread, this call will wait
        for the result to be available before returning
        """
        lock = self.locks.get(key)
        if lock:
            # another thread is building the item - wait for it
            with lock:
                pass  # cache will be populated at this point

        result = self.cache.get(key)
        if result is None:
            # populate cache, create lock so other threads can
            self.locks[key] = threading.Lock()
            with self.locks[key]:
                # check again in case another thread managed to acquire the lock at the exact moment
                result = self.cache.get(key)
                if result:
                    return result

                # calculate the value for the key
                result = proc(*args)

                # store the result in the cache
                self.cache[key] = result
                del self.locks[
                    key
                ]  # not building anymore - other threads can go straight to cached value

        return result
