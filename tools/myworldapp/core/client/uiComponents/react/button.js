// Copyright: IQGeo Limited 2010-2023
import React from 'react';
import { Button as AntButton } from 'antd';
/**
 * React button component
 * The types are restricted to ['default', 'primary', 'link', 'text'] for style consistency.
 * @param {object} props https://ant.design/components/button#api
 * @param {string} props.type 'default'|'primary'|'link'|'text'
 */
export const Button = props => {
    const { type, children, ...restProps } = props;
    const supportedBtnTypes = ['default', 'primary', 'link', 'text'];
    let btnType = type;
    if (!supportedBtnTypes.includes(type)) {
        btnType = 'default';
        console.warn(`Button with type "${type}" is not supported`);
    }
    return (
        <AntButton type={btnType} {...restProps}>
            {children}
        </AntButton>
    );
};
