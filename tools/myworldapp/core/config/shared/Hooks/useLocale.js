import myw from 'myWorld-base';

export function useLocale(messageGroup) {
    const msg = (...args) => {
        args[0] = args[0].replace(/\./g, '_'); //because of nested fields in Form builder (ex: spec fields)
        return myw.msg(messageGroup, ...args);
    };
    return msg;
}
