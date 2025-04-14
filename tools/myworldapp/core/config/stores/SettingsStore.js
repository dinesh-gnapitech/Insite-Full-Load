import { makeObservable, observable, action, computed, runInAction, set } from 'mobx';
import { BaseStore } from './BaseStore';
import { mapObject } from 'underscore';

export class SettingsStore extends BaseStore {
    @observable currentLang = null;
    constructor() {
        super();

        makeObservable(this);
        this.endpoint = 'system/setting';
        this.individualEndpoint = 'config/setting';
        this.collectionWrapper = 'settings';
        this.filterFields = ['name'];
        this.rowKey = 'name';
        this.uniques = ['name'];
        this.languages = [];
    }

    //ENH: Extend the get() method to call this method and return an object
    //with the value already converted to its type. The fieldEditors in the settingForm
    //won't need to call this method or convert the values themselves.
    getConverted(key) {
        const setting = this.store[key];
        if (!setting) return null;

        try {
            switch (setting.type) {
                case 'JSON':
                    try {
                        return JSON.parse(setting.value);
                    } catch (error) {
                        return [];
                    }
                case 'STRING':
                    return setting.value;
                case 'INTEGER':
                    return parseInt(setting.value);
                case 'FLOAT':
                    return parseFloat(setting.value);
                case 'BOOLEAN':
                    return setting.value.toLowerCase() === 'true';
                default:
                    return setting.value;
            }
        } catch (e) {
            console.error(e);
        }
    }

    getAllConverted() {
        return mapObject(this.store, (val, key) => this.getConverted(key));
    }

    @action setValue(id, value) {
        this.store[id].value = JSON.stringify(value);
    }

    @computed get replicaSettings() {
        const defaultSettings = [
                { name: 'replication.sync_root', value: '' },
                { name: 'replication.sync_urls', value: '' },
                { name: 'replication.download_root', value: '' }
            ],
            settingsToPublish = [...defaultSettings.map(s => s.name), 'extract_type'],
            replicaSettings = Object.values(this.store).filter(a =>
                settingsToPublish.includes(a.name)
            );

        return replicaSettings.length === 0 ? defaultSettings : replicaSettings;
    }

    @action setCurrentLang(lang) {
        this.currentLang = lang;
    }

    @action async getSystemLangs() {
        runInAction(() => (this.isLoading = true));
        const langSetting = await this.get('core.language');
        runInAction(() => {
            this.languages = langSetting.value.split(',');
            this.setCurrentLang(this.languages[0]);
            set(this, 'isLoading', false);
        });
    }

    /**
     * Get the value for the currentLang from a multi-language string
     * Used by multi-language controls in config pages.
     * @param {string|object} value String or multi-language string
     * @param {string} lang Language to translate to
     * @param {string} fallbackLang Language to fallback to if there is no translation available
     */

    getLocalisedValFor(value, currentLang) {
        const hasMultiLang = this.languages?.length > 1;
        const defaultLang = this.languages[0];

        try {
            const valObj = JSON.parse(value);
            if (typeof valObj === 'object') return valObj[currentLang || defaultLang];
            else throw new Error('Not a multi-language string'); //handled below
        } catch (e) {
            if (hasMultiLang) return currentLang === defaultLang ? value : '';
            else return value;
        }
    }

    async update(id, data) {
        await BaseStore.prototype.update.call(this, id, data);
        //To update the system language in the store
        if (data.name === 'core.language') await this.getSystemLangs();
    }
}
