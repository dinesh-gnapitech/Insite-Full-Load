// Copyright: IQGeo Limited 2010-2023
import { LoginDialog } from 'myWorld-base';

export function loginIfNecessary(restServer, options) {
    return restServer.isLoggedIn().then(isLoggedIn => {
        if (!isLoggedIn) {
            const loginDialog = new LoginDialog(restServer, options);
            return loginDialog.login();
        }
    });
}
