import React, { useState } from 'react';
import { Input, Tooltip } from 'antd';
import { useLocale } from '../../Hooks/useLocale';
import { InfoCircleOutlined } from '@ant-design/icons';

/**
 * An item in the default date picker list
 * @param {object} props
 * @param {Array<String>} props.inputs    List of inputs
 */
export const DateDefaultPickerItem = props => {
    const msg = useLocale('dateDefaultPickerItem');

    const { name, value, inputs, widths, onChange, isItemSelected } = props;
    const [itemVal, setItemVal] = useState(isItemSelected ? value : '');
    const [isValid, setIsValid] = useState(true);

    //----------------------------Helper methods-----------------------------
    /**
     * Selects the item and marks its value as the Picker's currentValue
     */
    const selectItem = () => {
        onChange(getItemVal());
    };

    /**
     * Marks its value as the Picker's currentValue
     */
    const updateTextInputVal = ev => {
        setIsValid(ev.target.validity.valid);
        const inputVal = ev.target.value;
        setItemVal(inputVal);
        onChange(getItemVal(inputVal));
    };

    //formats value
    const getItemVal = x => {
        const val = x || itemVal;
        const { name } = props;
        switch (name) {
            case 'feature_creation_date':
                return 0;
            case 'days_before_feature_creation':
                return val ? val * -1 : val;
            default:
                return val;
        }
    };

    //----------------------------JSX-----------------------------
    const min = 1;
    const max = 10000000;
    // Create coresponding inputs
    return (
        <div onClick={selectItem} className={'flex date-default-row'} style={{ height: 40 }}>
            {name === 'date' && <div className="date-default-label">{msg(name)}</div>}
            {inputs.length ? (
                <Input
                    type={name === 'date' ? 'text' : 'number'}
                    style={{ width: widths[0] }}
                    defaultValue={getItemVal()}
                    onChange={updateTextInputVal}
                    placeholder={inputs[0].placeholder}
                    min={name === 'date' ? undefined : min}
                    max={name === 'date' ? undefined : max}
                    suffix={
                        !isValid && (
                            <Tooltip title={msg('date_default_min_max', { min, max })}>
                                <InfoCircleOutlined style={{ color: 'red' }} />
                            </Tooltip>
                        )
                    }
                />
            ) : null}
            {name !== 'date' && <div className="date-default-label">{msg(name)}</div>}
        </div>
    );
};
