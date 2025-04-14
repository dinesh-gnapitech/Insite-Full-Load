import { message } from 'antd';

/**
 * Returns message to be displayed next to search input
 */
function getFilterMsg(msg, msgId, length, totalCount) {
    return length < totalCount
        ? `${length} ${msg(msgId).toLowerCase()} (out of ${totalCount})`
        : `${totalCount} ${msg(msgId).toLowerCase()}`;
}

const isJSON = str => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
};

const onFilterChange = (value, owner, stateName = 'filter') => {
    const filterVal = value ? value : '';
    owner.setState({ [stateName]: filterVal });
};

const onSortingChange = (colKey, sortOrder, owner) => {
    owner.setState({ sortedColKey: colKey || '', sortOrder });
};

function capitalise(string) {
    if (!string) return;
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function convertToLang(value, lang, defaultLang) {
    try {
        const valObj = JSON.parse(value);
        return valObj[lang];
    } catch (e) {
        return lang === defaultLang ? value : '';
    }
}
/**
 * Checks if its a 502 error with a mywAbort error json
 * @param  {object}   error  Service error
 * @return {Boolean}
 */
function isMywAbort(error) {
    const errorCode = error.response && (error.response.code || error.response.status);
    return errorCode == 502 && error.response.data.includes('mywAbort');
}

/**
 * Parses the mywAbort error and return the message string
 * @param  {object} error 502 service error
 * @return {string}       Message payloaded onto the 502 error
 */
function getMywAbortMessage(error) {
    const msgStartIndex = error.response.data.indexOf('mywAbort:') + 9,
        msgEndIndex = error.response.data.indexOf('</body>');

    const htmlMsg = error.response.data.slice(msgStartIndex, msgEndIndex);

    const errorDomEl = document.createElement('div');
    errorDomEl.innerHTML = htmlMsg;
    const msgString = JSON.parse(errorDomEl.textContent).msg;
    return msgString.charAt(0).toUpperCase() + msgString.slice(1); //Capitalise first letter
}

/**
 * Displays the errorMsg
 * If the error is a 502, parses the error before displaying
 * @param {object} error
 * @param {string} errorMsg Error to display
 */
const showErrorMsg = (error, errorMsg) => {
    message.error(isMywAbort(error) ? getMywAbortMessage(error) : errorMsg);
};

export default {
    getFilterMsg,
    isJSON,
    onFilterChange,
    onSortingChange,
    capitalise,
    convertToLang,
    showErrorMsg
};
