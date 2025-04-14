//  The different auth methods supported by GeoServer
export const CONNECTION_METHODS = {
    NONE: 'none',
    //X509: 'x509',
    BASIC: 'basic',
    HEADERS: 'header' //  Using our current implementation, we don't need the below value
    //HEADER_CREDENTIALS: 'header_credentials'
    //DIGEST: 'digest'
};

export const GeoserverAuthDefaults = { type: CONNECTION_METHODS.NONE };

//  Generates a fetch request
export async function GeoserverImgRequest(url, authOptions) {
    authOptions = authOptions || GeoserverAuthDefaults;

    const params = {
        method: 'GET',
        headers: {}
    };

    if (authOptions.type === CONNECTION_METHODS.BASIC) {
        params.headers['Authorization'] = `Basic ${btoa(
            `${authOptions.username}:${authOptions.password}`
        )}`;
        params.credentials = 'include';
    } else if (authOptions.type === CONNECTION_METHODS.HEADERS) {
        for (const [headerName, value] of Object.entries(authOptions.header)) {
            params.headers[headerName] = value;
        }
        params.credentials = 'include';
    }

    return fetch(url, params);
}

export async function SetupImageLoad(img, url, authOptions) {
    authOptions = authOptions || GeoserverAuthDefaults;
    const res = await GeoserverImgRequest(url, authOptions).then(res => res.blob());
    const src = await new Promise((resolve, reject) => {
        try {
            const reader = new FileReader();
            reader.addEventListener('loadend', () => {
                resolve(reader.result);
            });
            reader.readAsDataURL(res);
        } catch (error) {
            reject(error);
        }
    });
    img.src = src;
}
