// Copyright: IQGeo Limited 2010-2023
import { msg as mywMsg, MywError } from 'myWorld-base';

const msg = mywMsg('NativeErrors');

const registry = {};

const NativeError = MywError.extend('NativeError');

const nativeErrors = {
    NativeError,

    add(name, parent) {
        parent = parent || NativeError;
        const newError = parent.extend(name);
        // Add error to the registry - only registered errors can be instantiated
        // when a native function returns an error
        registry[name] = newError;
        // Add error to nativeErrors namespace so that they can be referred to in
        // in code as nativeErrors.<name>
        nativeErrors[name] = newError;
        return newError;
    },

    newFor(name, params) {
        let error;
        if (Object.prototype.hasOwnProperty.call(registry, name)) {
            const errorClass = registry[name];
            error = new errorClass(msg(name, params));
        } else {
            console.log(`NativeError with unregistered id: ${name}`);
            error = new NativeError(name);
        }
        error.params = params;
        return error;
    }
};

// Register all possible errors that can be raised from native code

const errors = {
    FileNotFound: {},
    FileReadError: {},
    FileWriteError: {},
    NetworkError: {
        // Retryable network errors
        NetworkReadTimeoutError: {},
        NetworkConnectionTimeoutError: {},
        NetworkServerNotFoundError: {},
        NetworkConnectionError: {},
        NetworkConnectionRefusedError: {},
        NetworkNotConnectedToInternetError: {},
        NetworkNotConnectedToWiFiError: {}
    },
    NetworkAddrNotFoundError: {},
    HTTPServerError: {},
    HTTPUnexpectedStatusError: {},
    URLNotFoundError: {},
    InvalidURLError: {},
    AuthenticationError: {},
    PermissionDeniedError: {},
    ReplicaAjaxError: {
        // Replication related errors
        ReplicaIsDeadError: {},
        DatabaseNotMasterError: {},
        UnknownReplicaError: {}
    },
    UnexpectedError: {},
    DownloadIncompleteError: {},
    RenameFailedError: {},
    InvalidProtocolError: {},
    FileTooLargeForDownloadError: {},
    CertificateError: {},
    UnzipError: {},
    InvalidUTF8Error: {},
    FileCloseError: {},
    FileAlreadyOpenError: {},
    FileNotOpenError: {},
    CSVBadEndOfFile: {},
    CSVBadRecord: {},
    HostNotFound: {},
    OpenDatabaseError: {
        InvalidVersionError: {},
        AndroidTruncateBugError: {},
        InitializedUserError: {}
    },
    NoSuchFeatureException: {},
    UnauthorizedException: {},

    ODEDataModelChangedError: {}
};

const registerErrors = (parent, errors) => {
    Object.entries(errors).forEach(([key, value]) => {
        const error = nativeErrors.add(key, parent);
        if (Object.entries(value).length) {
            // Add children - recurse
            registerErrors(error, value);
        }
    });
};

registerErrors(NativeError, errors);

export { nativeErrors };
