const internalName = async (options, value) => {
    let reg = /[^a-z0-9_]/;
    let errorString = 'invalid_internal_name';
    if (options.upperCaseAllowed == true) {
        reg = /[^a-zA-Z0-9_ ]/;
        errorString = 'invalid_upper_case_internal_name';
    }
    if (options.dotAllowed == true) {
        reg = /[^a-zA-Z0-9_.-]/;
        errorString = 'invalid_dot_internal_name';
    }
    if (reg.test(value)) {
        throw new Error(options.msg(errorString));
    }
};

const isInternalName = value => {
    let reg = /[^a-z0-9_]/;
    return !reg.test(value);
};

const numbers = (options, value) => {
    const reg = /^-?\d+\.?\d*$/;
    let errorString = 'invalid_number';
    if (!reg.test(value)) throw new Error(options.msg(errorString));
};

export const Validators = {
    internalName,
    isInternalName,
    numbers
};
