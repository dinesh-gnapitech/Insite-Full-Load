import { makeObservable, observable, action, runInAction, toJS } from 'mobx';
import { RestClient } from './RestClient';
import { isFieldSeparator } from '../views/Features/utils';
import { utils } from '../shared';

export class DDStore {
    @observable ds = {};
    @observable store = {};
    @observable isLoading = true;
    @observable current = {};

    constructor() {
        makeObservable(this);
        this.current = {};
        this.endpoint = 'config/dd';
        this.collectionWrapper = 'layers';
        this.filterFields = ['name', 'category', 'datasource', 'type', 'code'];
        this.rowKey = 'id';
        this.uniques = ['name', 'external_name'];
    }
    /**
     * Public Actions
     */

    @action set(dsName, data) {
        if (!this.store[dsName]) {
            this.store[dsName] = {};
        }
        this.store[dsName][data.name] = data;
    }

    @action async getDD(dsName, mode = 'summary') {
        runInAction(() => (this.isLoading = true));
        const modeStr = mode == 'summary' ? '' : `/${mode}`;
        const res = await RestClient.get(`config/dd/${dsName}${modeStr}`);

        runInAction(() => {
            if (!this.ds[dsName]) this.ds[dsName] = {};
            Object.assign(this.ds[dsName], res.data);
            this.isLoading = false;
        });
    }

    @action async getAvailableFields(dsName) {
        try {
            const res = await RestClient.get(`${this.endpoint}/${dsName}/fields?types=geometry`);

            let fieldsDataTable = {};

            res.data.fields.forEach(field => {
                fieldsDataTable[field.table_name] = fieldsDataTable[field.table_name] || [];
                fieldsDataTable[field.table_name].push(field);
            });
            return fieldsDataTable;
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * Returns filtered fields {table_name [field, field]}
     */
    @action filterAvailableFields(fields, filter) {
        if (!fields) return;

        if (filter) {
            let filteredfields = filter(Object.values(fields).flat());
            let obj = {};
            if (filteredfields) {
                filteredfields.forEach(field => {
                    obj[field.table_name] = obj[field.table_name] || [];
                    obj[field.table_name].push(field);
                });
            }
            return obj;
        } else {
            return fields;
        }
    }

    async get(dsName, featureName) {
        try {
            const res = await RestClient.get(`${this.endpoint}/${dsName}/feature/${featureName}`);
            this.set(dsName, res.data);
        } catch (e) {
            console.error(e);
        }
        return this.store[dsName][featureName];
    }

    async count(dsName, featureName, limit = 1) {
        if (dsName !== 'myworld') return true;

        const res = await RestClient.get(
            `config/dd/${dsName}/feature/${featureName}/count?limit=${limit}`
        );
        return res.data;
    }

    @action setCurrent(dsName, featureName) {
        let currentData = this.store[dsName] ? toJS(this.store[dsName][featureName]) || {} : {};
        // Field group separator is a string when return from server.
        // when submit to server, we need to send it as an object.
        // So convert the string to json at the begining
        this.current = this._parseFeatureFieldGroupSeparator(currentData);
    }

    @action getFieldProp(field, propName) {
        //If field is new it will have an index
        if (field.index) {
            return this.current.fields[field.index][propName];
        } else {
            const fieldInStore = this.current.fields.find(item => item.name === field.name);
            return fieldInStore[propName];
        }
    }

    @action setFieldProp(field, propName, value) {
        //If field is new it will have an index
        if (field.index) {
            this.current.fields[field.index][propName] = value;
        } else {
            //reverse array so the newest values are changed first
            const fieldInStore = this.current.fields
                .reverse()
                .find(item => item.name === field.name);
            fieldInStore[propName] = value;
            this.current.fields.reverse(); // Reset the order
        }
    }

    @action addField(fieldType = null) {
        const newField = {
            isNew: true,
            index: this.current.fields.length,
            fieldType: fieldType
        };
        this.current.fields.push(newField);
        return newField;
    }

    @action moveFieldOrder(field, beforeField) {
        let fields = this.current.fields;
        const origIndex = fields.findIndex(f => f.name == field.name);
        const targetIndex = fields.findIndex(f => f.name == beforeField.name);
        const movingEl = fields.splice(origIndex, 1); //remove the element that is moving
        fields.splice(targetIndex, 0, movingEl[0]); //add the element in the new position
        this.modifyCurrent({ fields });
    }

    @action deleteField(field) {
        let fields = this.current.fields;
        const index = fields.findIndex(f => f.name == field.name);
        fields.splice(index, 1);
        //  Make sure that we have removed this field from any groups
        this.current.groups.forEach(group => {
            group.fields = group.fields.filter(name => name != field.name);
        });
        this.modifyCurrent({ fields });
    }

    @action addGroup(name, options = {}) {
        const { fields = [], expanded = false, visible = 'true' } = options;
        const values = { name, expanded, fields, visible };
        this.current.groups.push(values);
    }

    @action removeGroup(groupName) {
        const groups = this.current.groups.filter(group => group.name !== groupName);
        this.modifyCurrent({ groups });
    }

    @action setFieldGroupProp(groupName, propName, value) {
        let groups = this.current.groups;
        const group = groups.find(g => g.name == groupName);
        group[propName] = value;
        this.modifyCurrent({ groups });
    }

    @action moveFieldGroupOrder(index, beforeIndex) {
        let groups = this.current.groups;
        const movingEl = groups.splice(index, 1); //remove the element that is moving
        groups.splice(beforeIndex, 0, movingEl[0]); //add the element in the new position
        this.modifyCurrent({ groups });
    }

    @action moveFieldOrderInGroup(groupName, index, beforeIndex) {
        const groups = this.current.groups;
        const group = groups.find(g => g.name == groupName);
        const fields = group.fields;
        const movingEl = fields.splice(index, 1); //remove the element that is moving
        fields.splice(beforeIndex, 0, movingEl[0]); //add the element in the new position
        this.modifyCurrent({ groups });
    }

    @action addFieldToGroup(groupName, fieldName, beforeIndex) {
        const groups = this.current.groups;
        const group = groups.find(g => g.name == groupName);
        const fields = group.fields;
        if (fields.includes(fieldName) && !isFieldSeparator(fieldName?.type)) return; //don't add duplicates field except separator
        fields.splice(beforeIndex, 0, fieldName); //add the element in the new position
        this.modifyCurrent({ groups });
    }

    @action deleteFieldFromGroup(groupName, fieldName) {
        const groups = this.current.groups;
        const group = groups.find(g => g.name == groupName);
        const fields = group.fields;
        const index = fields.findIndex(field => field == fieldName);
        fields.splice(index, 1); //Remove the deleted element
        this.modifyCurrent({ groups });
    }

    // to handle multiple empty label separator, checking the fieldName will not work
    // using index is less generic but can handle this case
    @action deleteFieldFromGroupByIndex(groupName, index) {
        const groups = this.current.groups;
        const group = groups.find(g => g.name == groupName);
        const fields = group.fields;
        fields.splice(index, 1); //Remove the deleted element
        this.modifyCurrent({ groups });
    }

    @action setSearchProp(index, propName, value) {
        this.current.searches[index][propName] = value;
    }

    @action appendToExtDsSearch(name, appendToSearch, dsType) {
        if (!this.current.searches[0]) {
            this.current.searches[0] = { value: this.current.external_name };
            this.setSearchProp(0, 'description', '{title}');
        }

        if (dsType === 'esri') {
            const searchVal = this.current.searches[0].value;
            this.current.searches[0].value = appendToSearch
                ? searchVal + ` ${name}`
                : searchVal.replace(` ${name}`, '');
        } else {
            //For OGC only one field can be used for searches
            this.current.searches[0].value = this.current.external_name + ` ${name}`;
        }
        if (!this.current.searches[0].value.includes(' [')) this.current.searches = [];
    }

    @action addSearch(lang) {
        let values = { value: '', description: '' };
        if (lang) values = { lang, ...values };
        this.current.searches.push(values);
    }

    @action removeSearchFrom(index) {
        this.current.searches = this.current.searches.filter((search, i) => i !== index);
    }

    @action setQueryProp(index, propName, value) {
        this.current.queries[index][propName] = value;
    }

    @action addQuery(lang) {
        let values = { value: '', description: '' };
        if (lang) values = { lang, ...values };
        this.current.queries.push(values);
    }

    @action removeQueryFrom(index) {
        this.current.queries = this.current.queries.filter((query, i) => i !== index);
    }

    @action setFilterProp(index, propName, value) {
        this.current.filters[index][propName] = value;
    }

    @action addFilter(values = { value: '', description: '' }) {
        this.current.filters.push(values);
    }

    @action removeFilterFrom(index) {
        this.current.filters = this.current.filters.filter((filter, i) => i !== index);
    }

    @action modifyCurrent(data) {
        if (data.fields) data.fields.forEach((field, index) => (field.index = index));
        if (data.groups) {
            data = this._parseFeatureFieldGroupSeparator(data);
        }
        this.current = { ...this.current, ...data };
    }

    @action async update(dsName, featureName, values) {
        //remove isNew property from data to be sent (without modifying store until we know save was successful)
        const fields = values.fields.map(field => {
            // eslint-disable-next-line no-unused-vars
            const { isNew, index, seq, fieldType, ...res } = field;
            return res;
        });
        //  Strip out any empty validator arrays
        fields.forEach(dataRow => {
            if (dataRow.validators?.length === 0) {
                delete dataRow.validators;
            }
        });

        //Convert query values to lower case, since the system expects lower case values
        let queries = [];
        values.queries.forEach(dataRow => {
            dataRow.value = dataRow.value.toLowerCase();
            queries.push(dataRow);
        });

        try {
            await this.validate(values);
            const data = { ...values, fields, queries };

            const result = await RestClient.put(
                `${this.endpoint}/${dsName}/feature/${featureName}`,
                data
            );
            this.modifyCurrent(result.data);
            this.set(dsName, result.data);
        } catch (error) {
            let msg;
            if (error.response) {
                msg = error.response.data;
                const parser = new DOMParser();
                const errorTxt = parser.parseFromString(msg, 'text/html').body.innerText;
                const start = errorTxt?.indexOf('mywAbort:');
                msg = errorTxt?.substring(start + 9);
                msg = msg?.replace(/&quot;/g, '"');
                msg = msg && JSON.parse(msg).msg;
            } else msg = error.message;

            throw new Error(msg);
        }
    }

    async validate(values) {
        //Check to make sure that every layout has a name
        values.groups.forEach(dataRow => {
            if (!dataRow.name) {
                throw new Error('group_name_required');
            }
        });
    }

    async save(dsName, data) {
        //remove properties used for the GUI from data to be sent (without modifying store until we know save was successful)
        const fields = data.fields.map(field => {
            // eslint-disable-next-line no-unused-vars
            const { isNew, index, seq, fieldType, ...res } = field;
            return res;
        });

        const dataToSave = { ...data, fields };
        const resp = await RestClient.post(`${this.endpoint}/${dsName}/feature`, dataToSave).catch(
            error => {
                let msg = utils.isMywAbort(error) ? utils.getMywAbortMessage(error) : error.message;
                throw new Error(msg);
            }
        );
        return resp.data.name;
    }

    @action async delete(dsName, name) {
        await RestClient.delete(`${this.endpoint}/${dsName}/feature/${name}`);
        runInAction(() => {
            delete this.store[dsName][name];
            delete this.ds[dsName].feature_types.find(feature => feature.name === name);
        });
    }

    @action duplicate(dsName, name) {
        let next = toJS(this.store[dsName][name]);
        if (this.uniques) {
            this.uniques.forEach(field => delete next[field]);
        }
        next['isDuplicate'] = true;
        this.current = next;
    }

    setFilter(query) {
        this.query = query;
    }

    /**
     * Copies the localisable attributes of the current feature to the non-default languages
     * if they don't already exist
     * @param {Array} langs The languages configured in the settings
     */
    @action copyPropsInOtherLangs(langs) {
        this.current['external_name'] = this._createItemInOtherLangs(
            this.current['external_name'],
            langs
        );
        this.current['title'] = this._createItemInOtherLangs(this.current['title'], langs);
        this.current['short_description'] = this._createItemInOtherLangs(
            this.current['short_description'],
            langs
        );
        this.current.fields.forEach(field => {
            field.external_name = this._createItemInOtherLangs(field.external_name, langs);
        });
        this.current.groups.forEach(group => {
            group.name = this._createItemInOtherLangs(group.name, langs);

            group.fields.forEach(field => {
                if (!field?.label) return;
                field.label = this._createItemInOtherLangs(field.label, langs);
            });
        });

        if (this.current.datasource === 'myworld') this._copyItemInOtherLangs('searches', langs);
        this._copyItemInOtherLangs('queries', langs);

        this.modifyCurrent(this.current);
    }

    /**
     * Returns an object keyed on the langs supplied
     * Each language has a value, if it does not originally exist,
     * it takes on the value from the default language
     * @param {string | object} item
     * @param {Array} langs
     */
    @action _createItemInOtherLangs(item, langs) {
        const itemInDefaultLang = this.getValInDefaultLang(item, langs);
        let newItem = {};
        newItem[langs[0]] = itemInDefaultLang;

        langs.forEach((lang, index) => {
            if (index === 0) return;
            if (!this._valExistsInLang(item, lang)) newItem[lang] = itemInDefaultLang;
            else newItem[lang] = JSON.parse(item)[lang];
        });
        item = JSON.stringify(newItem);
        return item;
    }

    /**
     * Creates a copy of the searches/queries in the default language
     * in the other configured language
     * only if they dont already exist in the list
     * @param {string} type 'searches'/'queries'
     * @param {Array}  langs
     */
    @action _copyItemInOtherLangs(type, langs) {
        const defaultLang = langs[0];
        const itemsInDefaultLang = this.current[type].filter(item => {
            return item.lang === defaultLang;
        });
        //Create the same items in other languages
        const items = [];
        langs.forEach((lang, index) => {
            if (index > 0) {
                itemsInDefaultLang.forEach(search => {
                    const newItem = { ...search, lang };
                    //Add only if it doesn't already exist in the list
                    const found = this.current[type].find(item => {
                        for (const [key, value] of Object.entries(newItem)) {
                            if (item[key] !== value) return false;
                        }
                        return true;
                    });
                    if (!found) items.push(newItem);
                });
            }
        });
        this.current[type] = this.current[type].concat(items);
    }

    getValInDefaultLang(value, langs) {
        try {
            const valObj = JSON.parse(value);
            return valObj[langs[0]];
        } catch (e) {
            return value;
        }
    }

    _parseFeatureFieldGroupSeparator(currentData) {
        if (!Object.entries(currentData).length) return currentData;

        currentData.groups = currentData.groups.map(group => ({
            ...group,
            fields: group?.fields.map(field => (utils.isJSON(field) ? JSON.parse(field) : field))
        }));
        return currentData;
    }

    _valExistsInLang(value, lang) {
        try {
            const valObj = JSON.parse(value);
            return !!valObj[lang];
        } catch (e) {
            //If its not a stringified object,
            //the value only exist for the default language, hence:
            return false;
        }
    }
}
