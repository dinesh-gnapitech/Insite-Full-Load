// Copyright: IQGeo Limited 2010-2023
// base myWorld code to be used in pages such as config and home
// also defines what goes into myWorld-base.min.js

import myw from 'myWorld-base';
import 'myWorld/base/database';
import 'myWorld/base/system';
import 'myWorld/base/restServer';
import 'myWorld/datasources';
import 'myWorld/base/geometry';
import 'myWorld/base/filterParser';
import 'myWorld/base/unitScale';
import 'myWorld/layers/overlay';
import 'myWorld/base/application';
import 'myWorld/base/featureNavigation';

//layouts
import 'myWorld/layouts/phone/phoneLayout';

//map
import 'myWorld/map/mapControl';
import 'myWorld/map/geoMapControl';
import 'myWorld/map/geomDrawMode';

//plugins
import 'myWorld/plugins/measureTool';

export default myw;
