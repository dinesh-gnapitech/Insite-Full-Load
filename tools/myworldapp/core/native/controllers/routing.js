// Copyright: IQGeo Limited 2010-2023
const routes = [];

/**
 * Routing of paths to custom controller methods
 * Native App equivalent of the pylons (custom) routing
 */

/**
 * Register a route to a method on a custom controller
 * @param {string} route     Ex: /modules/my_module/a_service
 * @param {class} Controller
 * @param {string} methodName
 */
export function register(route, Controller, methodName, type = 'GET') {
    routes.push({ route, Controller, methodName, type });
}

/**
 * Parses a route "request"
 * @param {string[]} args Components of a route
 */
export function routeFor(url, routeType) {
    for (let { route, Controller, methodName, type } of routes) {
        const routeParams = matches(route, url);
        if (routeParams && type == routeType) return { Controller, methodName, routeParams };
    }
    throw new Error(`No route matching ${url}`);
}

function matches(path, url) {
    const components = path.split('/');
    const args = url.split('/');
    const params = {};
    if (args.length != components.length) return false;
    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        if (component.startsWith('{') && component.endsWith('}')) {
            params[component.slice(1, -1)] = args[i];
        } else if (components[i] !== args[i]) {
            return false;
        }
    }
    return params;
}
