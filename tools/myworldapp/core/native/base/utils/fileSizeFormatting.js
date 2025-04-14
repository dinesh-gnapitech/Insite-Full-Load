// Copyright: IQGeo Limited 2010-2023
import { msg as mywMsg } from 'myWorld-base';

const msg = mywMsg('FileSizeFormatting');

const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];

export function formatFileSize(size) {
    if (size === '' || size === null) {
        return '';
    }
    let convertedSize = 0;
    let power = 0;
    if (size != 0) {
        // TODO We now assume that size is a number

        // To determine the units we want to display the size in,
        // calculate the logarithm of size with base 1024 and find
        // the largest integer smaller than that.
        power = Math.floor(Math.log(size) / Math.log(1024));
        if (power != 0) {
            // Anything other than bytes as units
            convertedSize = (size / Math.pow(1024, power)).toFixed(2);
        } else {
            convertedSize = size;
        }
    }
    const messageId = `size_in_${units[power]}`;
    return msg(messageId, { count: convertedSize });
}
