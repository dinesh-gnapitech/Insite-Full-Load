// Copyright: IQGeo Limited 2010-2023

const tracing = {};

let traceSettings;
try {
    const traceSettingsStr = localStorage.getItem('mywTrace');
    traceSettings = traceSettingsStr && JSON.parse(traceSettingsStr);
} catch (e) {
    //ignore errors getting from local storage
}

tracing.modules = traceSettings || {};
tracing.logs = { application: [], sync: [] };

/**
 * Outputs line of text to browser console.
 * Curried function
 * @param  {string}     module The module this trace line applies to.
 * @param  {number}   [level] If this number is higher than or equal to trace level for the module then the line is written out. When omitted returns curried function
 * @param  {...string}     msgs Message to show in console. When omitted returns curried function
 */
const trace = (module, level, ...msgs) => {
    // ENH: If calculating msg in the caller proves to be costly then one option is to allow caller to pass a function/closure that
    // will only be evaluated if the trace level is appropriate.
    if (level === undefined) return trace.bind(null, module);
    if (msgs.length === 0) return trace.bind(null, module, level);

    const moduleLogs = tracing.logs[module];
    if (isTracing(module, level) || moduleLogs) {
        msgs.unshift(`${module}:`);

        const isChrome = navigator.userAgent.includes('Chrome');
        if (isChrome) {
            const error = new Error();
            Error.captureStackTrace(error, trace);
            const stack = error.stack;
            const file = stack.split('\n')[1].split('/').splice(-1)[0].split(':')[0].split('?')[0];
            const line = stack.split('\n')[1].split('/').splice(-1)[0].split(':')[1];
            msgs.push('\t\t\t');
            msgs.push(`(${file}:${line})`);
        }

        if (level > 0) {
            const now = new Date();
            const msec = now.getMilliseconds();
            const pad = ['00', '0', ''][Math.floor(Math.log(msec) / Math.LN10)];
            msgs.unshift(
                `[${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}:${pad}${msec}]`
            );
        }
        const msg = msgs.join(' ');
        if (isTracing(module, level)) console.log(msg);
        if (moduleLogs && level <= 10) {
            //limit to 200 messages to keep memory in check
            if (moduleLogs.length >= 200) moduleLogs.shift();
            moduleLogs.push(msg);
        }
    }
};

/**
 * Returns whether tracing is active for given module & level.
 * Useful for map related debugging.
 * @param  {string}     module The module this trace line applies to.
 * @param  {number}   level If this number is higher than or equal to trace level for the module then the line is written out.
 * @return {boolean}
 */
function isTracing(module, level) {
    return (
        (module in tracing.modules && tracing.modules[module] >= level) ||
        ('all' in tracing.modules && tracing.modules['all'] >= level)
    );
}

/**
 * Set the trace level for the specified module. Apart from the 'all' module, there is no explicitly defined list of modules. Specifying the 'all'
 * module allows a minimum trace level to be set across all modules. Suggested use during development
 * is to use the browser debugger console to make a call to myw.traceset to set the desired trace level.
 * @param {string}  module Module name
 * @param {number}level  Required trace level
 */
function traceset(module, level) {
    tracing.modules[module] = level;
    tracing.logs[module] = [];
    try {
        localStorage.setItem('mywTrace', JSON.stringify(tracing.modules));
    } catch (e) {
        //ignore as this isn't crucial
    }
}

export { trace, traceset, isTracing, tracing };
