import axios from 'axios';

export const RestClient = axios.create({
    xsrfCookieName: 'csrf_token',
    xsrfHeaderName: 'X-CSRF-Token',
    withCredentials: true
});
