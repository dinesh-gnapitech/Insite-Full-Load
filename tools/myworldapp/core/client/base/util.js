// Copyright: IQGeo Limited 2010-2023
import myw from './core';
import { TimeoutError } from './errors';
import { msg } from './localisation';
import $ from 'jquery';
import { result } from 'underscore';
export { timer } from './timer';
export * from './redoStack';
export { convertMultiLangString } from './convertMultiLangString';
export * as keyboardEvent from './keyboardEvent';
import { ipad, iphone } from './browser';

/**
 * Module with a set of generic utility functions and classes used internally in myWorld
 * @exports Util
 * @example
 * Util.loadStyleSheet('mystyles.css')
 */

/**
 * Returns a promise that will resolve after the given delay in miliseconds
 * @param {number}delayMs
 */
export function delay(delayMs) {
    return new Promise(resolve => {
        setTimeout(resolve, delayMs);
    });
}

/**
 * Creates a new promise that rejects with a TimeoutError if the given promise does not settle within the given timeout
 * @param {Promise} promise
 * @param {number}timeoutMs
 */
export function timeout(promise, timeoutMs) {
    let timeoutId;
    return Promise.race([
        promise,
        new Promise((resolve, reject) => {
            timeoutId = setTimeout(() => reject(new TimeoutError()), timeoutMs);
        })
    ]).finally(() => {
        clearTimeout(timeoutId);
    });
}

/**
 * Given an Iterable (an array, for example), or a promise of an Iterable, iterates serially over all the values in it,
 * executing the given iterator on each element.
 * If an element is a promise, the iterator will wait for it before proceeding.
 * @param {Promise<array>|array} promiseOrList
 * @param {function} func
 */
export async function each(promiseOrList, func) {
    const list = await promiseOrList;
    if (!list) return;
    const results = [];
    for (let el of list) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await func(el));
    }
    return results;
}

/**
 * Returns a promise that results when the given function evaluates to truthy
 * @param {function} testFunc
 * @param {number}timeoutMs Timeout in ms where the returned promise returns anyway
 * @example
 * await th.until(() => !!detailsControl.editor); //wait for editor to catchup
 */
export async function until(testFunc, timeoutMs = 1000) {
    const start = Date.now();
    let timePassed = 0;
    let passed = false;
    do {
        passed = !!testFunc();
        if (!passed)
            // eslint-disable-next-line no-await-in-loop
            await new Promise(resolve => {
                setTimeout(resolve, 50);
            });
        timePassed = Date.now() - start;
    } while (!passed && timePassed < timeoutMs);
}

/**
 * Loads a css file. <br/>
 * Consider the alternative method of loading the file using requirejs and then loading into the dom using loadStyleRules()
 * @param  {string}         path            Url to the file
 * @param  {HTMLElement}     [styleElement]  Style element to add to the dom and check. Alternative argument to giving an url
 * @return {Promise}             Resolved when the style is confirmed to have loaded
 */
export function loadStyleSheet(path, styleElement) {
    //taken from: http://thudjs.tumblr.com/post/637855087/stylesheet-onload-or-lack-thereof
    //adapted to return a promise instead of calling a callback
    return new Promise((resolve, reject) => {
        const // reference to document.head for appending/ removing link nodes
            head = document.getElementsByTagName('head')[0]; // create the link node

        let styleEl;

        if (path) {
            styleEl = document.createElement('link');
            styleEl.setAttribute('href', path);
            styleEl.setAttribute('rel', 'stylesheet');
            styleEl.setAttribute('type', 'text/css');
        } else if (styleElement) {
            styleEl = styleElement;
        }

        let sheet, cssRules;
        // get the correct properties to check for depending on the browser
        if ('sheet' in styleEl) {
            sheet = 'sheet';
            cssRules = 'cssRules';
        } else {
            sheet = 'styleSheet';
            cssRules = 'rules';
        }

        const // how often to check if the stylesheet is loaded
            interval_id = setInterval(() => {
                // start checking whether the style sheet has successfully loaded
                try {
                    if (styleEl[sheet] && styleEl[sheet][cssRules].length) {
                        // SUCCESS! our style sheet has loaded
                        clearInterval(interval_id); // clear the counters
                        clearTimeout(timeout_id);
                        resolve(styleEl);
                    }
                } catch (e) {
                    //ignore error as we'll try again
                }
            }, 10),
            timeout_id = setTimeout(() => {
                // start counting down till fail
                clearInterval(interval_id); // clear the counters
                clearTimeout(timeout_id);
                head.removeChild(styleEl); // since the style sheet didn't load, remove the link node from the DOM
                reject(new Error('Stylesheet loading timed out'));
            }, 15000); // how long to wait before failing

        head.appendChild(styleEl); // insert the link node into the DOM and start loading the style sheet
    });
}

/**
 * Loads a string with css rules into the DOM
 * @param  {string|string[]} styleRules The css rules to load
 * @param  {string} [title]    Optional title for the set of rules
 * @return {Promise}
 */
export function loadStyleRules(styleRules, title) {
    // reference to document.head for appending/ removing link nodes
    const head = document.getElementsByTagName('head')[0];

    let styleRulesStr = '';

    if (typeof styleRules == 'string') {
        styleRulesStr = styleRules;
    } else {
        styleRulesStr = styleRules.join(' ');
    }

    //handle relative paths
    if (myw.baseUrl) styleRulesStr = styleRulesStr.replace('url("', 'url("' + myw.baseUrl);

    const styleEl = _createStyleElement(styleRulesStr, title);

    head.appendChild(styleEl);

    return Promise.resolve(styleEl);
}

/**
 * Loads an html file into a DOM element
 * @param  {string} url            Url to the html file
 * @param  {string} jquerySelector Selector that identifies an element of the DOM
 * @return {Promise}                Resolved when the file has loaded
 */
export async function loadInto(url, jquerySelector) {
    try {
        const res = await fetch(url).then(res => res.text());
        const element = $(jquerySelector);
        element.html($(res));
        return element;
    } catch (error) {
        throw new Error("Couldn't load " + JSON.stringify(url) + '. Status: ' + error.message);
    }
}

export function readCookie(name) {
    const value = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
    return value ? decodeURIComponent(value[2]) : null;
}
export function writeCookie(name, value, timeout_hours) {
    const expires = new Date(),
        expires_milliseconds = 1000 * 60 * 60 * (timeout_hours || 0);
    expires.setTime(expires.getTime() + expires_milliseconds);
    let expiresStr = timeout_hours ? (expiresStr = ';expires=' + expires.toUTCString()) : '';
    document.cookie = name + '=' + encodeURIComponent(value) + ';path=/' + expiresStr;
}

/**
 * Returns the format of a (png or jpeg) image
 * @param  {string}     image64     Base64 encoded image
 * @return {string}                 'jpg' or 'png'. Returns null if not a jpg or png image
 */
export function getImageFormatFor(image64) {
    const first4 = image64.substring(0, 4); //the first 4 characters in base64 correspond to the first 3 bytes in binary
    if ('/9gA' <= first4 && first4 <= '/9j/') return 'jpg';
    else if (first4 == 'iVBO') return 'png';
    else return null; //could not identify the image format
}

/*
 * Calculates and Returns the time since the date supplied as a translated string
 * @private
 */
export function timeSince(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    let interval = Math.floor(seconds / 31536000);

    if (interval > 1) {
        return msg('TimeSince', 'years_since', { count: interval });
    }
    interval = Math.floor(seconds / 2592000);
    if (interval > 1) {
        return msg('TimeSince', 'months_since', { count: interval });
    }
    interval = Math.floor(seconds / 86400);
    if (interval > 1) {
        return msg('TimeSince', 'days_since', { count: interval });
    }
    interval = Math.floor(seconds / 3600);
    if (interval > 1) {
        return msg('TimeSince', 'hours_since', { count: interval });
    }
    interval = Math.floor(seconds / 60);
    if (interval > 1) {
        return msg('TimeSince', 'minutes_since', { count: interval });
    }
    return msg('TimeSince', 'seconds_since', { count: Math.floor(seconds) });
}

/**
 * Converts the date to the Local date and time
 * @param  {string} rawDate        Date and time in UTC format
 * @param  {boolean}  withoutTime  If true, return date without the time
 * @return {string}                Local Date and time string in the local format
 *                                 dd month(short) yyyy, hh:mm (AM/PM)
 */
export function formatDate(rawDate, withoutTime) {
    const date = new Date(formatRawDate(rawDate));
    const dateString = date.toLocaleDateString(navigator.language, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    const time = formatTime(date);
    if (withoutTime) return dateString;
    else return dateString + ', ' + time;
}

/*
 * Formats the UTC time so it can be accepted by the javascript Date object in IE8 as well
 * @param  {datetime} rawDate UTC datetime
 * @return {string}           UTC date and time string in 'yyyy/mm/dd hh:mm:ss UTC' format
 */
export function formatRawDate(rawDate) {
    //Replacing the 'T' used in the ISO format with space
    return rawDate.split('.')[0].replace(/-/g, '/').replace('T', ' ') + ' UTC';
}

/*
 * Extracts the time from the datetime string and formats it
 * @param  {string} date UTC date and time string
 * @return {string}      time string in 'hh:mm (AM/PM)' format
 */
export function formatTime(date) {
    const hh = date.getHours();
    let m = date.getMinutes();
    let dd = 'AM';
    let h = hh;
    if (h >= 12) {
        h = hh - 12;
        dd = 'PM';
    }
    if (h === 0) {
        h = 12;
    }
    m = m < 10 ? '0' + m : m;

    return h + ':' + m + ' ' + dd;
}

/**
 * Checks if a set of search terms partially match any of the terms on a second set
 * @param  {string} searchTerms  Terms to check if they partially at least one of the terms in the second set
 * @param  {string} idTerms      Terms to match against
 * @return {boolean|string}     False if the terms didn't match or the remaining terms if it did
 * @private
 */
export function termsMatch(searchTerms, idTerms) {
    if (!idTerms) return false;

    let matches = false;
    const remainingTerms = [];

    const matchesIdTerm = (searchTerm, idTerm) => idTerm.includes(searchTerm);

    idTerms = idTerms.toLowerCase().trim().split(' ');
    searchTerms = searchTerms.trim().split(' ');
    for (let i = 0; i < searchTerms.length; i++) {
        const searchTerm = searchTerms[i].toLowerCase();
        if (idTerms.some(t => matchesIdTerm(searchTerm, t))) {
            matches = true;
            //we don't want the idTerm that was matched to exclude any more search terms
            idTerms = idTerms.filter(t => !matchesIdTerm(searchTerm, t));
        } else {
            remainingTerms.push(searchTerms[i]); //return original terms (not lowercased)
        }
    }

    if (matches) return remainingTerms.join(' ');
    else return false;
}

/**
 * Returns the union of a list of arrays without exceding a given number of elements
 * If the total number of elements exceeds the given maximum, then elements similar
 * number of elements is taken from each arrays.
 * @param  {Array<Array>} arrays
 * @param  {number}maxElements
 * @return {Array}
 */
export function sampledUnion(arrays, maxElements) {
    const slicedArrays = [];
    let nElems = 0;
    let row = 0;
    const lengthSum = arrays.reduce((memo, arr) => memo + arr.length, 0);

    maxElements = Math.min(maxElements, lengthSum);

    //get one element out of each array until we have enough elements
    while (nElems < maxElements) {
        for (let arrayId = 0; arrayId < arrays.length; arrayId++) {
            const array = arrays[arrayId];
            if (row === 0) slicedArrays[arrayId] = [];

            if (nElems < maxElements && row < array.length) {
                nElems++;
                slicedArrays[arrayId].push(array[row]);
            }
        }
        row++;
    }
    return slicedArrays.flat();
}

/**
 * Safer alternative to eval() that will only evaluate global variables and property accessors
 * @param  {string} expr Expression to be evaluated. ex: 'MywVectorLayer'
 * @param  {object} [context] Object on which to begin looking for the first property name. Defaults to window/global
 */
export function evalAccessors(expr, context, executeFunctions) {
    if (typeof expr != 'string') return undefined;
    const parts = expr.split('.');
    const g = context || (typeof global != 'undefined' ? global : window);

    return parts.reduce((current, part) => {
        if (executeFunctions) return current && result(current, part);
        else return current?.[part];
    }, g);
}

/**
 * Parses an option object converting expressions stored in string properties to proper values
 * Valid expressions are the ones that can be parsed with evalAccessors and are
 * identified by starting with 'lambda:'
 * @param  {object} jsonObj An object obtained from parsing json
 * @return {object}
 */
export function processOptionsFromJson(jsonObj) {
    Object.entries(jsonObj ?? {}).forEach(([key, item]) => {
        if (typeof item == 'string' && item.startsWith('lambda:')) {
            const expr = item.slice(7);
            jsonObj[key] = evalAccessors(expr);
        }
    });
    return jsonObj;
}

/**
 * Wraps methods with additional code.
 * Similar functionality to python decorators
 * @param  {object} context         Object for which we want the methods to become wrapped
 * @param  {function} wrapper       Function that executes the additional code
 * @param  {...string} methodName   Name of method(s) to wrap
 */
export function wrapMethodsWith(context, wrapper, ...methodNames) {
    methodNames.forEach(methodName => {
        const method = context[methodName];
        if (typeof method == 'function') {
            context[methodName] = wrapper(method);
        }
    });
}

/**
 * Concatenates the results of several promises
 * Rejected promises are ignored except if all promises are rejected - in this case
 * the returned promise is rejected with the reason for the rejection of the first promise
 * @param  {Array<promise<array>>} promises
 * @return {Promise<array>}          [description]
 */
export async function concatPromiseResults(promises) {
    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter(result => result.status == 'fulfilled');

    if (promises.length > 0 && !fulfilled.length) throw results[0].reason;
    else return fulfilled.flatMap(result => result.value);
}

/**
 * Converts a given relative url to account for option baseUrl
 * If the given url is absolute it is returned as is
 * @return {url}
 */
export function convertUrl(url) {
    const regexp = /(http|https|data):\/\//;
    const match = url.match(regexp);
    if (match) return url;
    else return myw.baseUrl + url;
}

/**
 * Adjust a relative url in a given icon definition to account for myw.baseUrl
 * @return {object} iconDef
 */
export function fixIconDefPath(iconDef) {
    if (myw.baseUrl && iconDef.iconUrl)
        return Object.assign({}, iconDef, { iconUrl: convertUrl(iconDef.iconUrl) });
    else return iconDef;
}

/**
 * Get the url specified parameter with a given name
 * @param  {string} name name of the parameter
 * @return {string}      Parameter value
 */
export function getUrlParam(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const params = new URLSearchParams(window.location.search);
    return params.get(name) ?? '';
}

/**
 * Copies a given value to the operating system's clipboard
 * @param  {string|number} data     data to copy
 */
export function copyToClipboard(data) {
    // Create a dummy input to copy the string array inside it
    const dummy = document.createElement('input');
    // Add it to the document
    document.body.appendChild(dummy);
    // Set its ID
    dummy.setAttribute('id', 'dummy_id');
    // Output the array into it
    document.getElementById('dummy_id').value = data;
    // workaround for ios platform
    if (ipad || iphone) {
        //Create a range to select the desired element and add it to the window's selection.
        const range = document.createRange();
        dummy.contentEditable = true;
        dummy.readOnly = false;
        range.selectNodeContents(dummy);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(range);
        // A big number, to cover anything that could be inside the elemen
        dummy.setSelectionRange(0, 999999);
    } else {
        // Select it
        dummy.select();
    }
    // Copy its contents
    document.execCommand('copy');
    // Remove it as its not needed anymore
    document.body.removeChild(dummy);
}

/**
 * Writes the content of a document node to the clipboard
 * @param {string} selector jQuery selector for the target node'
 */
export function copyNodeToClipboard(selector) {
    //ENH: Merge common functionality with copyToClipboard
    let r = document.createRange();
    r.selectNode($(selector)[0]);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
}

/**
 * Return latLng as a neatly formatted string
 * @param {Latlng} latlng
 * @param {int} n_dp (optional)
 */
// ENH: Support other formats e.g. deg/min/sec
export function formatLatLng(latlng, n_dp) {
    let lat_ch, lng_ch, lat_str, lng_str;

    // Determine suffices
    lat_ch = latlng.lat < 0 ? 'S' : 'N';
    lng_ch = latlng.lng < 0 ? 'W' : 'E';

    // Build string
    if (n_dp) {
        lat_str = Math.abs(latlng.lat).toFixed(n_dp);
        lng_str = Math.abs(latlng.lng).toFixed(n_dp);
    } else {
        lat_str = Math.abs(latlng.lat).toString();
        lng_str = Math.abs(latlng.lng).toString();
    }

    return lat_str + ' ' + lat_ch + ' , ' + lng_str + ' ' + lng_ch;
}

/**
 * Parses a string to identify a lat/lng coordinate
 * Returns undefined if it couldn't find a match
 * @param  {string} str
 * @return {object} With properties lat and lng
 */
export function parseLatLng(str) {
    let lat, lng, match;

    // Try unqualified lat,lng pair e.g. 1.234,34.12
    match = /^\s*(\+|\-|)(\d+)(\.\d+|)\s*,\s*(\+|\-|)(\d+)(\.\d+|)\s*$/.exec(str);
    if (match) {
        lat = Number(match[1] + match[2] + match[3]);
        lng = Number(match[4] + match[5] + match[6]);
        return { lat, lng };
    }

    // Try qualified lat,lng pair e.g. 1.234N,34.12E
    match = /^\s*(\d+)(\.\d+|)\s*(N|S)\s*,\s*(\d+)(\.\d+|)\s*(E|W)\s*$/i.exec(str);
    if (match) {
        lat = Number(match[1] + match[2]);
        lng = Number(match[4] + match[5]);
        if (match[3].toUpperCase() == 'S') lat *= -1;
        if (match[6].toUpperCase() == 'W') lng *= -1;
        return { lat, lng };
    }

    // Try qualified lng,lat pair e.g. 1.234E,34.12N
    match = /^\s*(\d+)(\.\d+|)\s*(E|W)\s*,\s*(\d+)(\.\d+|)\s*(N|S)\s*$/i.exec(str);
    if (match) {
        lng = Number(match[1] + match[2]);
        lat = Number(match[4] + match[5]);
        if (match[3].toUpperCase() == 'W') lng *= -1;
        if (match[6].toUpperCase() == 'S') lat *= -1;
        return { lat, lng };
    }
}

/**
 *  Converts a base64 string into a Blob
 *  @Returns Blob
 */
export function b64toBlob(b64Data, contentType, sliceSize) {
    contentType = contentType || '';
    sliceSize = sliceSize || 512;

    const byteCharacters = atob(b64Data);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);

        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);

        byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
}

/**
 * Converts decimal degrees to radians
 * @param {float}   degrees angle in decimal degrees
 * @returns {float} angle in radians
 */
export function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

/**
 * Converts  to radians decimal degrees
 * @param {float} radians angle in radians
 * @returns {float} angle in decimal degrees
 */
export function toDegrees(radians) {
    return (radians * 180) / Math.PI;
}

/**
 * Distance between two angles considering negative values and values over one circunference (360 degrees or 2PI)
 * @param {number} angle1
 * @param {number} angle2
 * @param {number} [circunference=360] Defaults to 360 (degrees), Use Math.PI*2 for angles in radians
 * @returns {number}
 */
export function angleDistance(angle1, angle2, circunference = 360) {
    const distance = Math.abs(modulo(angle1, circunference) - modulo(angle2, circunference));
    return Math.min(distance, circunference - distance);
}

/**
 * Modulo operator
 * @param {number} value
 * @param {number} divisor
 * @returns {number}
 */
export function modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
}

/**
 * Create a new Point that is a set length and direction from
 * an initial point.
 * @param {Array} point    initial point (openlayers coordinates)
 * @param {float} length     length in pixels
 * @param {float} direction  direction in decimal degrees
 * @return {Array} new point a set distance/direction away from initial point (openlayers coordinates)
 */
export function createPointByVector(point, length, direction) {
    const theta = toRadians(direction);

    const dX = length * Math.sin(theta);
    const dY = length * Math.cos(theta);
    const newCoords = [point[0] + dX, point[1] + dY];
    return newCoords;
}

/**
 * Returns input string to Title case string (I'm a little teapot -> I'm A Little Teapot)
 * @param {string} string
 */
export function toTitleCase(string) {
    return string
        .toLowerCase()
        .split(' ')
        .map(word => word.replace(word[0], word[0].toUpperCase()))
        .join(' ');
}

export function joinSqlStrings(joinStr, sqlStrings) {
    const params = {};
    for (const sqlStr of sqlStrings) {
        if (!sqlStr.params) continue;
        //include params in result detecting clashes
        //sort parameter names so longer names get replaced first (if clashing)
        for (let [paramName, value] of Object.entries(sqlStr.params)) {
            const exists = Object.prototype.hasOwnProperty.call(params, paramName);
            if (exists && value !== params[paramName]) {
                throw new Error(`Bind param clash: ${paramName}`);
            }
            params[paramName] = value;
        }
    }
    if (!sqlStrings.length) return;

    const sql = new String(`( ${sqlStrings.join(` ${joinStr} `)} )`);
    sql.params = params;
    return sql;
}

export function isJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

/*
 * As of 27/09/2019, iPadOS 13 doesn't fire context menu event. This seems to affect ol-contextmenu as well
 * This function applies hacks to get it working again if running iPadOS/iPhoneOS 13
 * Solution copied from https://github.com/Leaflet/Leaflet/issues/6817#issuecomment-535523415
 * ENH: find a better fix
 */
export function applyIOS13ContextMenuHack(el) {
    if (!myw.Browser.appleTouchScreen) return;

    let timer = null;

    const fireLongPressEvent = originalEvent => {
        clearLongPressTimer();

        const el = originalEvent.target,
            x = originalEvent.touches[0].clientX,
            y = originalEvent.touches[0].clientY;

        // This will emulate contextmenu mouse event
        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
        });

        // fire the long-press event
        const suppressClickEvent = el.dispatchEvent.call(el, event);

        if (suppressClickEvent) {
            // temporarily intercept and clear the next click
            el.addEventListener(
                'touchend',
                function clearMouseUp(e) {
                    el.removeEventListener('touchend', clearMouseUp, true);
                    cancelEvent(e);
                },
                true
            );
        }
    };

    const startLongPressTimer = e => {
        clearLongPressTimer(e);
        timer = setTimeout(fireLongPressEvent.bind(null, e), 1000);
    };

    const clearLongPressTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const cancelEvent = e => {
        e.stopImmediatePropagation();
        e.preventDefault();
        e.stopPropagation();
    };

    // hook events that clear a pending long press event
    el.addEventListener('touchcancel', clearLongPressTimer, true);
    el.addEventListener('touchend', clearLongPressTimer, true);
    el.addEventListener('touchmove', clearLongPressTimer, true);

    // hook events that can trigger a long press event
    el.addEventListener('touchstart', startLongPressTimer, true); // <- start
}

export function argsAsURI(args) {
    return new URLSearchParams(args).toString();
}

function _createStyleElement(rulesStr, title) {
    const styleEl = document.createElement('style');
    styleEl.type = 'text/css';

    if (title) styleEl.title = title;

    if (styleEl.styleSheet) styleEl.styleSheet.cssText = rulesStr;
    else styleEl.appendChild(document.createTextNode(rulesStr));

    return styleEl;
}
