import React, { Component, Fragment } from 'react';
import { Input } from 'antd';
import FeatureSelect from './FeatureSelect';

/*
A basic wrapper for most text inputs
*/
const TextInput = props => {
    const { id, defaultValue, onChange } = props;
    const width = props.width ?? id == 'type' ? 70 : 'calc(100% - 20px)'; //set input field width. If not typePicker, then input field is the whole width of the modal

    return <Input style={{ width }} defaultValue={defaultValue} onChange={onChange} />;
};

export class PickerItem extends Component {
    /**
     * An item in the picker list
     * Could be just text or text with one or more text inputs or dropdowns
     * @param {object} props
     * @param {boolean} props.isSelected      Whether the item is selected in the list
     * @param {Array<String>} props.inputs    List of input types('text'|'featureList')
     * @param {boolean} [props.split = true]  Whether the value has multiple params in it and should be split
     */
    constructor(props) {
        super(props);
        const { isSelected, inputs, split = true } = this.props;
        const value = isSelected ? this.props.value : '';

        const selectedValParts = value.split('(');
        this.vals = []; //List of params in the selected value

        if (selectedValParts.length > 1) {
            const regExp = /\(([^)]+)\)/;
            const matches = regExp.exec(value);
            if (matches) {
                if (inputs[0] === 'featurelist') {
                    this.vals.push(matches[1].split(','));
                } else {
                    this.vals = split ? matches[1].split(',') : [matches[1]];
                }
            }
        }

        this.doubleLined = inputs.includes('featurelist');
    }

    /**
     * Selects the item and marks its value as the Picker's currentValue
     */
    selectItem = ev => {
        this.props.onSelect(this.getItemVal());
    };

    /**
     * Marks its value as the Picker's currentValue
     */
    updateTextInputVal(index, ev) {
        this.vals[index] = ev.target.value;
        this.props.onChange(this.getItemVal());
    }

    /**
     * Marks its value as the Picker's currentValue
     */
    updateSelectInputVal(index, value) {
        this.vals[index] = value;
        this.props.onChange(this.getItemVal());
    }

    getItemVal() {
        const { name, inputs } = this.props;

        const vals = this.vals.map((val, index) => {
            switch (inputs[index]) {
                case 'featurelist':
                    return val.join(',');

                case 'input':
                case 'feature':
                default:
                    return val;
            }
        });
        const joined = vals.join(',');

        if (!inputs.length) return name;
        return `${name}(${joined})`;
    }

    render() {
        const { name, inputs, isSelected, widths, id } = this.props;
        const itemClass = `type-picker-item${this.doubleLined ? '-large' : ''}${
            isSelected ? ' item-selected' : ''
        }`;

        //Define input component
        const PickerInput = props => {
            const { type, index, defaultValue } = props;
            const width = widths[index];
            switch (type) {
                case 'feature':
                    return (
                        <FeatureSelect
                            id={id}
                            width={width}
                            defaultValue={defaultValue}
                            onChange={(...args) => this.updateSelectInputVal(index, ...args)}
                        />
                    );

                case 'featurelist':
                    return (
                        <FeatureSelect
                            id={id}
                            width={width}
                            defaultValue={defaultValue}
                            multiple={true}
                            onChange={(...args) => this.updateSelectInputVal(index, ...args)}
                        />
                    );

                case 'input':
                default:
                    return (
                        <TextInput
                            id={id}
                            width={width}
                            defaultValue={defaultValue}
                            onChange={(...args) => this.updateTextInputVal(index, ...args)}
                        />
                    );
            }
        };

        // Create coresponding inputs
        return (
            <li className={itemClass} key={name}>
                <div className={'flex'} style={{ height: this.doubleLined ? 80 : 40 }}>
                    <span className="typeTitle" onClick={this.selectItem}>
                        {name}
                    </span>
                    {inputs.length ? (
                        <span className={'input-punctuation-container'}>
                            <span className="punctuation"> ( </span>
                            {inputs.map((type, index) => (
                                <Fragment key={index}>
                                    {index ? <span className="punctuation"> , </span> : null}
                                    <PickerInput
                                        type={type}
                                        index={index}
                                        defaultValue={this.vals[index]}
                                    />
                                </Fragment>
                            ))}
                            <span className="punctuation"> )</span>
                        </span>
                    ) : null}
                </div>
            </li>
        );
    }
}
