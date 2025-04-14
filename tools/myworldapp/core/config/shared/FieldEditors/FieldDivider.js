import React, { Component } from 'react';
import { Divider } from 'antd';

export class FieldDivider extends Component {
    render() {
        return <Divider orientation="left">{this.props.args.label}</Divider>;
    }
}
