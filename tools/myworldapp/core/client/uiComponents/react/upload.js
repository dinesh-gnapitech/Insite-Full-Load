// Copyright: IQGeo Limited 2010-2023
import React from 'react';
import { Upload as AntUpload } from 'antd';
/**
 * React upload component
 * @param {object} props https://ant.design/components/upload#api
 */
export const Upload = props => {
    const { type, children, ...restProps } = props;
    if (type === 'dragger') {
        return <AntUpload.Dragger {...restProps}>{children}</AntUpload.Dragger>;
    } else {
        return <AntUpload {...restProps}>{children}</AntUpload>;
    }
};
