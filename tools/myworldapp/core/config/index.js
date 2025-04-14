import React from 'react';
import { ConfigApp } from './ConfigApp';
import { HashRouter as Router } from 'react-router-dom';
import { Provider } from 'mobx-react';
import { RootStore } from './stores/RootStore';

import './styles/index.scss';
import { ConfigProvider } from 'antd';
import { createRoot } from 'react-dom/client';

if (module.hot) {
    module.hot.accept();
}
const root = createRoot(document.getElementById('root'));
root.render(
    <Provider store={new RootStore()}>
        <Router>
            <ConfigProvider
                theme={{
                    token: {
                        borderRadius: '2px',
                        colorPrimary: '#3CA22D'
                    }
                }}
            >
                <ConfigApp />
            </ConfigProvider>
        </Router>
    </Provider>
);
