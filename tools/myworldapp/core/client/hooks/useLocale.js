import { msg as mywMsg } from 'myWorld/base/localisation';

export function useLocale(messageGroup) {
    const msg = (...args) => {
        args[0] = args[0].replace(/\./g, '_'); //because of nested fields in Form builder (ex: spec fields)
        return mywMsg(messageGroup, ...args);
    };
    return { msg };
}
