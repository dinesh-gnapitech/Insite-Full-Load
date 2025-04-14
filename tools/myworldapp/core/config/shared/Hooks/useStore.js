import React from 'react';
import { MobXProviderContext } from 'mobx-react';

export function useStore() {
    const { store } = React.useContext(MobXProviderContext);
    return { ...store, ...{ allStores: store } };
}
