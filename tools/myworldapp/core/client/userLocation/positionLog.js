export class PositionLog {
    constructor(options) {
        this.options = options;
        this._dopLog = [];
        this._accuracyLog = [];
    }

    /**
     *
     * @param {GeolocationPosition} position
     */
    add(position) {
        if ((!position.coords && !position.accuracy) || !position.timestamp)
            throw new Error(`Invalid position being added to PositionLog ${position}`);

        if (position.coords?.hdop) {
            if (this._dopLog.length == this.options.nValuesAvg) this._dopLog.splice(0, 1);
            this._dopLog.push(position);
        }

        if (position.accuracy) {
            if (this._accuracyLog.length == this.options.nValuesAvg) this._accuracyLog.splice(0, 1);
            this._accuracyLog.push(position);
        }
    }

    getAccuracy() {
        return this._avg(this._accuracyLog, p => p.accuracy);
    }

    getDop() {
        return this._avg(this._dopLog, p => p.coords.hdop);
    }

    _avg(arr, getter) {
        if (!arr.length) return undefined;
        const sum = arr.reduce((acc, el) => getter(el) + acc, 0);
        if (isNaN(sum)) return undefined;
        return sum / arr.length;
    }
}

export default PositionLog;
