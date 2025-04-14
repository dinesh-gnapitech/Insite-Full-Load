from pyramid.events import NewResponse
from myworldapp.core.server.base.db.globals import Session

# Custom predicate which returns whether the app is running with the debug flag set
class IsDebugPredicate:
    def __init__(self, val, config):
        self.val = val

    def text(self):
        return "is_debug = %s" % (self.val,)

    phash = text

    def __call__(self, context, request):
        return request.registry.settings.get("pyramid.debug_all", False) == self.val


# Subscriber to remove the current session once a request is fulfilled
def on_new_response(response):
    Session.remove()


def includeme(config):
    #  Setup custom predicates that we can use to show different errors if they're on debug mode or not
    config.add_route_predicate("is_debug", IsDebugPredicate)
    config.add_view_predicate("is_debug", IsDebugPredicate)

    # Close the session on any response
    config.add_subscriber(on_new_response, NewResponse)
