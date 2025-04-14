import React, { Component } from 'react';
import { Button, Modal, Input } from 'antd';
import { inject } from 'mobx-react';
import { localise } from '../../../shared';
import { DropTarget } from 'react-dnd';

const fieldTarget = {
    drop(props, monitor) {
        const fieldName = monitor.getItem().name;
        const hoverIndex = props.index;
        props.dropField(props.filterValue, fieldName, hoverIndex);
    }
};

@DropTarget('fieldName', fieldTarget, (connect, monitor) => ({
    prependDropTarget: connect.dropTarget()
}))
@inject('store')
@localise('filters')
export class FeatureFilterValField extends Component {
    render() {
        const { prependDropTarget, filterValue, onChange } = this.props;

        return prependDropTarget(
            <div className="flex test-no-print">
                <Input.TextArea
                    className="ant-input filter-value"
                    rows="2"
                    value={filterValue}
                    onChange={e => onChange(e.currentTarget.value)}
                    onKeyUp={this._activateTestBtn}
                />

                <Button onClick={this._testFilterValue} disabled={!filterValue}>
                    {this.props.msg('test')}
                </Button>
            </div>
        );
    }

    /**
     * Checks if a clause is valid and returns the regexp matching result
     * @param  {string} clause [description]
     */
    _clauseMatches(clause) {
        var regexpNull = /^\s*\[(\w+)\]\s*(=|<>)\s*null\s*$/,
            regexpString = /^\s*\[(\w+)\]\s*(=|<>|like|ilike)\s*'(.+)'\s*$/,
            regexpBool = /^\s*\[(\w+)\]\s*(=)\s*(true|false)\s*$/,
            regexpNumeric = /^\s*\[(\w+)\]\s*(=|<>|>=|<=|>|<)\s*(-*[0-9]+\.?[0-9]*)\s*$/;

        return (
            regexpNull.exec(clause) ||
            regexpString.exec(clause) ||
            regexpBool.exec(clause) ||
            regexpNumeric.exec(clause)
        );
    }
    /**
     * If after the keyup the filter input has some value, activate the test button
     * If the filter input has no value disable the test button
     */
    _activateTestBtn(ev) {
        const filterValue = ev.currentTarget.value;
        const testBtn = ev.currentTarget.nextSibling;
        if (filterValue.length === 0) testBtn.setAttribute('disabled', 'disabled');
        else testBtn.removeAttribute('disabled');
    }

    /**
     * Tests the filter value
     */
    _testFilterValue = ev => {
        this.setState({ testing: true });

        const { store, msg } = this.props;
        var featureType = store.ddStore.current.name,
            filter = ev.currentTarget.previousSibling.value;

        if (store.ddStore.current.datasource === 'myworld') {
            //For myworld datasource ask the server to test the filter value
            this._checkFilter(featureType, filter)
                .then(data => {
                    if (data.result === 'ok') this._showTestMsg('success', msg('filter_success'));
                    else this._showTestMsg('error', data.result);
                })
                .catch(() => this._showTestMsg('error', msg('server_error', { filter: filter })));
        } else {
            //For other datasources just check if the filter the format is correct
            const clauses = filter.split('&');
            const matches = clauses.every(this._clauseMatches); //true if each clause matches one of the type of expressions (string/bool/numeric)

            if (matches) this._showTestMsg('success', msg('filter_success', { filter: filter }));
            else this._showTestMsg('error', msg('filter_error', { filter: filter }));
        }
    };

    /**
     * Shows the test result in a popup
     * @param  {string} type Current feature type
     * @param  {string} msg      Filter value
     */
    _showTestMsg(type, msg) {
        Modal.destroyAll();
        Modal[type]().update({
            title: this.props.msg('filter_test_title'),
            content: msg
        });
    }

    /**
     * Asks the server if the filter is correct
     * @param  {string} featureType Current feature type
     * @param  {string} filter      Filter value
     * @return {Promise}            Promise that will be resolved with true if the filter was executed with success or false otherwise
     */
    _checkFilter(featureType, filter) {
        const url = `config/dd/myworld/feature/${featureType}/check_filter?filter=${encodeURIComponent(
            filter
        )}`;
        return fetch(url).then(res => res.json());
    }
}
