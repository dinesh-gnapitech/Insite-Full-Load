import React, { Component } from 'react';
import { observer } from 'mobx-react';
import { DatePicker } from 'antd';
import moment from 'moment';

@observer
export class DateTimePicker extends Component {
    state = { value: null };
    static getDerivedStateFromProps(props) {
        if ('value' in props) {
            const val = props.value;
            return { value: val ? moment.utc(val).local() : null };
        }
    }

    render() {
        return (
            <DatePicker
                value={this.state.value}
                showTime={true}
                onChange={this.onChange.bind(this)}
            />
        );
    }

    onChange(date) {
        this.setState({ value: date });
        this.props.onChange(date ? date.toISOString() : null);
    }
}
