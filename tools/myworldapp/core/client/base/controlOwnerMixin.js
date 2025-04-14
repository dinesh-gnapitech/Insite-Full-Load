// Copyright: IQGeo Limited 2010-2023

/** Behaviour for components that have child controls
 * @name ControlOwnerMixin
 * @mixin
 */
export const ControlOwnerMixin = {
    /**
     * Returns the child controls of self
     * @return {object<Control>} keyed on control id
     */
    getChildControls() {
        return this.controls || {};
    },

    /**
     * Obtains the state of the underlying controls. <br/>
     * So the state of each of them can be restored on the next session/initialization
     */
    getChildrenState() {
        const childrenState = {};

        const controls = this.getChildControls();
        //get state of controls
        Object.entries(controls).forEach(([key, control]) => {
            if (control.getState) {
                childrenState[key] = control.getState();
            }

            if (control.getChildrenState) {
                //store child controls state at top level to account for different layouts
                Object.assign(childrenState, control.getChildrenState());
            }
        });

        return childrenState;
    }
};
