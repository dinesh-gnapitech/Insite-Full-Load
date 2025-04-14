/**
 * Converts date value stored in the database to locale date string
 * Available via myw.dateUtils
 * @module dateUtils
 */
export function convertToLocalDate(value) {
    if (!value) return '';

    if (typeof value == 'string') {
        value = new Date(value);
    }
    if (value instanceof Date) {
        //the system stores dates with 1 day precision (postgresql DATE type),
        //so we shouldn't do timezone conversions or we get the previous day for any -?? timezone
        return value.toLocaleDateString(undefined, { timeZone: 'UTC' });
    }

    return value;
}
