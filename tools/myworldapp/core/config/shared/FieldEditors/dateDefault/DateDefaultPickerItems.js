import { Menu } from 'antd';
import React, { useEffect, useState } from 'react';
import { DateDefaultPickerItem } from './DateDefaultPickerItem';

/**
 * Class to create a list of date default components that aid in picking a dynamic default
 * Can choose, feature creation date, a specific date, x days after date of creation and x days before date of creation
 * For use with DateDefaultPicker
 */
export const DateDefaultPickerItems = props => {
    const { onSelect, value, selectedItemName, onChange } = props;
    //----------------------------Side effects-----------------------------

    const [pickerVal, setPickerVal] = useState(value);
    useEffect(() => {
        setPickerVal(value);
    }, [value]);
    //----------------------------JSX-----------------------------
    /**
     * Items used in @Picker component for Type Picker
     */
    const Items = [
        { name: 'feature_creation_date' },
        {
            name: 'date',
            inputs: [{ type: 'text', placeholder: 'yyyy-mm-dd' }],
            widths: ['120px']
        },
        { name: 'days_after_feature_creation', inputs: [{ type: 'number' }], widths: ['85px'] },
        { name: 'days_before_feature_creation', inputs: [{ type: 'number' }], widths: ['85px'] }
    ];
    const menuItems = [];
    Items.forEach((item, index) => {
        menuItems.push({
            key: item.name,
            label: (
                <DateDefaultPickerItem
                    name={item.name}
                    inputs={item.inputs || []}
                    value={pickerVal}
                    onChange={onChange}
                    widths={item.widths ?? []}
                    isItemSelected={selectedItemName === item.name}
                />
            )
        });
        if (index !== 3) menuItems.push({ type: 'divider' });
    });

    //Change user list of items passed in as props to Item components
    return (
        <Menu
            items={menuItems}
            selectedKeys={[selectedItemName]}
            onSelect={onSelect}
            style={{ border: '1px solid #eee', borderRadius: '3px' }}
        ></Menu>
    );
};
