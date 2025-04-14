// Copyright: IQGeo Limited 2010-2023
import React from 'react';
import { ConfigProvider } from 'antd';
import { theme } from './theme';
/**
 * Higher order component that wraps the component supplied with <ConfigProvider/>
 * Adds our custom theme to AntD components
 */
const withConfigProvider = Component => props =>
    (
        <ConfigProvider theme={theme}>
            <Component {...props} />
        </ConfigProvider>
    );

export default withConfigProvider;
