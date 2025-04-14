// Copyright: IQGeo Limited 2010-2023
function falseFn() {
    return false;
}

function trim(str) {
    return str.trim ? str.trim() : str.replace(/^\s+|\s+$/g, '');
}
// @function splitWords(str: String): String[]
// Trims and splits the string on whitespace and returns the array of parts.
function splitWords(str) {
    return trim(str).split(/\s+/);
}

export const EventsMixin = {
    /* @method on(type: String, fn: Function, context?: Object): this
     * Adds a listener function (`fn`) to a particular event type of the object. You can optionally specify the context of the listener (object the this keyword will point to). You can also pass several space-separated types (e.g. `'click dblclick'`).
     *
     * @alternative
     * @method on(eventMap: Object): this
     * Adds a set of type/listener pairs, e.g. `{click: onClick, mousemove: onMouseMove}`
     */
    on(types, fn, context) {
        // types can be a map of types/handlers
        if (typeof types === 'object') {
            for (const [type, val] of Object.entries(types)) {
                // we don't process space-separated events here for performance;
                // it's a hot path since Layer uses the on(obj) syntax
                this._on(type, val, fn);
            }
        } else {
            // types can be a string of space-separated words
            types = splitWords(types);

            for (let i = 0, len = types.length; i < len; i++) {
                this._on(types[i], fn, context);
            }
        }

        return this;
    },

    /* @method off(type: String, fn?: Function, context?: Object): this
     * Removes a previously added listener function. If no function is specified, it will remove all the listeners of that particular event from the object. Note that if you passed a custom context to `on`, you must pass the same context to `off` in order to remove the listener.
     *
     * @alternative
     * @method off(eventMap: Object): this
     * Removes a set of type/listener pairs.
     *
     * @alternative
     * @method off: this
     * Removes all listeners to all events on the object.
     */
    off(types, fn, context) {
        if (!types) {
            // clear all listeners if called without arguments
            delete this._events;
        } else if (typeof types === 'object') {
            for (const [type, val] of Object.entries(types)) {
                this._off(type, val, fn);
            }
        } else {
            types = splitWords(types);

            for (let i = 0, len = types.length; i < len; i++) {
                this._off(types[i], fn, context);
            }
        }

        return this;
    },

    // attach listener (without syntactic sugar now)
    _on(type, fn, context) {
        this._events = this._events || {};

        /* get/init listeners for type */
        let typeListeners = this._events[type];
        if (!typeListeners) {
            typeListeners = [];
            this._events[type] = typeListeners;
        }

        if (context === this) {
            // Less memory footprint.
            context = undefined;
        }
        const newListener = { fn: fn, ctx: context },
            listeners = typeListeners;

        // check if fn already there
        for (let i = 0, len = listeners.length; i < len; i++) {
            if (listeners[i].fn === fn && listeners[i].ctx === context) {
                return;
            }
        }

        listeners.push(newListener);
    },

    _off(type, fn, context) {
        let listeners, i, len;

        if (!this._events) {
            return;
        }

        listeners = this._events[type];

        if (!listeners) {
            return;
        }

        if (!fn) {
            // Set all removed listeners to noop so they are not called if remove happens in fire
            for (i = 0, len = listeners.length; i < len; i++) {
                listeners[i].fn = falseFn;
            }
            // clear all listeners for a type if function isn't specified
            delete this._events[type];
            return;
        }

        if (context === this) {
            context = undefined;
        }

        if (listeners) {
            // find fn and remove it
            for (i = 0, len = listeners.length; i < len; i++) {
                const l = listeners[i];
                if (l.ctx !== context) {
                    continue;
                }
                if (l.fn === fn) {
                    // set the removed listener to noop so that's not called if remove happens in fire
                    l.fn = falseFn;

                    if (this._firingCount) {
                        /* copy array in case events are being fired */
                        this._events[type] = listeners = listeners.slice();
                    }
                    listeners.splice(i, 1);

                    return;
                }
            }
        }
    },

    // @method fire(type: String, data?: Object, propagate?: Boolean): this
    // Fires an event of the specified type. You can optionally provide an data
    // object — the first argument of the listener function will contain its
    // properties. The event can optionally be propagated to event parents.
    fire(type, data, propagate) {
        if (!this.listens(type, propagate)) {
            return this;
        }

        const event = Object.assign({}, data, { type: type, target: this });

        if (this._events) {
            const listeners = this._events[type];

            if (listeners) {
                this._firingCount = this._firingCount + 1 || 1;
                for (let i = 0, len = listeners.length; i < len; i++) {
                    const l = listeners[i];
                    l.fn.call(l.ctx || this, event);
                }

                this._firingCount--;
            }
        }

        return this;
    },

    // @method listens(type: String): Boolean
    // Returns `true` if a particular event type has any listeners attached to it.
    listens(type) {
        const listeners = this._events && this._events[type];
        if (listeners?.length) {
            return true;
        }

        return false;
    },

    // @method once(…): this
    // Behaves as [`on(…)`](#evented-on), except the listener will only get fired once and then removed.
    once(types, fn, context) {
        if (typeof types === 'object') {
            for (const [type, val] of Object.entries(types)) {
                this.once(type, val, fn);
            }
            return this;
        }

        const handler = () => {
            this.off(types, fn, context).off(types, handler, context);
        };

        // add a listener that's executed once and removed after that
        return this.on(types, fn, context).on(types, handler, context);
    }
};

export default EventsMixin;
