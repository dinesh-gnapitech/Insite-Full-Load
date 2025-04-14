import $ from 'jquery';
import { template } from 'underscore';
import adHocQueryHtml from 'text!html/adHocQuery.html';
import { QueryRow } from './queryRow';
import { SimpleClauseView } from './simpleClauseView';
import { Predicate } from 'myWorld/base/predicate';

export class JoinClauseView extends QueryRow {
    static {
        this.prototype.joinClauseRowTemplate = template(
            $(adHocQueryHtml).filter('#ad-hoc-join-clause-row-template').html()
        );
    }

    /**
     * @class Creates editors for the join clause predicate supplied </br>
     * Create 2 branches. A branch could be a simple clause or a join clause
     * @param  {AdHocQueryDialog | JoinClauseView}    owner
     * @param  {object}                               options
     * @constructs
     * @extends {QueryRow}
     */
    constructor(owner, options) {
        super(owner, options);
        this.branches = [];
        this.render();
    }

    render() {
        super.render();

        this.joinClauseEl = this.$('.join-clause');
        if (!this.options.selectedFeature) return;

        // Display predicate
        let { predicate } = this.options;
        this.createBranch(predicate.operands[0], null, 0);
        this.createBranch(predicate.operands[1], predicate.operator, 1);
    }

    createBranch(predicate, operator, branchIndex) {
        let newRow;
        if (this._getTypeOf(predicate) === 'simple') {
            newRow = this.addSimpleClause(predicate, operator, branchIndex);
        } else {
            newRow = this.addJoinClause(predicate, operator, branchIndex);
        }
        this.branches[branchIndex] = newRow;
        this.joinClauseEl.append(newRow.$el);
    }

    _getTypeOf(predicate) {
        if (['comp_op', 'func_op', 'bool_const', 'unary_op', undefined].includes(predicate.type))
            return 'simple';
        else return 'join';
    }

    _renderRowContents() {
        return this.joinClauseRowTemplate();
    }

    addSimpleClause(predicate, operator, branchIndex) {
        return new SimpleClauseView(this, {
            showJoinOperator: !!operator,
            operator,
            selectedFeature: this.options.selectedFeature,
            predicate,
            onAdd: this.handleBranchAdd.bind(this, branchIndex),
            onRemove: this.handleBranchRemove.bind(this, branchIndex)
        });
    }

    addJoinClause(predicate, operator, branchIndex) {
        return new JoinClauseView(this, {
            showJoinOperator: !!operator,
            operator,
            selectedFeature: this.options.selectedFeature,
            predicate,
            branchIndex
        });
    }

    /**
     * Goes through all the branches and validates their values
     * @returns {boolean} Whether all the values in the join clause are valid
     */
    validateValue() {
        let isValid = false;
        this.branches.forEach(branch => {
            isValid = branch.validateValue();
        });
        return isValid;
    }

    getValue() {
        let predicate = null;
        this.branches.forEach(branch => {
            const newPred = branch.getValue();
            if (predicate === null) {
                predicate = newPred;
            } else {
                const joinOperator = branch.getPredicateOperator(); //  Expected to be 'and' or 'or'
                predicate = predicate[joinOperator](newPred);
            }
        });
        return predicate || Predicate.true;
    }

    handleBranchAdd(branchIndex, newBranchPred) {
        let newPredicate;
        const pred1 = this.branches[0].getValue();
        const pred2 = this.branches[1].getValue();
        const joinOperator = this.branches[1].getPredicateOperator();

        if (branchIndex === 0) {
            newPredicate = newBranchPred[joinOperator](pred2);
        } else {
            newPredicate = pred1[joinOperator](newBranchPred);
        }
        this.owner.handleBranchAdd?.(this.options.branchIndex, newPredicate);
        this.owner.buildDisplayFor?.(newPredicate);
    }

    handleBranchRemove(branchIndex, newBranchPred) {
        const { operator } = this.options.predicate;
        let newPredicate;
        const pred1 = this.branches[0].getValue();
        const pred2 = this.branches[1].getValue();
        if (newBranchPred)
            newPredicate =
                branchIndex === 0 ? newBranchPred[operator](pred2) : pred1[operator](newBranchPred);
        else newPredicate = branchIndex === 0 ? pred2 : pred1;

        this.owner.handleBranchRemove?.(this.options.branchIndex, newPredicate);
        this.owner.buildDisplayFor?.(newPredicate);
    }
}
