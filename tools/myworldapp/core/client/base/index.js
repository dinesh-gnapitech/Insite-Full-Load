// Copyright: IQGeo Limited 2010-2023
import myw from './core';
export * from './browser';
export * from './class';
export * from './config';
export * from './database';
export * from './dbPredicate';
export * from './filterParser';
export * from './errors';
export * from './eventsMixin';
export * from './localisation';
export * from './plugin';
export * from './latLng.js';
export * from './latLngBounds.js';
export * from './predicate.js';
export * from './restServer';
export * from './redoStack';
export * from './semaphore';
export * from './system';
export * from './taskManager';
export * from './trace';
export * from './transaction';
export * from './unitScale';
export * from './usageMonitor';
export * from './internetStatusChecker';

export * as Util from './util';
export * as Browser from './browser';
export * as styleUtils from 'myWorld/styles/styleUtils';

import { isTouchDevice } from './browser';
myw.isTouchDevice = isTouchDevice;

export default myw;
