// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld/base/core';
import localisation from 'myWorld/base/localisation';

myw.baseUrl = '../../'; //this page will be based on .../auth/anywhere/

$(async () => {
    const languages = $('body').data('myw-languages').split(',');
    await localisation.init(['myw.client'], { languages });
    localisation.translate('login', $('body'));
    $('#anywhere-sso-reload').attr('value', localisation.msg('login', 'anywhere_sso_button'));

    setTimeout(() => {
        window.location = $('body').data('myw-anywhere-url');
    }, 10);
});
