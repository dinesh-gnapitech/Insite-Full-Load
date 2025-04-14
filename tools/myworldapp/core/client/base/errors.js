// Copyright: IQGeo Limited 2010-2023

/**
 * Extension of JavaScript's Error constructor that provides a simple way to define User exceptions. <br/>
 * Child User-defined exceptions mantain a prototype tree and therefore can be used with {@link https://github.com/petkaantonov/bluebird/blob/v2.9.7/API.md#catchfunction-errorclassfunction-predicate-function-handler---promise Bluebird's .catch ErrorClass mechanism}
 * @example var ExpiredRequestError = MywError.extend();
 * ...
 * throw new ExpiredRequestError('Too long...');
 * //> Uncaught > Object {message: "Too long...", (...)}
 * @example
 * //including the name of the exception as argument can provide better debugging as it will be used as the
 * //name of the constructor function
 * var ExpiredRequestError = MywError.extend('ExpiredRequestError');
 * throw new ExpiredRequestError();
 * //> Uncaught > ExpiredRequestError {message: undefined, name: "ExpiredRequestError", (...)}
 * @example //catching a specific User-defined exception
 * somePromise.then(function() {
 *     return a.b.c.d();
 * }).catch(ExpiredRequestError, function(e) {
 *     //will end up here if the thrown error was an instance of ExpiredRequestError
 * }).catch(function(e) {
 *     //unexpected error
 * })
 *
 * @name Error
 * @constructor
 */
const MywError = function (message) {
    this.message = message;
    this.name = 'MywError';
    Error.captureStackTrace(this, MywError);
};
MywError.prototype = Object.create(Error.prototype);
MywError.prototype.constructor = MywError; //for stack traces
MywError.extend = function (name) {
    const constructor = function (message) {
        this.message = message || name;
        if (name) this.name = name;
        Error.captureStackTrace?.(this, NewClass);
    };

    const NewClass = new Function(
        'action',
        `return function ${name || ''}(){ action.apply(this, arguments);}`
    )(constructor);

    NewClass.prototype = Object.create(this.prototype);
    NewClass.prototype.constructor = NewClass;
    NewClass.extend = this.extend;
    return NewClass;
};

const AuthenticationError = MywError.extend('AuthenticationError');
const NetworkError = MywError.extend('NetworkError');
const ObjectNotFoundError = MywError.extend('ObjectNotFoundError');
const UnauthorizedError = MywError.extend('UnauthorizedError');
const DuplicateKeyError = MywError.extend('DuplicateKeyError');
const BadRequest = MywError.extend('BadRequest');
const MissingImplementationError = MywError.extend('MissingImplementationError');
const MissingFeatureDD = MywError.extend('MissingFeatureDD');
const UnitNotDefinedError = MywError.extend('UnitNotDefinedError');
const ParseFloatError = MywError.extend('ParseFloatError');
const URLNotDefinedError = MywError.extend('URLNotDefinedError');
const TimeoutError = MywError.extend('TimeoutError');
const RequestTooLargeError = MywError.extend('RequestTooLargeError');

export {
    MywError,
    AuthenticationError,
    NetworkError,
    ObjectNotFoundError,
    UnauthorizedError,
    DuplicateKeyError,
    BadRequest,
    MissingImplementationError,
    MissingFeatureDD,
    UnitNotDefinedError,
    ParseFloatError,
    URLNotDefinedError,
    TimeoutError,
    RequestTooLargeError
};
