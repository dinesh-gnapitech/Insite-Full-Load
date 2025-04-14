/**
 *  Abort a controller request, returning MSG and PARAMS to client
 * To match Python API
 * @param {string} message
 * @param {object} params
 */
export function mywAbort(message, params) {
    const error = new Error(message);
    error.params = params;
    throw error;
}
