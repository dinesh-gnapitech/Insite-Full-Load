// Copyright: IQGeo Limited 2010-2023
import { sortBy } from 'underscore';
import difflib from '../libs/difflib';
import { BaseController } from '../base/controllers';
import { localisation } from 'myWorld-base';

const bookmarkSql =
    'select id, myw_search_desc1, myw_search_val1, username, is_private from myw$bookmark' +
    ' where (username = :username or is_private = 0)';

const querySql =
    'select id, myw_search_desc1, myw_search_val1, myw_object_type, attrib_query from myw$query';

export class SearchController extends BaseController {
    constructor(view, dsName) {
        super(view);
        this.dsName = dsName;
    }

    /**
     * Searches the database for queries, bookmarks and features
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     */
    async search(termString, username, options) {
        this.limit = options.limit || 10;
        this.inWindow = false;
        this.inSelection = false;
        this.geomRestricted = false;

        this.termString = this._identifyQuerySearch(termString);
        const terms = this.termString.split(' ').filter(Boolean);

        if (terms.length === 0) return [];

        const featureTypes = await this._getFeatureTypes();
        return this._search(terms, username, featureTypes);
    }

    /**
     * Searches the database for queries, bookmarks and features
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     */
    async _search(terms, username, featureTypes) {
        const lang = this._getLanguageFor(localisation.language);

        const queries = await this.querySuggestions(terms, featureTypes, lang);
        // if the terms include "in ???" statements, only return query suggestions
        // both as true happens when the term finishes with " in" - in this situation "in" might be part of another word so fetch other suggestions as well
        if (this.inWindow !== this.inSelection) {
            return queries; // Don't bother with other searches
        }

        return Promise.all([
            this.bookmarkSuggestions(terms, username),
            this.featureSuggestions(terms, lang)
        ]).then(results => {
            const [bookmarks, featureSuggestions] = results;
            return [].concat(queries, bookmarks, featureSuggestions);
        });
    }

    /**
     * Searches for features (with search rules) matching the provided search terms
     * @return {Promise<urn[]>}  Promise for a list of urns
     */
    async features(termString, username, options) {
        const lang = this._getLanguageFor(localisation.language);
        this.limit = options.limit || 200;
        this.termString = termString.replace(/\s+/g, ' '); // removes extra whitespace
        const terms = this.termString.split(' ').filter(Boolean);
        if (terms.length === 0) return Promise.resolve([]);

        const searchRecords = await this.indexRecsFor(terms, lang);
        //convert to list of urns
        return searchRecords.map(searchRecord => {
            const localTableName = searchRecord.feature_name;
            const featureType = this.dd.getFeatureTypeForLocalTableName(localTableName);
            return `${featureType}/${searchRecord.feature_id}`;
        });
    }

    /**
     * Parses the search terms handling ' in window' etc...
     * Sets properties inWindow, inSelection and geomRestricted
     * @param  {string} termString Search terms - text by user
     * @return {string}            Terms to actually search on
     */
    _identifyQuerySearch(termString) {
        termString = termString.replace(/\s+/g, ' '); // removes extra whitespace
        const index = termString.indexOf(' in');

        if (index > 1) {
            const inStatement = termString.substring(index);
            if (inStatement === ' in window') {
                this.inWindow = true;
            }
            if (inStatement === ' in selection') {
                this.inSelection = true;
            }
            this.geomRestricted = this.inWindow || this.inSelection;

            //exclude the "in ..." from the search terms
            //we keep it if the statement is just "in" (in that situation both inSelection and inWindow are True) as it could
            //be part of a an actual search term, but we then exclude when getting the query suggestions
            if (this.inSelection != this.inWindow) {
                termString = termString.substring(0, index);
            }
        }
        return termString;
    }

    /**
     * Searches for queries matching the given terms
     * @return {Promise<Array<querySuggestion>>}
     */
    async querySuggestions(terms, featureTypes, lang) {
        const params = {};
        let termsSql;
        let sql;

        terms = terms.filter(term => term != 'in');
        termsSql = this._getSearchTermsSQL(terms, params);
        sql = `${querySql} WHERE datasource_name='${this.dsName}'`;
        if (termsSql) sql += `AND ${termsSql}`;

        const featureTypesString = this._featureTypesAsString(featureTypes);
        sql +=
            ` AND myw_object_type IN (${featureTypesString}) ` +
            `AND lang = '${lang}' ` +
            `LIMIT ${this.limit}`;

        const results = await this.runSql(sql, params);
        const sortedResults = sortBy(results, this.similarity(terms, 'myw_search_desc1'));
        //ENH: looks like could just be a .map call if _addQuerySuggestion was converted to _getQuerySuggestion
        const suggestions = [];
        for (const result of sortedResults) {
            this._addQuerySuggestion(result, suggestions);
        }
        return suggestions;
    }

    /**
     * Searches for bookmarks matching the given terms
     * @return {Promise<Array<bookmarkSuggestion>>}
     */
    async bookmarkSuggestions(terms, username) {
        if (this.dsName !== 'myworld') {
            //ENH: Do this in proxyDatasource
            return Promise.resolve([]); //Don't search for bookmarks in external datasources
        }

        const params = { username };
        const termsSql = this._getSearchTermsSQL(terms, params);
        const sql = `${bookmarkSql} and ${termsSql} limit ${this.limit}`;
        const recs = await this.runSql(sql, params);
        const results = recs.map(record => {
            let label = record.myw_search_desc1;
            if (record.is_private === 0) {
                label = `${record.myw_search_desc1} (${record.username})`;
            }
            return {
                label,
                value: record.myw_search_val1,
                data: {
                    type: 'bookmark',
                    id: record.id
                }
            };
        });
        return sortBy(results, this.similarity(terms, 'label'));
    }

    /**
     * Searches for features matching the given terms
     * @return {Promise<Array<featureSuggestion>>}
     */
    async featureSuggestions(terms, lang) {
        const dd = this.dd;
        const getFeatureUrn = searchStringRecord => {
            const localTableName = searchStringRecord.feature_name;
            const featureType = dd.getFeatureTypeForLocalTableName(localTableName);
            return `${featureType}/${searchStringRecord.feature_id}`;
        };

        const recs = await this.indexRecsFor(terms, lang);
        //convert the results to the expected format
        return recs.map(record => ({
            label: record.search_desc,
            value: record.search_val,

            data: {
                type: 'feature',
                urn: getFeatureUrn(record)
            }
        }));
    }

    // Returns the SQL to filter on search terms (for query and bookmark searches)
    // Sets the term values in params.
    _getSearchTermsSQL(terms, params) {
        let sql = '';
        let prefix = '';
        for (const [index, value] of Object.entries(terms)) {
            const termName = `term${index}`;
            params[termName] = `%${value}%`;
            sql += `${prefix}myw_search_val1 like :${termName}`;
            prefix = ' and ';
        }
        return sql;
    }

    _addQuerySuggestion(queryRecord, suggestions) {
        if (!this.geomRestricted || this.inWindow) {
            suggestions.push(this._asQuerySuggestion(queryRecord, 'window'));
        }
        if (!this.geomRestricted || this.inSelection) {
            suggestions.push(this._asQuerySuggestion(queryRecord, 'selection'));
        }
        if (!this.geomRestricted) {
            suggestions.push(this._asQuerySuggestion(queryRecord, null));
        }
    }

    _asQuerySuggestion(queryRecord, spatialRestriction) {
        let valueSuffix = '';
        if (spatialRestriction) {
            valueSuffix = ` in ${spatialRestriction}`;
        }
        return {
            label: queryRecord.myw_search_desc1,
            value: queryRecord.myw_search_val1 + valueSuffix,
            data: {
                type: 'query',
                id: queryRecord.id,
                feature_type: queryRecord.myw_object_type,
                filter: queryRecord.attrib_query,
                spatial_restriction: spatialRestriction
            }
        };
    }

    /**
     * Feature search index records matching given terms, excluding duplicates
     * @param {string[]} terms
     */
    async indexRecsFor(terms, lang) {
        const filterSql = await this._featureTypeFilter(lang);
        if (!filterSql) return []; //no search rules matching the feature types -> no results
        const queries = this.indexQueriesFor(terms);

        const foundKeys = new Set();
        const suggestions = [];
        for (const value of queries) {
            const { query } = value;
            if (suggestions.length > this.limit) return suggestions;

            let records = await query.where(filterSql).limit(this.limit).all();
            records = this.alphabeticalSort(records, item => item.search_desc);
            records.forEach(rec => {
                //Check for enough found
                if (suggestions.length >= this.limit) return;

                //check for duplicates
                const key = `${rec.feature_name} ${rec.feature_id} ${rec.label}`;
                if (foundKeys.has(key)) return;

                foundKeys.add(key);
                suggestions.push(rec);
            });
        }
        return suggestions;
    }

    /**
     * Queries to get search index records
     * @param {string[]} terms
     * @returns {SqlQuery[]}
     */
    indexQueriesFor(terms, lang) {
        const delta = this.view.delta;
        const queries = [];

        //start with an exact (full string) match query.
        //Ensures if there are exact matches that they show in the results - if there were too many partial matches there'd be no guarantee the exact ones would be obtained first
        // using a LIKE  clause instead of equals ('=') as for some reason sqlite is not using the index when equals is used. see #
        let filter = new String('search_val LIKE :searchTerm');
        filter.params = { searchTerm: this.termString };
        queries.push(...this._indexQueriesForFilter('exact', delta, filter));

        //then try a partial match for the whole string
        filter = new String('search_val LIKE :searchTerm');
        filter.params = { searchTerm: `${this.termString}%` };
        queries.push(...this._indexQueriesForFilter('starts_with', delta, filter));

        if (terms.length > 1) {
            const filter = this._multipleWordsFilter(terms);
            queries.push(...this._indexQueriesForFilter('terms', delta, filter));
        }

        return queries;
    }

    /*
     * Queries to get search index records for a given filter
     * @param {string[]} terms
     * @returns {object[]} Each item is {group, query}
     */
    _indexQueriesForFilter(group, delta, filter) {
        const queries = [];
        const masterQuery = this._db
            .table('search_string')
            .query({ alias: 'master' })
            .where(filter);
        if (delta) {
            const shadowedSql =
                `NOT EXISTS (SELECT 1 ` +
                `FROM myw$delta_search_string delta ` +
                `WHERE delta.delta = '${delta}' ` +
                `  AND delta.feature_name = master.feature_name` +
                `  AND delta.feature_id = master.feature_id)`;
            masterQuery.where(shadowedSql);
            const deltaTable = this._db.table('delta_search_string');
            const deltaQuery = deltaTable
                .where({ delta })
                .where(`change_type != 'delete'`)
                .where(filter);
            queries.push({ group, query: deltaQuery });
        }
        queries.push({ group, query: masterQuery });
        return queries;
    }

    /*
     * build sql filter to select search string records for current users' feature types
     * @return {Promise<string>} sql to use in a WHERE clause
     */
    async _featureTypeFilter(lang) {
        const featureDefs = await this.currentUser.getAppFeatureTypeDefs();
        let unfilteredIds = [];
        const authFilters = [];
        Object.values(featureDefs).forEach(featureDef => {
            if (featureDef.datasource_name != this.dsName) return;

            const searchRuleIds = featureDef.local_search_rules
                .filter(rule => rule.lang == lang)
                .map(rule => rule.id);

            if (featureDef.unfiltered) {
                unfilteredIds = unfilteredIds.concat(searchRuleIds);
            } else {
                authFilters.push(this._authFilterFor(featureDef));
            }
        });

        //add clause for unfiltered feature types
        if (unfilteredIds.length) {
            //convert search rule ids to strings so that the optimizer doesn't use the
            //the primary key index. Using the rule ids index slows the queries consistently
            unfilteredIds = unfilteredIds.map(id => `'${id}'`);
            authFilters.unshift(`search_rule_id||'' IN (${unfilteredIds})`);
        }
        if (authFilters.length) return `( ${authFilters.join(' OR ')} )`;
        else return null;
    }

    /*
     * build sql filter to select search string records for current users' feature types
     * @return {string} sql to use in a WHERE clause
     */
    _authFilterFor(featureDef) {
        const searchRuleIds = featureDef.local_search_rules.map(r => r.id);

        const filterSql = featureDef.filters.map(aFilter => {
            const sql = aFilter.pred.sqlFilter(
                'myw$search_string',
                featureDef.filter_ir_map,
                this.sessionVars()
            );
            return `(${sql})`;
        });

        return `((${filterSql.join(' OR ')}) AND search_rule_id IN (${searchRuleIds}))`;
    }

    /*
     * Returns a search_string query where one of the terms matches the beginning of
     * search_val and all of the others match somewhere in extra_value
     * @return {sqlQuery}
     */
    _multipleWordsFilter(terms) {
        const params = {};
        const orClauses = [];
        terms.forEach((outerTerm, outerIndex) => {
            const andClauses = [];
            params[`startsWith${outerIndex}`] = `${outerTerm}%`;
            params[`contains${outerIndex}`] = `%${outerTerm}%`;
            terms.forEach((innerTerm, innerIndex) => {
                let clauseSql;
                if (innerTerm == outerTerm) {
                    clauseSql = `search_val like :startsWith${innerIndex}`;
                } else {
                    clauseSql = `extra_values like :contains${innerIndex}`;
                }
                andClauses.push(clauseSql);
            });
            const joinedAndClauses = andClauses.join(' and ');
            orClauses.push(`(${joinedAndClauses})`);
        });
        const joinedOrClauses = orClauses.join(' or ');
        const sql = new String(`(${joinedOrClauses})`);
        sql.params = params;

        return sql;
    }

    _featureTypesAsString(featureNames) {
        //return as a comma separated string with each name quoted
        return featureNames.reduce(
            (memo, featureName) => `'${featureName}'${memo ? `,${memo}` : ''}`,
            ''
        );
    }
    async _getFeatureTypes() {
        const featureDefs = await this.currentUser.getAppFeatureTypeDefs();
        return Object.values(featureDefs)
            .filter(featureDef => featureDef.datasource_name === this.dsName)
            .map(f => f.feature_name);
    }
    _getValidFeatureTypes(featureTypes) {
        //ENH: Should remove from the list any feature types which aren't available
        // to the user. For now we assume that we can trust the input list.
        return Promise.resolve(featureTypes);
    }

    similarity(terms, property_name) {
        // Returns a lambda which calculates the ratio of how similar a record is from terms
        // The record is compared by accessing its 'label' property (which should be a string).
        // Values will range from -1 (identical) to 0 (no similarity)
        const termsString = terms.join(' ');
        return record => {
            const matcher = new difflib.SequenceMatcher(termsString, record[property_name]);
            return -matcher.ratio();
        };
    }

    // ENH: Extract to separate class
    alphabeticalSort(items, propertyGetter) {
        let index = 0;
        const itemsWithKeys = items.map(item => {
            index += 1;
            const key = this._calculateKeyForAlphabeticalSort(propertyGetter(item));
            return { key, index, value: item };
        });
        const sorted = itemsWithKeys.sort((a, b) => {
            const result = this._arraySorter(a.key, b.key);
            if (result !== 0) {
                return result;
            }
            if (a.index < b.index) {
                return -1;
            }
            if (a.index > b.index) {
                return 1;
            }
            return 0;
        });

        return sorted.map(item => item.value);
    }

    _calculateKeyForAlphabeticalSort(value) {
        const words = value.toLowerCase().split(' ');
        return words.map(word => {
            if (!isNaN(word)) {
                const floatVal = parseFloat(word);
                if (!isNaN(floatVal)) {
                    return floatVal;
                }
            }
            return word;
        });
    }

    _arraySorter(a, b) {
        // a and b are arrays
        let index = 0;
        const minLen = Math.min(a.length, b.length);
        while (index < minLen) {
            if (a[index] < b[index]) {
                return -1;
            }
            if (a[index] > b[index]) {
                return 1;
            }
            index++;
        }
        if (a.length < b.length) {
            return -1;
        }
        if (a.length > b.length) {
            return 1;
        }
        return 0;
    }

    /*
     * Given a request's user language returns what language identifier to use when searching the database
     * @param {string} userLanguage
     */
    _getLanguageFor(userLanguage) {
        if (this._db.languages.includes(userLanguage)) return userLanguage;
        const lang = userLanguage.split('-')[0];
        if (this._db.languages.includes(lang)) return lang;
        return this._db.defaultLang;
    }
}
