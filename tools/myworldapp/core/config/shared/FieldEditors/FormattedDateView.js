import React, { Component } from 'react';
import { Input } from 'antd';
import myw from 'myWorld-base';

export class FormattedDateView extends Component {
    render() {
        return (
            <Input
                {...this.props}
                value={this.props.value && myw.Util.formatDate(this.props.value, true)}
                style={{ width: '200px' }}
            />
        );
    }
}
