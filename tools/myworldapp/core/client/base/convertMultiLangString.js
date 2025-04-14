/**
 * Given a language returns a function that converts a multi-lang string into the value for the given language
 *
 * @param {string}   [targetLanguage]
 * @param {string}   [defaultLanguage]
 * @param {string[]} [systemLanguages]
 * @private
 */
export const convertMultiLangString =
    (targetLanguage, defaultLanguage, systemLanguages) => (value, defaultValue) => {
        //Don't process null values
        if (value == null) return value;

        //Prepare defaults
        defaultLanguage = defaultLanguage || 'en';
        systemLanguages = systemLanguages || [defaultLanguage];
        const language = targetLanguage || defaultLanguage;
        const languageFamily = language ? language.split('-')[0] : language;
        const defaultLangFamily = defaultLanguage ? defaultLanguage.split('-')[0] : defaultLanguage;
        let valuesPerLang = {};
        try {
            //check if value is a json-like string before using JSON.parse to avoid throwing errors that debugging make with 'Pause on caught exceptions' very difficult
            if (typeof value == 'string' && value[0] == '{') {
                valuesPerLang = JSON.parse(value);
            } else if (typeof value == 'object') {
                valuesPerLang = value;
            } else {
                valuesPerLang[defaultLanguage] = value;
            }
        } catch (error) {
            valuesPerLang[defaultLanguage] = value;
        }

        //Return language specific value if there is one
        if (valuesPerLang[language]) return valuesPerLang[language];

        //Return language family value if there is one
        if (valuesPerLang[languageFamily]) return valuesPerLang[languageFamily];

        //Return missing language value if language appears in system languages
        if (systemLanguages.includes(language) || systemLanguages.includes(languageFamily)) {
            return defaultValue;
        }

        //Return value for default language if there is one
        if (valuesPerLang[defaultLanguage]) return valuesPerLang[defaultLanguage];

        //Return value for default language family if there is one
        if (valuesPerLang[defaultLangFamily]) return valuesPerLang[defaultLangFamily];

        //no translation value in default language either, return original value
        return value;
    };
