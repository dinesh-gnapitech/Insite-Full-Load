import { utils } from '../shared';
/**
 * Checks if its a 502 error with a mywAbort error json
 * @param  {object}   error  Service error
 * @return {Boolean}
 */
const isMywAbort = error => {
    var errorCode = error.code || error.status;
    return errorCode == 502 && error.responseText.includes('mywAbort');
};

/**
 * Parses the mywAbort error and return the message string
 * @param  {object} error 502 service error
 * @return {string}       Message payloaded onto the 502 error
 */
const getMywAbortMessage = error => {
    var msgStartIndex = error.responseText.indexOf('mywAbort:') + 9,
        msgEndIndex = error.responseText.indexOf('</body>');

    var htmlMsg = error.responseText.slice(msgStartIndex, msgEndIndex);

    var errorDomEl = document.createElement('div').appendChild(htmlMsg);
    var msgString = errorDomEl.innerHTML;

    return JSON.parse(msgString).msg;
};

const getMsgFor = (error, isEdit, msg, resourceName = null, value = null) => {
    if (error.response?.status == 409) {
        error.message = msg('exists_error', { resourceName: resourceName, value: value });
        const errorMessage = error.message;
        return errorMessage;
    }
    const errorText = isEdit ? msg('save_problem_msg') : msg('add_problem_msg');
    let errorMessage =
        error.message.length && ![500, 403].includes(error.status) ? error.message : errorText;

    if (ErrorMsg.isMywAbort(error)) {
        errorMessage = ErrorMsg.getMywAbortMessage(error);
    }
    return errorMessage;
};

const getFirstTabMessage = err => {
    const s = Object.values(err)[0].errors[0].message; //ENH improve error handling
    if (typeof s !== 'string') return '';
    return utils.capitalise(s);
};

export const ErrorMsg = {
    isMywAbort,
    getMywAbortMessage,
    getMsgFor,
    getFirstTabMessage
};
