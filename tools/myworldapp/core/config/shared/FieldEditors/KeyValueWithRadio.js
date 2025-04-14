import React, { Component } from 'react';
import { KeyValueView } from '../../shared';
import { inject, observer } from 'mobx-react';

/**
 * Class to create a keyValueView with a radio button beside it
 * @param  {boolean}  props.valueIsNumber  If the value in the key value pair is always a number
 */
@inject('store')
@observer
export class KeyValueWithRadio extends Component {
    static getDerivedStateFromProps(props, state) {
        if (state?.data) return {}; //If state already is set dont mutate
        return { data: props.data };
    }

    constructor(props) {
        super(props);
        this.state = {
            data: []
        };
    }

    render() {
        return (
            <KeyValueView
                value={this.props.value}
                args={this.props.args}
                onChange={this.props.onChange}
                withRadio={true}
                data={this.state.data}
                isChecked={this.isChecked}
                handleRadioClick={this.handleRadioClick}
                updateBaseUnit={this.updateBaseUnit}
                valueIsNumber={this.props.valueIsNumber}
            ></KeyValueView>
        );
    }

    /**
     * @param {int} seq - Row in table being modified
     * @returns {boolean}
     */
    isChecked = seq => {
        const data = this.props.data;
        if (!data || !data.units) return null;

        const units = Object.keys(data.units);
        if (units.length && units[seq - 1] == data.base_unit) return true;
        else return false;
    };

    handleRadioClick = (e, rec) => {
        if (e.target.checked) {
            this.props.data.base_unit = rec.key;
        }
        this.props.onRadioChange(this.props.data);
    };

    /**
     * When the key field is changed, update base_unit to match
     */
    updateBaseUnit = (value, prevValue) => {
        let data = this.props.data;
        //if base_unit is prev value, doesnt exist, or units dont exist
        if (data.base_unit == prevValue || !data.base_unit || Object.keys(data.units).length == 0)
            data.base_unit = value;
        this.setState({ data });
    };
}
