import React, { Component } from 'react';
import { Checkbox } from 'antd';
import { observer } from 'mobx-react';
import { localise } from '../../shared';

//Component for the editable field in the feature basic tab
@observer
@localise('features')
export class EditableFieldEditor extends Component {
    render() {
        const { msg, editable } = this.props;
        const listClass = editable ? 'noStyleList' : 'noStyleList hidden';

        const SubMenuCheckbox = props => (
            <li style={{ lineHeight: '30px' }}>
                <Checkbox
                    checked={!!editable[props.name]}
                    onChange={(...args) => this.updateVal(props.name, ...args)}
                >
                    {msg(props.name)}
                </Checkbox>
            </li>
        );

        return (
            <div>
                <Checkbox checked={!!editable} onChange={this.toggleSubMenu} />
                <ul className={listClass} style={{ marginLeft: '30px', marginTop: '-6px' }}>
                    <SubMenuCheckbox name="insert_from_gui" />
                    <SubMenuCheckbox name="update_from_gui" />
                    <SubMenuCheckbox name="delete_from_gui" />
                </ul>
            </div>
        );
    }

    toggleSubMenu = e => {
        const editable = e.target.checked;
        let changeObj;
        if (editable) {
            changeObj = {
                insert_from_gui: true,
                update_from_gui: true,
                delete_from_gui: true
            };
        }
        this.triggerChange(changeObj);
    };

    updateVal = (name, e) => {
        this.triggerChange({ [name]: e.target.checked });
    };

    triggerChange = changedValue => {
        // Should provide an event to pass value to Form.
        const onChange = this.props.onChange;
        const mergedValue = Object.assign({}, this.props.editable, changedValue);

        if (onChange) {
            onChange(changedValue ? mergedValue : false);
        }
    };
}
