import React from 'react';
import { Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { PopConfirm } from './PopConfirm';

/**
 * Class that makes a delete button with a pop over confirm
 * takes a button, delete function and go back to list function as props
 * @param {object} props
 * @param {object} props.currentObj             current object from the parent form that using this component
 * @param {boolean} props.disabled              control disabling ther delete button
 * @param {function} props.goBackToList         function to go back to listing page
 * @param {string} props.id                     id using in store delete function, could be a number or string key
 * @param {function} props.msg                  function for localise
 * @param {object} props.store                  root data store
 * @param {string} props.storeName              store's name to get store from root store for current object
 * @param {function} props.onDelete             A callback of handling delete
 * @param {function} props.onDoubleConfirmCheck A callback of checking require double confirm
 *
 */
export const DeleteButton = ({
    currentObj,
    disabled,
    goBackToList,
    id,
    msg,
    store,
    storeName,
    onDelete,
    onDoubleConfirmCheck
}) => {
    if (!currentObj) return null;

    const nameField = store[storeName].nameField || 'name';

    const handleDoubleConfirmCheck = async () => {
        try {
            if (onDoubleConfirmCheck) {
                const options = await onDoubleConfirmCheck();
                return options?.showDataConfirmationDialog;
            }

            return false;
        } catch (error) {
            // when the checking is failed, allow user to continue but require a double confirmation
            return true;
        }
    };

    const handleConfirm = async () => {
        if (onDelete) {
            await onDelete();
        } else {
            await store[storeName].delete(id);
        }

        goBackToList?.();
    };

    return (
        <PopConfirm
            doubleConfirmTitle={msg('data_will_be_discarded_warning', {
                external_name: currentObj[nameField]
            })}
            cancelText={msg('confirm_no_btn')}
            okText={msg('confirm_yes_btn')}
            title={msg('delete_msg', { name: currentObj[nameField] })}
            onConfirm={handleConfirm}
            onConfirmCheck={true}
            onDoubleConfirmCheck={handleDoubleConfirmCheck}
        >
            <Button icon={<DeleteOutlined />} disabled={disabled}>
                {msg('delete_btn')}
            </Button>
        </PopConfirm>
    );
};
