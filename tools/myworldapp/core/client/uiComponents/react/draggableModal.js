// Copyright: IQGeo Limited 2010-2023
import { Modal as AntModal } from 'antd';
import React, { useRef, useState } from 'react';
import Draggable from 'react-draggable';

/**
 * React draggable modal component
 * The rest of the application can still be accessed when the modal is active
 * @component
 * @param {{
 *  title: string,
 *  [modalContainerName='']: string
 *  restProps: object (https://ant.design/components/modal#api)
 * }}
 * @returns A draggable modal component
 */
export const DraggableModal = ({ title, modalContainerName = '', children, ...restProps }) => {
    const draggleRef = useRef(null);
    const [bounds, setBounds] = useState({ left: 0, top: 0, bottom: 0, right: 0 });

    //Source: https://ant.design/components/modal#components-modal-demo-width
    const handleStart = (_event, uiData) => {
        const { clientWidth, clientHeight } = window.document.documentElement;
        const targetRect = draggleRef.current?.getBoundingClientRect();
        if (!targetRect) return;

        setBounds({
            left: -targetRect.left + uiData.x,
            right: clientWidth - (targetRect.right - uiData.x),
            top: -targetRect.top + uiData.y,
            bottom: clientHeight - (targetRect.bottom - uiData.y)
        });
    };

    return (
        <AntModal
            {...restProps}
            mask={false}
            maskClosable={false}
            getContainer={document.getElementById(modalContainerName)}
            modalRender={modal => (
                <Draggable handle={'.ant-modal-header'} bounds={bounds} onStart={handleStart}>
                    <div ref={draggleRef}>{modal}</div>
                </Draggable>
            )}
            title={<div style={{ width: '100%', cursor: 'move' }}>{title}</div>}
        >
            {children}
        </AntModal>
    );
};
