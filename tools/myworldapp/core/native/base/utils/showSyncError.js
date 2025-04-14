// Copyright: IQGeo Limited 2010-2023
import { msg as mywMsg, NetworkError } from 'myWorld-base';
import { displayErrorAlert } from './displayErrorAlert';
import { nativeErrors } from './nativeErrors';

const msg = mywMsg('sync');

export function showSyncError(error) {
    let message;

    // We expect error to be an error object, but it could
    // just be a string
    if (error instanceof nativeErrors.ReplicaAjaxError) {
        message = messageForReplicaAjaxError(error);
    } else if (error instanceof NetworkError) {
        message = msg('network_error');
    } else {
        message = error.message || error;
    }
    return displayErrorAlert(msg('sync_error_title'), [message], msg('continue_button_label'));
}

export function messageForReplicaAjaxError(error) {
    if (error instanceof nativeErrors.ReplicaIsDeadError) {
        return msg('replica_is_dead_error');
    }
    if (error instanceof nativeErrors.DatabaseNotMasterError) {
        return msg('database_not_master_error');
    }
    if (error instanceof nativeErrors.UnknownReplicaError) {
        return msg('unknown_replica_error');
    }
    return error.message; // Backstop handling - shouldn't happen...
}
