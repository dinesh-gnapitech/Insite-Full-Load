import React, { useEffect, useState } from 'react';
import { Modal, Button, Input } from 'antd';
import { DateDefaultPickerItems } from '../../../shared';
import { observer } from 'mobx-react';
import { EditOutlined } from '@ant-design/icons';

/**
 * Class that creates an input field with a button which when clicked opens a modal with pickable options.
 * The options are created by PickerItems
 */
export const DateDefaultPicker = observer(props => {
    const { value, msg, disabled, onChange, items, className } = props;
    const [pickerVal, setPickerVal] = useState(value || '');
    const [pickerVisible, setPickerVisible] = useState(false);

    //----------------------------Side effects-----------------------------
    //Figures out which item to select in the picker based on the value
    const _getSelectedItemName = () => {
        const regEx = /^\d{4}-\d{1,2}-\d{1,2}$/;
        const intVal = parseInt(value, 10);
        if (intVal === 0) {
            return 'feature_creation_date';
        } else if (value?.match && value.match(regEx) !== null) return 'date';
        if (Number.isInteger(intVal) && intVal > 0) return 'days_after_feature_creation';
        else if (Number.isInteger(intVal) && intVal < 0) return 'days_before_feature_creation';
    };

    const [selectedItemName, setSelectedItemName] = useState(_getSelectedItemName());
    useEffect(() => {
        setPickerVal(value ?? '');
    }, [value]);

    //----------------------------Helper methods-----------------------------

    const showTypePickerModal = e => {
        if (disabled) return;
        setPickerVisible(true);
    };

    const handleOk = () => {
        setPickerVisible(false);
        onChange(pickerVal);
    };

    const handleClear = () => {
        setPickerVal(null);
        setSelectedItemName(null);
    };
    const selectItem = ({ item, key, keyPath, selectedKeys, domEvent }) => {
        setSelectedItemName(key);
    };

    /**
     * Sets state back to original value, closes modal
     * @param {event} e
     */
    const handleCancel = () => {
        setPickerVal(value);
        setPickerVisible(false);
    };

    //----------------------------JSX-----------------------------
    let ModalFooterButtons = [
        <Button key="clear" onClick={handleClear}>
            {msg('clear_btn')}
        </Button>,
        <Button key="ok" type="primary" onClick={handleOk}>
            {msg('ok_btn')}
        </Button>,
        <Button key="back" onClick={handleCancel}>
            {msg('cancel_btn')}
        </Button>
    ];

    return (
        <>
            <Input
                addonAfter={<EditOutlined onClick={showTypePickerModal} />}
                value={value}
                onChange={onChange}
                style={{ verticalAlign: '-11px' }}
                disabled={disabled}
                onMouseDown={e => e.target.focus()}
                title={pickerVal} //tooltip to display full value in case value does not fit in the column
            />

            <Modal
                width={500}
                className={'type-picker-modal ' + (className || '')}
                title={msg('choose_field', { type: 'default' })}
                open={pickerVisible}
                onCancel={handleCancel}
                footer={ModalFooterButtons}
            >
                <DateDefaultPickerItems
                    value={pickerVal}
                    onSelect={selectItem}
                    onChange={setPickerVal}
                    items={items}
                    selectedItemName={selectedItemName}
                />
            </Modal>
        </>
    );
});
