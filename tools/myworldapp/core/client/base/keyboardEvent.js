// Copyright: IQGeo Limited 2010-2023

//utility functions to help with consistent keyboard behaviour across platforms

const isMac = navigator.platform == 'MacIntel';

/*
 * Returns true if the modifier key is pressed on the given keyboard event
 * (Ctrl on Windows or option/alt on Mac)
 * @param {KeyboardEvent} ev
 */
export function modifierKeyPressed(ev) {
    return isMac ? ev.altKey || ev.metaKey : ev.ctrlKey;
}

/*
 * Returns true if the keys for undo were pressed on the given keyboard event
 * Ctrl+Z on Windows, Cmd+Z on Mac
 * @param {KeyboardEvent} ev
 */
export function undoPressed(ev) {
    const { metaKey, ctrlKey, key } = ev;
    return key == 'z' && (isMac ? metaKey : ctrlKey);
}

/*
 * Returns true if the Esc key was pressed on the given keyboard event
 * @param {KeyboardEvent} ev
 * @returns boolean
 */
export function escPressed(ev) {
    return ev.key == 'Escape';
}

/*
 * Returns true if the backspace key was pressed on the given keyboard event
 * @param {KeyboardEvent} ev
 * @returns boolean
 */
export function backspacePressed(ev) {
    return ev.key == 'Backspace';
}

// function log(ev) {
//     const { metaKey, altKey, ctrlKey, keyCode } = ev;
//     console.log({ metaKey, altKey, ctrlKey, keyCode, isMac });
// }
