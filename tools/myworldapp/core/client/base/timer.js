// Copyright: IQGeo Limited 2010-2023

const defaults = {
    repeat: false,
    immediate: false,
    interval: 100,
    errorInterval: undefined,
    logErrors: true
};

const delay = (cb, time) =>
    new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                resolve(cb());
            } catch (error) {
                reject(error);
            }
        }, time);
    });

export const timer = options => {
    options = Object.assign({}, defaults, options);
    options.errorInterval = options.errorInterval || options.interval;
    let stopped = false;
    let suspended = false;
    let triggeredOnSuspension = false;

    const promisifier = (resolve, reject) => {
        try {
            resolve(options.handler());
        } catch (error) {
            reject(error);
        }
    };
    const handler = function handler() {
        if (stopped) return;
        if (suspended) {
            triggeredOnSuspension = true;
            return;
        }

        const p = new Promise(promisifier);

        if (!options.repeat) {
            return p;
        } else {
            return p.then(
                () => delay(handler, options.interval),
                reason => {
                    if (options.logErrors) console.log('Timer handler rejected with:', reason);
                    return delay(handler, options.errorInterval);
                }
            );
        }
    };

    if (options.immediate) {
        handler();
    } else {
        delay(handler, options.interval);
    }
    return {
        stop() {
            stopped = true;
        },
        suspend() {
            suspended = true;
        },
        resume() {
            suspended = false;
            const run = triggeredOnSuspension;
            triggeredOnSuspension = false;
            if (run) handler();
        }
    };
};

export default timer;
