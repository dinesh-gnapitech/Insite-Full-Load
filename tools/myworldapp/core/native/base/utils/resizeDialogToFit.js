// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';

// Resizes a jQuery dialog if the title overflows. Call this in the dialog's open callback
export function resizeDialogToFit(dialog) {
    const parentElement = dialog.parentElement;
    const $parentElement = $(parentElement);
    const titleElement = parentElement.getElementsByClassName('ui-dialog-title')[0];
    const $titleElement = $(titleElement);

    //  Grabs the difference in width caused by margin, padding, etc
    const widthDiff = $parentElement.width() - $titleElement.width();

    //  Removes any sort of clipping on the title and gets the full width
    const origStyleWidth = titleElement.style.width;
    titleElement.style.width = 'unset';
    const fullTitleWidth = $titleElement.width() + widthDiff;
    titleElement.style.width = origStyleWidth;

    //  If the unclipped title size is bigger than the current dialog box, resize the box and reposition appropriately
    if (fullTitleWidth > $parentElement.width()) {
        parentElement.style.width = fullTitleWidth + 'px';
        const $dialog = $(dialog);
        $dialog.dialog('option', 'position', $dialog.dialog('option', 'position'));
    }
}
