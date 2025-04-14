// Copyright: IQGeo Limited 2010-2023

import localisation from './localisation';
import platformVersionInfo from 'versionInfo';
import MywClass from 'myWorld/base/class';

const buildVersionTag = document.head.querySelector('[name=myworld-project-build-version]');
const baseUrl = '';
const version = platformVersionInfo.myw_version;
const buildVersion = buildVersionTag?.content;
const buildType = process.env.NODE_ENV;

localisation.cacheBust = buildVersion ? '?' + buildVersion : '';

/**
 * Object where feature model classes can be registered. <br/> Keyed on feature type name.
 * When a feature type is registered here, feature objects obtained from the database will inherit from the specified model.
 * @type {Object<class>}
 */
const featureModels = {};

/**
 * Object where datasource classes can be registered. <br/> Keyed on datasource type.
 * @type {Object}
 */
const datasourceTypes = {};

/**
 * Whether the current environment is the native app or not
 * @type {boolean}
 */
let isNativeApp = false;

/**
 * Object where modules can register a new tab in the Settings page of Configuration
 */
const configPagesSettingsTabs = {};

export {
    baseUrl,
    version,
    buildVersion,
    buildType,
    featureModels,
    datasourceTypes,
    isNativeApp,
    configPagesSettingsTabs
};

const core = {
    baseUrl,
    version,
    buildVersion,
    buildType,
    featureModels,
    datasourceTypes,
    isNativeApp,
    configPagesSettingsTabs,
    //TODO: remove when rest of code is import class directly
    MywClass,
    Class: MywClass
};

export default core;
