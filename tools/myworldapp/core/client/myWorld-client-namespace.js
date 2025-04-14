// Copyright: IQGeo Limited 2010-2023
// populates the myw namespace with the myWorld-client module (doing it in myWorld-client.js would require duplicating almost every line there))
//ENH: rename this file to myWorld-client.js and the existing myWorld-client.js to index.js ?
export * from './myWorld-client';

import myw from 'myWorld-base';
import * as client from './myWorld-client';
Object.assign(myw, client);

export default myw;
