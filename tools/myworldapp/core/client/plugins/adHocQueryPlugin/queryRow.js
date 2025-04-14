// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import View from 'myWorld/base/view';
import adHocQueryHtml from 'text!html/adHocQuery.html';

export class QueryRow extends View {
    static {
        this.prototype.messageGroup = 'QueryRow';
        this.prototype.queryRowTemplate = template(
            $(adHocQueryHtml).filter('#ad-hoc-query-row-template').html()
        );

        this.mergeOptions({
            predicateOperators: ['and', 'or']
        });
    }

    constructor(owner, options) {
        super(options);
        this.owner = owner;
        this.app = owner?.app;
    }

    render() {
        this.$el.html(
            this.queryRowTemplate({
                showJoinOperator: this.options.showJoinOperator,
                predicateOperatorOptions: this.buildPredicateOperatorOptions(),
                rowContents: this._renderRowContents()
            })
        );

        this.predicateOperatorEl = this.$('.query-and-or');
        this.removeQueryEl = this.$('.remove-query-row');
        this.removeQueryEl.on('click', this.remove.bind(this));
    }

    _renderRowContents() {
        return 'QUERYROW';
    }

    remove() {
        this.owner.removeQueryRow(this);
    }

    hideJoinOperator() {
        this.predicateOperatorEl.parent().hide();
    }

    buildPredicateOperatorOptions() {
        const { predicateOperators, operator } = this.options;
        let operatorOptions = '';
        predicateOperators.forEach(predOp => {
            const selected = operator === predOp ? 'selected' : '';
            operatorOptions += `<option value=${predOp} ${selected}>${this.msg(predOp)}</option>`;
        });
        return operatorOptions;
    }

    getValue() {
        return null;
    }

    getPredicateOperator() {
        return this.predicateOperatorEl.val();
    }
}
