// Copyright: IQGeo Limited 2010-2023
import MywClass from 'myWorld/base/class';
import { RedoStack } from 'myWorld/base/redoStack';
import { FeatureSet } from 'myWorld/features/featureSet';

export class FeatureNavigation extends MywClass {
    /**
     * @class Manages a stack of browsed features<br/>
     *        Its updated when a new feature/featureset is browsed
     *        Its current index is updated when the application's prevResult and nextResult buttons are used
     * @param  {Application} owner  The application
     * @constructs
     */
    constructor(owner) {
        super();
        const app = (this.app = owner.app);

        this.queryStack = new RedoStack();

        const that = this;

        this.featureDetailsControl = owner;

        //Flag to denote if the feature change event is from the navigation functions
        //The query stack should only be updated when this flag is not set to true
        this.isNav = false;

        //setup handlers for application events
        app.on('currentFeature-changed currentFeatureSet-changed', () => {
            that.updateQueryStack();
        });
        app.on('currentFeature-deleted', () => {
            that.queryStack.pop();
        });
        app.on('nativeAppMode-changed', () => {
            //ENH: instead of clearing navigation, handle different mode
            that.queryStack.empty();
        });
    }

    /**
     * Updates the stack as and when new elements are browsed
     * Called by the 'currentFeature-changed' and the 'currentFeatureSet-changed' events listeners
     */
    updateQueryStack() {
        const app = this.app;

        if (this.isNav) {
            this.isNav = false;
            return;
        }
        // Abort -- if the current feature matches the last one in the stack
        if (this.currentObjectMatchesLast()) return;

        const stackItem = {
            currentFeatureSet: app.currentFeatureSet.clone(),
            totalCount: app.currentFeatureSet.totalCount,
            currentQueryDetails: app.getCurrentQueryDetails(),
            currentFeature: app.currentFeature,
            isNothing: false
        };

        this.discardVoidItem();

        if (stackItem.currentFeature === null && stackItem.currentFeatureSet.items.length === 0) {
            stackItem.isNothing = true;
        }

        this.queryStack.push(stackItem);
        this.isNav = false;
    }

    /**
     * Checks if the currentFeature matches the last one in the stack.
     * @return {Boolean} True is the currentFeature is the last item in the stack
     */
    currentObjectMatchesLast() {
        const currentStackItem = this.queryStack.current();
        return (
            currentStackItem &&
            currentStackItem.currentFeature &&
            currentStackItem.currentFeature === this.app.currentFeature
        );
    }

    /**If the latest element in the stack shouldn't be archived, discard it.
     * @private
     */
    discardVoidItem() {
        const currentStack = this.queryStack.current() ? this.queryStack.current() : 0;
        //discarding 'Nothing to display' view and an empty form
        if (currentStack !== 0 && (currentStack.isNothing || currentStack.currentFeature?.isNew)) {
            this.queryStack.pop();
        }
    }

    /** Updates the results displayed when the navigation buttons are clicked */
    updateResults(navDirection) {
        const app = this.app;
        let resultObj;
        let queryDetails;

        this.isNav = true;
        //Updates stack according to the navigation direction
        if (navDirection == 'previous') {
            if (this.queryStack.hasUnDo()) {
                this.discardVoidItem();
                resultObj = this.queryStack.unDo();
            } else {
                resultObj = { currentFeatureSet: new FeatureSet() };
            }
        } else {
            if (this.queryStack.hasReDo()) {
                resultObj = this.queryStack.reDo();
            }
        }

        if (!resultObj) return;

        //"inform" the database of the "new" current query details
        queryDetails = resultObj.currentQueryDetails;

        //ENH: We should also check whether the feature is still available in the database
        const { currentFeature, currentFeatureSet } = resultObj;
        currentFeatureSet.refresh(); // updated features might have a different (qualified) urn, for example when edited in a design

        if (currentFeature !== null) {
            if (currentFeature !== app.currentFeature) {
                //we have a feature and it's different
                app.setCurrentFeatureSet(currentFeatureSet, {
                    currentFeature,
                    queryDetails,
                    edit: false
                });
            } else {
                //We have the same feature
                app.setCurrentFeatureSet(currentFeatureSet, { queryDetails });
            }
        } else {
            // feature is null
            app.setCurrentFeatureSet(currentFeatureSet, { queryDetails });
        }
    }

    previous() {
        return this.queryStack.previous();
    }
}

export default FeatureNavigation;
