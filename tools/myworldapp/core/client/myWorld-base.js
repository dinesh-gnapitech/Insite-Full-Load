// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import * as base from './base/index';
export * from './base/index';

//ENH: remove when Anywhere handles authentication with pages instead of dialogs
export * from './controls/loginDialog';
import { LoginDialog } from './controls/loginDialog';
myw.LoginDialog = LoginDialog;

Object.assign(myw, base);

//alias
myw.Class = myw.MywClass;
myw.Events = myw.EventsMixin;
myw.Error = base.MywError;

//provide myw as global
global.myw = myw;

export default myw;
