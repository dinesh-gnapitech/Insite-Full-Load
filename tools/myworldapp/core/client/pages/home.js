// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import 'jquery-ui';
import 'jquery-layout';
import myw from 'myWorld/base/core';
import { localisation, msg } from 'myWorld/base/localisation';
import RestServer from 'myWorld/base/restServer';
import System from 'myWorld/base/system';

$(() => {
    const languages = $('body').data('myw-languages').split(',');
    localisation.init(['myw.client'], { languages });
    const user = $('body').data('myw-user');
    myw.currentUser = {
        username: user
    };
    homePage.createApplicationLinks();
});

/*
 * Populates the home/application-launch page
 */
const homePage = {
    async createApplicationLinks() {
        const server = new RestServer();
        const system = new System(server);

        let appName;
        let appExternalName;
        let appDescription;
        let appIconUrl;
        const urlParameters = location.search;

        await system.initialized;
        const userApplications = await system.getUserApplications();
        if (userApplications.length === 0) {
            //if the logged in user does not have access to any applicaion, display a message.
            $('#app_options').append(
                `<span class='box home-page-message'>${msg('Application', 'not_authorised')}</span>`
            );
        }

        //Alphabetise the Applications according to their names
        userApplications.sort((a, b) => {
            //Config application always shows first
            if (a.name == 'config') return -1;
            if (b.name == 'config') return 1;

            if (a.external_name < b.external_name) return -1;
            if (a.external_name > b.external_name) return 1;
            return 0;
        });

        //Creates an application box for each application the user has access to
        userApplications.forEach(userApp => {
            appName = userApp.name + '.html' + urlParameters;
            appExternalName = system.localise(
                userApp.external_name,
                `${userApp.name}.external_name`
            );
            appDescription =
                system.localise(userApp.description, `${userApp.name}.description`) || '';
            appIconUrl = userApp.icon_url;

            this.addApplicationBox(appName, appExternalName, appDescription, appIconUrl);
        });

        await localisation.ready;
        $('#logo').attr('title', msg('DesktopLayout', 'home_page'));

        // We don't use translate for the footer to give a more professional
        // look whilst loading.
        $('#built-by-footer').html(msg('Application', 'built_by_footer'));

        if (myw.currentUser.username) {
            $('#username').html(myw.currentUser.username);
            $('#user').append(
                `<a href="logout" id="logout-link">${msg('Application', 'logout_footer')}</a>`
            );
        }

        // @ts-ignore
        this.layout = $('body').layout({
            applyDefaultStyles: false,
            north: {
                enableCursorHotkey: false,
                resizable: false,
                size: 70,
                closable: false
            },
            south: {
                enableCursorHotkey: false,
                resizable: false,
                size: 18,
                closable: false
            }
        });

        $(window).on('resize', () => {
            this.layout.resizeAll();
        });
    },

    /**
     * Creates a Box on the page reprsesenting the application.
     */
    addApplicationBox(appName, appExternalName, appDescription, appIconUrl) {
        $('#app_options').append(
            `<a class='box app_options_box' href='${appName}'>` +
                `<span class='app_options_title'>${appExternalName}</span>` +
                `<span class='app_options_description'>${appDescription}</span>` +
                `<span class='app_options_icon'><img src='${appIconUrl}'></span>` +
                `</a>`
        );
    }
};
