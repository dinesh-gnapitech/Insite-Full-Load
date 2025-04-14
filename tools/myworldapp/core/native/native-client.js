// Copyright: IQGeo Limited 2010-2023
// although this code will be accessed via the mywns global (as an external) we want to export for IDE support
export * from './base';
export * from './controllers';
export * from './networks';
export * from './datasources';
export * from './sync';
export * from './plugins';

import * as base from './base';
import * as controllers from './controllers';
import * as networks from './networks';
import * as datasources from './datasources';
import * as sync from './sync';
import * as plugins from './plugins';

const exports = {
    ...base,
    ...controllers,
    ...networks,
    ...datasources,
    ...sync,
    ...plugins
};

//make plugins available on myw so that existing application definitions can access them
Object.assign(global.myw, plugins);

global.mywns = exports;
