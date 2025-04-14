import React, { Component } from 'react';
import { SelectWithInput } from '../../../shared';
import { observer } from 'mobx-react';

@observer
export class EnumeratorSelect extends Component {
    render() {
        return (
            <SelectWithInput {...this.props} className={'field-picklist-select'}></SelectWithInput>
        );
    }
}
