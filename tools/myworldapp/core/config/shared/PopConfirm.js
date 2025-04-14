import React, { useState } from 'react';
import { Popconfirm } from 'antd';

/**
 * A component to provide a confirmation pop over for a action,
 * providing confirm or double confirm for some irreversible action.
 * Require a children accepting onClick props
 * @param {object} props
 * @param {string} props.cancelText                 The text of the Cancel button
 * @param {string} props.doubleConfirmTitle         The title of the double confirmation box
 * @param {string} props.okText                     The text of the Confirm button
 * @param {string} props.overlayClassName           Class name of the pop confirm
 * @param {string} props.placement                  The position of the tooltip relative to the target
 * @param {string} props.title                      The title of the confirmation box
 * @param {function} props.onCancel                 A callback of cancel
 * @param {function} props.onConfirm                A callback of confirmation
 * @param {boolean|function} props.onConfirmCheck           A callback of checking require a confirmation
 * @param {function} props.onDoubleConfirmCheck     A callback of checking require double confirmation
 */
export const PopConfirm = React.forwardRef(function PopConfirm(
    {
        cancelText,
        children,
        doubleConfirmTitle,
        okText,
        overlayClassName = 'myw-pop-confirm',
        placement = 'topLeft',
        title,
        onCancel,
        onConfirm,
        onConfirmCheck,
        onDoubleConfirmCheck
    },
    ref
) {
    const [visible, setVisible] = useState(false);
    const [doubleConfirm, setDoubleConfirm] = useState(false);

    const handleCancel = () => {
        onCancel?.();
        setVisible(false);
        setDoubleConfirm(false);
    };

    const handleClick = async () => {
        let requireConfirm;
        if (typeof onConfirmCheck === 'boolean') {
            requireConfirm = onConfirmCheck;
        } else {
            requireConfirm = (await onConfirmCheck?.()) ?? false;
        }

        if (requireConfirm) {
            setVisible(true);
            return;
        }

        await onConfirm?.();
    };

    const handleConfirm = async () => {
        const requireDoubleConfirm = (await onDoubleConfirmCheck?.()) ?? false;
        if (requireDoubleConfirm) {
            setDoubleConfirm(true);
            return;
        }

        setVisible(false);
        await onConfirm?.();
    };

    const handleDoubleConfirm = async () => {
        setVisible(false);
        await onConfirm?.();
    };

    // when double confirm is required, using different title and callback for antd `Popconfirm`
    const popconfirmTitle = doubleConfirm ? doubleConfirmTitle : title;
    const handlePopConfirm = doubleConfirm ? handleDoubleConfirm : handleConfirm;

    // - enforce that only receive one child button
    // - pass the onClick callback to the child button
    const mergedChildrenButton = React.cloneElement(React.Children.only(children), {
        ref,
        onClick: handleClick
    });

    return (
        <Popconfirm
            cancelText={cancelText}
            okText={okText}
            overlayClassName={overlayClassName}
            placement={placement}
            title={popconfirmTitle}
            open={visible}
            onCancel={handleCancel}
            onConfirm={handlePopConfirm}
        >
            {mergedChildrenButton}
        </Popconfirm>
    );
});
