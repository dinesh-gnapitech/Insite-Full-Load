// Copyright: IQGeo Limited 2010-2023

export class Semaphore {
    constructor() {
        this._queue = [];
        this._locked = false;
    }

    isLocked() {
        return this._locked;
    }

    lock() {
        const p = new Promise(resolve => {
            if (!this._locked) {
                this._locked = true;
                resolve();
            } else {
                this._queue.push(resolve);
            }
        });

        return p;
    }

    unlock() {
        const resolve = this._queue.shift();
        if (resolve) {
            resolve();
        } else {
            this._locked = false;
        }
    }

    /**
     * Waits for the lock to be available, runs a function, then unlocks when done
     * @param {function} func The function to run
     * @returns {Promise<any>}
     */
    async run(func) {
        await this.lock();
        try {
            return await func();
        } finally {
            this.unlock();
        }
    }
}
