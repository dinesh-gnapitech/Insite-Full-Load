// Copyright: IQGeo Limited 2010-2023
import { trace as mywTrace, geometry, FilterParser } from 'myWorld-base';
import {
    pixelsToMetres,
    metresToEquatorialDegrees,
    metresToLatitudeCorrectedDegrees
} from './convertTolerance';
import { BaseController } from '../base/controllers';
import { Reference } from '../base';

const trace = mywTrace('selection');

export class SelectController extends BaseController {
    constructor(view) {
        super(view);
        this._featureDefsPromise = this.currentUser
            .getAppFeatureTypeDefs()
            .then(featureDefs => (this._featureDefs = featureDefs));
    }

    /**
     * Return features with a tolerance of a given point
     * @param {string} world
     * @param {number} lon
     * @param {number} lat
     * @param {number}zoom
     * @param {string[]} layerCodes
     * @param {number}pixelTolerance
     * @returns {FeatureCollection}
     */
    async selectNear(world, lon, lat, zoom, layerCodes, pixelTolerance, options = {}) {
        const { schema = 'data', featureTypes } = options;
        // Get filter clause
        // Filter out 'null' layer codes and if empty list results, return.
        layerCodes = layerCodes.filter(Boolean);

        if (layerCodes.length === 0) {
            return this._featureCollectionFrom([]);
        }

        // ensure this._featureDefs is populated
        await this._featureDefsPromise;

        const geomFields = await this._featureGeomFieldsFor(layerCodes, zoom, featureTypes);
        // Filter specific to the geom index table, for the feature types with these specific geoms.
        const filterClause = await this._filterClauseFor(geomFields);
        const toleranceInMetres = pixelsToMetres(pixelTolerance, zoom, lat);

        const unindexedFeatures = await this.unindexedRecsNear(
            world,
            lon,
            lat,
            geomFields,
            toleranceInMetres,
            schema
        );

        const indexRecords = await this.indexRecsNear(
            world,
            lon,
            lat,
            zoom,
            geomFields,
            toleranceInMetres,
            filterClause,
            schema
        );
        const indexedFeatures = (await this._featureCollectionFrom(indexRecords)).features;
        return { features: unindexedFeatures.concat(indexedFeatures) };
    }

    /**
     * Scan geometry index tables for geometries with TOLERANCE (in meters) of POINT
     * @param {string} world id of a world or null for gis world
     * @param {number} lon
     * @param {number} lat
     * @param {number} zoom
     * @param {string[]} geomFields
     * @param {number}toleranceInMetres
     * @param {string} filterClause
     * @param {string} schema
     * @returns {Promise<record[]>} geometry index records
     */
    async indexRecsNear(
        world,
        lon,
        lat,
        zoom,
        geomFields,
        toleranceInMetres,
        filterClause,
        schema = 'data'
    ) {
        if (geomFields.length === 0) {
            trace(2, 'No geometry fields to select on');
            return Promise.resolve([]);
        }
        const featureTypes = [...new Set(geomFields.map(g => g.feature_name))];
        trace(
            2,
            `Feature Selection Parameters: (${lon},${lat}),${toleranceInMetres} - ${featureTypes}, in schema ${schema})`
        );
        const point = { lng: lon, lat };
        const scanGeomTable = this.scanGeomTable.bind(
            this,
            world,
            filterClause,
            'within_dist',
            point,
            schema
        );

        let result = await scanGeomTable(toleranceInMetres, 'point');
        trace(3, 'Points found:', JSON.stringify(result));
        if (result.length > 0) return result;

        result = await scanGeomTable(toleranceInMetres, 'linestring');
        trace(3, 'Lines found:', JSON.stringify(result));
        if (result.length > 0) return result;

        result = await scanGeomTable(0, 'polygon');
        trace(3, 'Polygons found:', JSON.stringify(result));
        trace(2, 'Selection found:', JSON.stringify(result));
        return result;
    }

    /**
     * Scan geometry entry tables for features with TOLERANCE (in meters) of POINT
     * @param {string} world id of a world or null for gis world
     * @param {number} lon
     * @param {number} lat
     * @param {string[]} geomFields
     * @param {number}toleranceInMetres
     * @param {string} schema
     * @returns {object[]} feature records
     */
    async unindexedRecsNear(world, lon, lat, geomFields, toleranceInMetres, schema = 'data') {
        if (geomFields.length === 0) {
            trace(2, 'No geometry fields to select on');
            return Promise.resolve([]);
        }

        const unindexedGeomFields = geomFields.filter(ft => !ft.geom_indexed);
        const featureTypes = [...new Set(unindexedGeomFields.map(g => g.feature_name))];

        trace(
            2,
            `Feature Selection Parameters: (${lon},${lat}),${toleranceInMetres} - ${featureTypes}, in schema ${schema})`
        );
        const point = { lng: lon, lat };

        const featuresByPrioritisedGeom = { point: {}, linestring: {}, polygon: {} };
        for (let geomDef of unindexedGeomFields) {
            // ENH: find a way to optimise this to only query each feature table once, even if it
            // has multiple geoms in different categories.
            const dsName = geomDef.datasource_name;
            const featureName = geomDef.feature_name;
            const key = `${dsName}/${featureName}`;
            const featureDef = this._featureDefs[key];
            const fieldDef = featureDef.fields[geomDef.field_name];
            if (!featuresByPrioritisedGeom[fieldDef.type][key])
                featuresByPrioritisedGeom[fieldDef.type][key] = { featureDef, geomFields: [] };
            featuresByPrioritisedGeom[fieldDef.type][key].geomFields.push(geomDef.field_name);
        }

        for (let geomType of ['point', 'linestring', 'polygon']) {
            let tolerance = toleranceInMetres;
            if (geomType === 'polygon') tolerance = 0;
            const featureDefs = featuresByPrioritisedGeom[geomType];
            let featureRecs = [];
            for (const { featureDef, geomFields } of Object.values(featureDefs)) {
                featureRecs = featureRecs.concat(
                    await this.scanFeatureTable(
                        world,
                        'within_dist',
                        point,
                        schema,
                        featureDef,
                        geomFields,
                        tolerance
                    )
                );
            }
            if (featureRecs.length > 0) {
                return featureRecs;
            }
        }
        return [];
    }

    /**
     * Return selectable features inside a given bounding box
     * @param {string} worldOwnerUrn
     * @param {LatLngBounds} bounds          Bounds to select inside of
     * @param {number}zoomLevel
     * @param {string[]} layerCodes
     * @returns {FeatureCollection}
     */
    async selectWithin(worldOwnerUrn, bounds, zoomLevel, layerCodes, limit, options = {}) {
        const { schema = 'data', featureTypes } = options;
        // Get filter clause
        // Filter out 'null' layer codes and if empty list results, return.
        geometry.init(); //will be need later - start loading while we perform other calculations
        layerCodes = layerCodes.filter(Boolean);
        if (!layerCodes.length) return this._featureCollectionFrom([]);

        await this._featureDefsPromise;
        const geomFields = await this._featureGeomFieldsFor(layerCodes, zoomLevel, featureTypes);
        const filterClause = await this._filterClauseFor(geomFields);

        let unindexedFeatures = await this.unindexedRecsWithin(
            worldOwnerUrn,
            bounds,
            geomFields,
            limit,
            schema
        );

        let indexRecords = await this.indexRecsWithin(
            worldOwnerUrn,
            bounds,
            geomFields,
            filterClause,
            limit,
            schema
        );

        const indexedFeaturesCol = await this._featureCollectionFrom(indexRecords);
        const featuresCol = { features: unindexedFeatures.concat(indexedFeaturesCol.features) };
        // filter on geometries actually contained (indexRecsWithin is returning records where bounding box intersects)
        return this._onlyFullyContainedIn(featuresCol, bounds, worldOwnerUrn);
    }

    /**
     * Scan geometry index tables for geometries with TOLERANCE (in meters) of POINT
     * @param {string} world id of a world or null for gis world
     * @param {LatLngBounds} bounds          Bounds to select inside of
     * @param {string[]} geomFields
     * @param {string} filterClause
     * @returns {Promise<record[]>} geometry index records
     */
    async indexRecsWithin(world, bounds, geomFields, filterClause, limit, schema) {
        if (geomFields.length === 0) {
            trace(2, 'No geometry fields to select on');
            return Promise.resolve([]);
        }
        const featureTypes = [...new Set(geomFields.map(g => g.feature_name))];
        trace(2, `Feature Box Selection Parameters: (${bounds} - ${featureTypes})`);

        const recs = [];
        for (let geomType of ['point', 'linestring', 'polygon']) {
            const result = await this.scanGeomTable(
                world,
                filterClause,
                'covered_by',
                bounds,
                schema,
                undefined,
                geomType
            );
            recs.push(...result);

            if (limit) {
                limit -= result.length;
                if (limit <= 0) break;
            }
        }

        trace(2, 'Selection found:', JSON.stringify(recs));
        return recs;
    }

    /**
     * Scan feature tables for geometries with TOLERANCE (in meters) of POINT
     * @param {string} world id of a world or null for gis world
     * @param {LatLngBounds} bounds          Bounds to select inside of
     * @param {string[]} geomFields
     * @param {string} filterClause
     * @returns {Promise<record[]>} geometry index records
     */
    async unindexedRecsWithin(world, bounds, geomFields, limit, schema) {
        const unindexedGeomFields = geomFields.filter(ft => !ft.geom_indexed);
        const featureTypes = [...new Set(unindexedGeomFields.map(g => g.feature_name))];

        if (geomFields.length === 0 || featureTypes.length === 0) {
            trace(2, 'No unindexed geometry fields to select on');
            return Promise.resolve([]);
        }

        // Convert bounds to a proper BBox object.
        const bbox = {
            xmin: bounds.getWest(),
            xmax: bounds.getEast(),
            ymin: bounds.getSouth(),
            ymax: bounds.getNorth()
        };

        trace(
            2,
            `Feature Box Selection Parameters (unindexed): (${JSON.stringify(
                bbox
            )} - ${featureTypes}), in schema ${schema})`
        );

        let geomsByFeature = {};
        for (let geomDef of unindexedGeomFields) {
            const dsName = geomDef.datasource_name;
            const featureName = geomDef.feature_name;
            const key = `${dsName}/${featureName}`;
            const featureDef = this._featureDefs[key];
            if (!geomsByFeature[key]) geomsByFeature[key] = { featureDef, geomFields: [] };
            geomsByFeature[key].geomFields.push(geomDef.field_name);
        }

        const recs = [];
        for (const { featureDef, geomFields } of Object.values(geomsByFeature)) {
            const result = await this.scanFeatureTable(
                world,
                'covered_by',
                bbox,
                schema,
                featureDef,
                geomFields
            );

            recs.push(...result);

            if (limit) {
                limit -= result.length;
                if (limit <= 0) break;
            }
        }

        trace(2, 'Selection found:', JSON.stringify(recs));
        return recs;
    }

    /**
     * Scan geometry index table for geometries within a given tolerance of a point
     * @param {string} world
     * @param {String} filterClause
     * @param {string} scanType     'within_dist' or 'covered_by'
     * @param {object} geom     Either a point (object with 'lat' and 'lng') for 'within_dist' or a bounding box for 'covered_by'
     * @param {number} dist     Used with 'within_dist' - Tolerance in meters
     * @param {string} geomType     Geometry type
     */
    async scanGeomTable(world, filterClause, scanType, geom, schema, dist, geomType) {
        const geomClause = this._geomClausesFor(world, geomType, scanType, geom, dist);
        const masterQuery = this._masterScanQuery(world, geomType, geomClause, filterClause);
        const indexRecs = schema == 'data' ? await masterQuery.all() : [];

        const delta = this.view.delta;
        if (schema == 'data' && !delta) return indexRecs; //no need to look at delta records

        const deltaQuery = this._deltaScanQuery(
            delta,
            world,
            geomType,
            geomClause,
            filterClause,
            schema
        );
        const deltaRecs = await deltaQuery.all();
        return indexRecs.concat(deltaRecs);
    }

    /**
     * Returns query to scan a master geom index table for geometries
     * @param {string} world
     * @param {string} geomType
     * @param {object} geomClauses  Geometric constraints
     * @param {String} filterClause Attribute constraints
     * @returns {SqlQuery}
     */
    _masterScanQuery(world, geomType, geomClauses, filterClause) {
        const tableName = this._tableNameFor(world, geomType);
        const table = this._db.table(tableName);
        const query = this._scanQuery(table, world, geomClauses, filterClause, null, 'data'); //When a master scan schema will always be delta

        // Exclude shadowed records
        // ENH: Doesn't handle case where geom type has changed in delta .. or geom has been unset
        const delta = this.view.delta;
        if (delta) {
            const deltaTableName = `myw$delta_${tableName}`;
            query.where(
                `NOT EXISTS (SELECT 1 ` +
                    `FROM ${deltaTableName} delta ` +
                    `WHERE delta.delta = '${delta}' ` +
                    `  AND delta.feature_table = master.feature_table` +
                    `  AND delta.feature_id = master.feature_id)`
            );
        }

        return query;
    }

    /*
     * Returns query to scan delta geom index table for geometries
     * @param {string} delta
     * @param {string} world
     * @param {string} geomType
     * @param {object} geomClauses Geometric constraints
     * @param {String} filterClause Attribute constraints
     * @returns {SqlQuery}
     */
    _deltaScanQuery(delta, world, geomType, geomClauses, filterClause, schema) {
        const tableName = `delta_` + this._tableNameFor(world, geomType);
        const table = this._db.table(tableName);
        const query = this._scanQuery(table, world, geomClauses, filterClause, delta, schema);

        if (schema == 'data') {
            query.where({ delta });
        } else if (delta) {
            query.where(`delta != '${delta}'`);
        }

        query.where(`change_type != 'delete'`);
        return query;
    }

    /**
     * Returns query to scan given geom index table
     * @param {Table} table
     * @param {string} world
     * @param {object} geomClauses Geometric constraints
     * @param {String} filterClause Attribute constraints
     * @param {string} delta
     * @param {string} schema
     */
    _scanQuery(table, world, geomClauses, filterClause, delta, schema) {
        const options = { columns: selectColumns };
        const isMaster = schema == 'data' && !delta;
        if (isMaster) options.alias = 'master';
        const query = table.query(options);
        const { geomIndexClause, deltaGeomIndexClause, geomTestClause } = geomClauses;

        // Note the order of clauses here is vitally important for performance optimization..
        query.where(isMaster ? geomIndexClause : deltaGeomIndexClause);

        if (world) query.where({ myw_world_name: world });
        query.where(geomTestClause);
        query.where(filterClause);

        return query;
    }

    _geomClausesFor(world, geomType, scanType, geom, dist) {
        if (scanType == 'within_dist') {
            return this._withinDistClausesFor(world, geomType, geom.lng, geom.lat, dist);
        } else if (scanType == 'covered_by') {
            return this._coveredByClausesFor(world, geomType, geom);
        }

        throw new Error(`Unexpect scan type: ${scanType}`);
    }

    _withinDistClausesFor(world, geomType, lng, lat, toleranceInMetres) {
        const tableName = this._tableNameFor(world, geomType);
        // We filter geometries by a bounding box to make use of the spatial index
        // The bounding box is a rectangle. The height depends only on the required
        // tolerance. The width depends on the required tolerance and the latitude to
        // cope with stretching as we get closer to the poles.
        const latTolerance = metresToEquatorialDegrees(toleranceInMetres);
        const lngTolerance = metresToLatitudeCorrectedDegrees(toleranceInMetres, lat);
        const geomIndexClause = new String(where_rowid);
        geomIndexClause.params = {
            xmin: lng - lngTolerance,
            xmax: lng + lngTolerance,
            ymin: lat - latTolerance,
            ymax: lat + latTolerance,
            table_name: `myw$${tableName}`
        };
        const deltaGeomIndexClause = new String(where_rowid);
        deltaGeomIndexClause.params = {
            ...geomIndexClause.params,
            table_name: `myw$delta_${tableName}`
        };
        const geomTestClause = new String(where_distance);
        geomTestClause.params = {
            lng,
            lat,
            tolerance: toleranceInMetres
        };
        return { geomIndexClause, deltaGeomIndexClause, geomTestClause };
    }

    _coveredByClausesFor(world, geomType, geom) {
        const tableName = this._tableNameFor(world, geomType);
        const bbox = {
            xmin: geom.getWest(),
            xmax: geom.getEast(),
            ymin: geom.getSouth(),
            ymax: geom.getNorth()
        };

        const geomIndexClause = new String(where_rowid);
        geomIndexClause.params = {
            ...bbox,
            table_name: `myw$${tableName}`
        };
        const deltaGeomIndexClause = new String(where_rowid);
        deltaGeomIndexClause.params = {
            ...geomIndexClause.params,
            table_name: `myw$delta_${tableName}`
        };
        //without a proper geomTestClause this will return records for which the bounding box intersects the given box
        //which includes undesired results.
        //We would need to use a Spatialite function such as intersects, but these require GEOS...
        //So currently we'll have filter out the additional results afterwards with tests in JS
        // const geomTestClause = new String(
        //     'Intersects(the_geom, BuildMbr(:xmin,:ymin,:xmax,:ymax, 4326))'
        // );
        // geomTestClause.params = { ...bbox };
        return { geomIndexClause, deltaGeomIndexClause, geomTestClause: '' };
    }

    // Returns the names of the feature geom fields in layers 'layerCodes'
    // selectable at level 'zoom' and their associated filters
    async _featureGeomFieldsFor(layerCodes, zoom, featureTypes) {
        const geomFields = await this._featureGeomFields(layerCodes, zoom);
        return featureTypes?.length
            ? geomFields.filter(geomField => featureTypes.includes(geomField.feature_name))
            : geomFields;
    }

    _featureGeomFields(layerCodes, zoom) {
        let sql =
            'SELECT distinct f.datasource_name as datasource_name, f.feature_name as feature_name, lfi.field_name as field_name, ' +
            'lfi.filter_name as filter_name, fil.value as filter_value, f.geom_indexed as geom_indexed ' +
            'FROM myw$layer l, myw$layer_feature_item lfi, myw$dd_feature f ' +
            'LEFT OUTER JOIN myw$filter fil ON ' +
            'f.feature_name = fil.feature_name AND f.datasource_name = fil.datasource_name ' +
            'AND fil.name = lfi.filter_name ' +
            'WHERE l.id = lfi.layer_id AND lfi.feature_id = f.id ';

        const layers = this._layerCodesForInClause(layerCodes);
        sql += ' AND (IFNULL(lfi.min_select,l.min_scale) <= :zoom)';
        sql += ' AND (IFNULL(lfi.max_select,l.max_scale) >= :zoom)';
        sql += ` AND l.code in (${layers})`;

        return this.runSql(sql, { zoom });
    }

    /*
     * Construct section SQL that will filter on features, the geom field and filters associated to
     * the feature in layers. featureItems are the layer feature item records for the
     * all the visible layers augmented with details about any filters. It is important that we do it this way as a feature
     * might be visible in one layer and filtered but might be visible and unfiltered in another.
     */
    async _filterClauseFor(featureItems) {
        const filters = [];
        const unfilteredGeomFields = [];
        for (const featureItem of featureItems) {
            const dsName = featureItem.datasource_name;
            const featureName = featureItem.feature_name;
            const featureDef = this._featureDefs[`${dsName}/${featureName}`];
            const filter = featureItem.filter_value;

            // if (featureDef && !featureDef.unfiltered && ) {
            if (featureDef && filter) {
                const s = this._sqlForFilter(
                    '',
                    featureItem,
                    featureDef.filter_ir_map,
                    featureDef.fields,
                    this.sessionVars()
                );
                filters.push(s);
            } else {
                //unfiltered
                const tableName = this.dd.getLocalTableNameFor(
                    dsName,
                    featureItem.feature_name,
                    false
                );
                unfilteredGeomFields.push(`'${tableName}.${featureItem.field_name}'`);
            }
        }

        if (unfilteredGeomFields.length > 0)
            filters.push(
                `(feature_table || '.' || field_name in (${unfilteredGeomFields.join(',')}))`
            );

        return `( ${filters.join(' OR ')} )`;
    }

    async _featureCollectionFrom(indexRecords) {
        const seen = {};

        const features = [];
        for (const record of indexRecords) {
            // Weed out duplicates
            const tableName = record.feature_table;
            const tableMapping = this.dd.getMappingForLocalTableName(tableName);
            const dsName = tableMapping.ds_name;
            const featureName = tableMapping.feature_name;
            const uid = `${tableName}/${record.feature_id}`;
            if (seen[uid]) {
                continue;
            }
            seen[uid] = true;
            // Not a duplicate - add the feature

            const view = this._db.view(record.delta);
            const ref = new Reference(dsName, featureName, record.feature_id);
            features.push(
                await view.get(ref, {
                    includeGeoGeometry: true,
                    delta: record.delta
                })
            );
        }
        return { features };
    }

    /*
     * Returns a new feature collection which only contains features contained in a given bounds
     * @param {FeatureCollection} featureCollection
     * @param {LatLngBounds} bounds          Bounds to check features are  inside of
     * @param {string} [worldOwnerUrn='geo']
     */
    async _onlyFullyContainedIn(featureCollection, bounds, worldOwnerUrn) {
        await geometry.init();
        const xmin = bounds.getWest();
        const xmax = bounds.getEast();
        const ymin = bounds.getSouth();
        const ymax = bounds.getNorth();
        const boundsPol = geometry.polygon([
            [
                [xmin, ymax],
                [xmax, ymax],
                [xmax, ymin],
                [xmin, ymin],
                [xmin, ymax]
            ]
        ]);
        const features = featureCollection.features.filter(feature => {
            try {
                const geom = feature.getGeometryInWorld(worldOwnerUrn || 'geo');
                return geom && boundsPol.contains(geom);
            } catch (e) {
                console.log('in _onlyFullyContainedIn:', feature.geometry, e);
            }
        });
        return { features };
    }

    // Return a comma separated string of geom field ids.
    // The 'id' of geom field is <feature type>.<field name>.
    _featureGeomFieldsForInClause(geomFields) {
        return geomFields
            .filter(geomField => geomField.field)
            .map(geomField => `'${geomField.type}.${geomField.field}'`)
            .join(',');
    }

    //return as a comma separated string with each name quoted
    _layerCodesForInClause(layerCodes) {
        return layerCodes.map(code => `'${code}'`).join(',');
    }

    _sqlForFilter(tableName, filter, filterMap, fieldDefs) {
        const p = new FilterParser(filter.filter_value);
        const db = p.parse();
        return (
            `(${db.sqlFilter(tableName, filterMap, this.sessionVars())} ` +
            `AND feature_table = '${filter.feature_name}' AND field_name = '${filter.field_name}') `
        );
    }

    _tableNameFor(world, geomType) {
        return `${world ? 'int' : 'geo'}_world_${geomType}`;
    }

    /**
     * Return a list of features matching the scan query.
     * @param {string} world
     * @param {string} scanType   either 'within_dist' or 'covered_by'.
     * @param {Geometry} geom     if 'within_dist', Point, otherwise LatLngBounds
     * @param {string} schema
     * @param {feature_name, datasource_name, filter_value} featureDef
     * @param {string[]} geomFieldNames
     * @param {number} tolerance  (in metres)
     * @returns {Feature[]}
     */
    async scanFeatureTable(
        world,
        scanType,
        geom,
        schema,
        featureDef,
        geomFieldNames,
        tolerance = 0.0
    ) {
        if (scanType === 'within_dist') {
            geom = this._pointToBBox(geom, tolerance);
        }

        if (!world) world = 'geo';

        // Use feature view (which handles deltas)
        const { feature_name: fName, datasource_name: dsName, filter_value: filter } = featureDef;
        const table = this._db.view(this.view.delta, schema).table(fName, dsName);
        const appFeatureDef = await this.currentUser.getAppFeatureDef(dsName, fName);

        const query = table
            .query({ displayValues: false })
            .whereGeometryIn(geomFieldNames, world, geom)
            .orderBy([{ fieldName: appFeatureDef.key_name }]);

        if (filter) query.filter([filter.pred]);

        return query.all();
    }

    // Convert a POINT to a bbox around it where all the space within (dist + alpha) is covered.
    _pointToBBox(point, dist) {
        const distPrime = dist * 1.3;
        const approxScale = 111111;

        let radians = degrees => degrees * (Math.PI / 180);

        // These deltas are in degrees, and are accurate for small dist (less than a few thousand metres.)
        // https://gis.stackexchange.com/a/2964
        const { lng, lat } = point;
        const deltaLat = distPrime / approxScale;
        const deltaLong = distPrime / (approxScale * Math.cos(radians(lat)));

        return {
            xmin: lng - deltaLong,
            ymin: lat - deltaLat,
            xmax: lng + deltaLong,
            ymax: lat + deltaLat
        };
    }
}

const selectColumns = ['feature_id', 'feature_table'];
const where_rowid =
    'rowid IN ( SELECT rowid FROM spatialindex WHERE f_table_name = :table_name AND search_frame = BuildMbr(:xmin,:ymin,:xmax,:ymax) )';
const where_distance = 'MYW_PtDistWithin(the_geom, MakePoint(:lng,:lat,4326),:tolerance)';
