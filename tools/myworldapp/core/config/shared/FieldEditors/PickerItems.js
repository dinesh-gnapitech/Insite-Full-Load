import React, { Component } from 'react';
import { PickerItem } from '../../shared';

/**
 * Class to create a list of pickerItem components
 * For use with Picker
 */
export class PickerItems extends Component {
    static getDerivedStateFromProps(props, state) {
        return {
            value: props.value,
            updateVal: props.onChange,
            onSelect: props.onSelect
        };
    }

    constructor(props) {
        super(props);
        this.state = {
            value: '',
            updateVal: '',
            onSelect: null
        };
    }

    render() {
        const { value, updateVal, onSelect } = this.state;
        const { id, items } = this.props;
        //Define Item
        const Item = itemProps => {
            const { name, inputs, split, widths } = itemProps;

            return (
                <PickerItem
                    name={name}
                    inputs={inputs}
                    split={split}
                    isSelected={value?.split('(')[0] === name}
                    value={value}
                    onChange={updateVal}
                    onSelect={onSelect}
                    widths={widths}
                    id={id}
                />
            );
        };
        //Change user list of items passed in as props to Item components
        return (
            <ul className="noStyleList">
                {items.map(item => {
                    return (
                        <Item
                            key={item.name}
                            name={item.name}
                            inputs={item.inputs || []}
                            split={item.split}
                            widths={item.widths ?? []}
                        ></Item>
                    );
                })}
            </ul>
        );
    }
}
