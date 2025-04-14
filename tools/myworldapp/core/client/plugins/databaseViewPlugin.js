// Copyright: IQGeo Limited 2010-2023
import { Plugin } from 'myWorld-base';

// Plugin for keeping current delta across sessions
//
export class DatabaseViewPlugin extends Plugin {
    static {
        this.mergeOptions({
            delta: ''
        });
    }

    constructor(owner, options) {
        super(owner, options);

        //set delta from state, first checking if url specifies a delta, to avoid sending spurious render requests
        if (!this.app.getUrlParam('delta')) {
            const delta = (options || this.options).delta;
            this.app.setDelta(delta);
        }
    }

    // Returns saved state
    getState() {
        return { delta: this.app.getDelta() };
    }

    setState(state) {
        this.app.setDelta(state.delta);
    }
}

export default DatabaseViewPlugin;
