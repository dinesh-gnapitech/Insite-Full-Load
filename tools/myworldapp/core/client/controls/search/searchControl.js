// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { isEqual } from 'underscore';
import myw, { Util, trace, config, ObjectNotFoundError, UnauthorizedError } from 'myWorld/base';
import { Control } from 'myWorld/base/control';
import { sampledUnion } from 'myWorld/base/util';
import { SearchExamplesView } from './examplesView';
import { SuggestionListView } from './suggestionListView';
import { GeocodeFeature } from 'myWorld/features';
import xImg from 'images/x.svg';

export class SearchControl extends Control {
    static {
        this.mergeOptions({
            delay: 500,
            minLength: 2,
            maxResultsPerProvider: 12, //only affects external searches
            recentSearches: [],
            maxRecentSearchesSaved: 20,
            maxRecentSearchesShown: 10,
            boxWidth: 340, // Governs the width of the recent searches box and the search suggestions box
            resultDisplayDelay: 400 // in miliseconds. Maximum time to wait for myw results before showing other providers
        });

        this.prototype.events = {
            'click input': 'render',
            'blur input': 'onBlur',
            'click #text-search-clear': 'reset',
            'keydown input': 'onKeyDown',
            'input input': 'onKeyUp'
        };
    }

    /**
     * @class A UI Control providing a search box that combines myWorld, address and external datasource searches <br/>
     * @param  {Application}    owner
     * @param  {number}  [options.delay=300]                    in miliseconds. Wait this interval since last keypress before sending requests
     * @param  {number}  [options.resultDisplayDelay=400]       in miliseconds. Maximum time to wait for myw results before showing other providers
     * @param  {number}  [options.minLength=2]                  minimum number of characters before sending requests

     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);
        //pre bind methods they can be used as handlers/callbacks
        [
            'doSearch',
            'mywSearch',
            'placesAutocomplete',
            'placesAttribution',
            'externalSearches',
            'checkForCoordinate'
        ].forEach(method => (this[method] = this[method].bind(this)));

        this.isFullscreen = this.options.fullscreen || false;
        this._lastRequestId = 0;
        this.recentSearches = this._convertRecentSearches(this.options.recentSearches);

        this.providers = this.getProviders();

        this.initUI();

        // This event handler caters to touch devices, where the focus on the search input does not get blurred on map click
        this.app.map.on('singleclick pointerdrag', () => {
            if (this.cancelBlur) {
                delete this.cancelBlur;
                this.render();
            } else {
                this.searchInput.blur();
            }
        });

        if (!myw.isTouchDevice) {
            this.searchInput.focus();
        }
    }

    /**
     * Returns the list of search provider details
     * @return {Object<searchProvider>} Keyed on provider type
     */
    getProviders() {
        const providers = {
            latlng: {
                title: undefined,
                search: this.checkForCoordinate
            },
            myw: {
                title: undefined,
                search: this.mywSearch
            },
            externals: {
                title: this.msg('externals'),
                search: this.externalSearches
            },
            places: {
                title: this.msg('places'),
                attribution: this.placesAttribution,
                search: this.placesAutocomplete
            }
        };
        Object.entries(providers).forEach(([key, p]) => {
            p.type = key;
        });
        return providers;
    }

    /**
     * Adds the searchControl specific HTML to the DOM
     */
    initUI() {
        this.searchInput = $('<input>', {
            type: 'text',
            id: 'text-search',
            class: 'rounded20',
            placeholder: ''
        });
        this.searchInput.attr('autocomplete', 'off'); //Fix for browser autocomplete over-riding myWorld suggestions (Bug#12912)

        this._clearButton = $('<img>', {
            id: 'text-search-clear',
            src: xImg,
            title: this.app.msg('clear_tip')
        });

        // Add the search input box, the searching gif and the clear button to the container
        this.$el.append(this.searchInput).append(this._clearButton);

        this.translate(this.$el);

        //add element to display search suggestions/results
        this.suggestionListView = new SuggestionListView(this, {
            underneath: this.searchInput
        });
        this.suggestionListView.$el.hide();

        // Stretches the parent container to accomodate the searchControl
        this.app.layout.alignTop?.();

        // Add the container for search help
        this._searchExamples = new SearchExamplesView(this, {
            searchExamples: config['core.searchExamples'],
            underneath: this.searchInput
        });
    }

    /**
     * Renders self by showing either the suggestions view or the examples
     * A refresh of the suggestions view is not triggered by this method (reduces unnecessary refreshes)
     */
    render() {
        const // true if there has been a response from myWorld server and there are suggestions to show
            resultsToShow = this.resultsToShow(),
            searchText = this.getSearchText(),
            enoughText = searchText.length >= this.options.minLength,
            isActive = this.searchInput[0].id == document.activeElement.id,
            currentFeature = this.app.currentFeature,
            currentFeatureGeom = currentFeature?.getGeometryInWorld('geo');

        //clear button should be shown when there is text
        this._clearButton.toggle(searchText.length > 0);

        this.polygonSelected =
            currentFeatureGeom &&
            ['polygon', 'multipolygon'].includes(currentFeatureGeom.type.toLowerCase());

        trace(
            'search',
            5,
            `text:'${searchText}'`,
            'isActive:',
            isActive,
            'resultsToShow:',
            resultsToShow
        );

        //only render suggestions when we already have a response from myWorld server to avoid
        //flicker and/or too many refreshes
        if (isActive && resultsToShow && enoughText) {
            this.suggestionListView.render();
        }

        //make suggestions visible if appropriate
        this.suggestionListView.$el.toggle(isActive && resultsToShow && enoughText);

        this.suggestionListView.refresh();
        this._searchExamples.filterRecentSearches(searchText);
        this._searchExamples.toggle(isActive && !resultsToShow);
    }

    /**
     * Called when the input looses focus
     * @private
     */
    onBlur() {
        if (this.cancelBlur) {
            // blur event originated from a click on the suggestions list -> do not hide the
            // list as it will prevent the click handler on the suggestionView from triggering
            delete this.cancelBlur;
        } else {
            this.render();
        }
    }

    /**
     * Clears the text and gets the focus on this control
     */
    reset() {
        this._resetSuggestionsList();
        this.setHighlightedIndex(0); // Highlights the first item in the list (for the recent searches popup)
        this.searchInput.val('').focus(); //triggers a render
        this._clearButton.hide();
        this.toggleSearchingGif(false);
    }

    /**
     * Shows or hides the searching gif in the search input box
     * @param  {boolean} show  Whether to show the gif or to hide it
     */
    toggleSearchingGif(show) {
        const toggleMethod = show ? 'addClass' : 'removeClass';
        this.searchInput[toggleMethod]('searching');
    }

    /**
     * Called after the user releases a key. <br/>
     * Uses a timeout before initiating a search to avoid unnecessary requests if the user is typing quickly
     * @private
     */
    onKeyUp(event) {
        clearTimeout(this.keypressTimeout);
        const safeKeys = [13, 37, 38, 39, 40];
        //don't want to render on enter and cursor keys because it will have happened already
        //the doSearch would have been initiated on return keydown already
        if (safeKeys.includes(event.keyCode)) return;

        //On Paste: We need a delay because there is a lag between
        //the event being fired and the text actually being pasted
        const delay = event.type === 'paste' ? 300 : 0;
        setTimeout(() => {
            //Only adds a delay for paste events
            const searchText = this.getSearchText();
            if (searchText != this._currentSearchText) {
                //text changed - set timeout to initiate search
                this.keypressTimeout = setTimeout(this.doSearch, this.options.delay);
            } else {
                // text not long enough
                this.render();
            }
        }, delay);
    }

    /**
     * Called when the user presses a key. <br/>
     * Handles cursors and enter key presses
     */
    onKeyDown(event) {
        let index = this.highlightedIndex;
        let subIndex = this.highlightedSubIndex;
        let length = this.allSuggestions().length;
        const subMenuLength = this.currentSubSuggestions ? this.currentSubSuggestions.length : 0;

        if (length === 0 && this.recentSearches.length > 0) {
            //There are no current suggestions, we are selecting from the recent searches
            length = this.recentSearches.length;
        }

        this._clearButton.toggle(this.getSearchText().length > 0);

        switch (event.keyCode) {
            case 13: // enter
                this.onEnterKeyPressed();
                break;
            case 38: // up arrow
                if (subIndex !== undefined) {
                    subIndex--;
                    if (subIndex < 0) subIndex = subMenuLength - 1;
                    this.setHighlightedSubIndex(subIndex);
                } else {
                    index--;
                    if (index < 0) index = length - 1;
                    this.setHighlightedIndex(index);
                }
                break;
            case 40: // down arrow
                if (subIndex !== undefined) {
                    subIndex++;
                    if (subIndex >= subMenuLength) subIndex = 0;
                    this.setHighlightedSubIndex(subIndex);
                } else {
                    index++;
                    if (index >= length) index = 0;
                    this.setHighlightedIndex(index);
                }
                break;
            case 39: // right arrow
                this.showSubMenu(index);
                break;
            case 37: // left arrow
                this.hideSubMenu(index);
                break;
            default:
                return;
        }
    }

    /**
     * Called when the user presses the Enter key. <br/>
     * If the wait to start a search is running, it starts the search immediately. <br/>
     * Otherwise it selects the currently highlighted suggestion
     */
    onEnterKeyPressed() {
        if (this.keypressTimeout) {
            //waiting for keypress timeout. cancel it and do the request immediately
            clearTimeout(this.keypressTimeout);
            this.doSearch();
        } else {
            const suggestion = this.getHighlightedSuggestion();

            if (suggestion) {
                if (Array.isArray(suggestion)) {
                    this.showSubMenu(); //its a query view, show the sub-menu (the right arrow key press does the same thing)
                } else {
                    this.searchInput.blur(); // ensure focus is removed so that when rendered the suggestions are hidden
                    this.selectACSuggestion(suggestion);
                }
            } else {
                //no suggestions
                this.render();
                //try a standard geocoding call.
                this.app.doAddressSearch(this.getSearchText());
            }
        }
    }

    _resetSuggestionsList() {
        trace('search', 7, 'Resetting suggestions list...');
        this._currentSearchText = null;
        Object.values(this.providers).forEach(provider => {
            provider.suggestions = null;
        });
    }

    /**
     * Performs a search using the user entered text and renders the results<br/>
     * Prevents duplicate searches by comparing the current text with the previously searched text
     */
    doSearch() {
        this.keypressTimeout = null;
        const searchText = this.getSearchText();

        if (searchText.length < this.options.minLength) {
            //text is too small for searching - reset suggestions as the suggestions we have don't match the text we have
            this._resetSuggestionsList();
            this.render();
        } else if (searchText == this._currentSearchText) {
            //avoid duplicate searches - do nothing
        } else {
            this._currentSearchText = searchText;
            this.highlightedIndex = 0;
            this.searchFor(searchText);
        }
    }

    /**
     * Sends an autocomplete request to the server with a given text
     * @param  {string}     searchText    Text to use in the autocomplete request
     * @return {Promise<Array<autoCompleteResult>>}            Promise for the search results/predictions.
     *                                            Promise can be reject if request is out-of-date (a new request as been sent already)
     */
    searchFor(searchText) {
        const bounds = this.app.map.getBounds();

        //reset suggestions
        this._resetSuggestionsList();

        this.toggleSearchingGif(true);

        const searchPromises = [];

        Object.values(this.providers).forEach(provider => {
            provider.promise = provider
                .search(searchText, bounds)
                .then(suggestions => {
                    if (searchText === this.getSearchText()) {
                        //otherwise it's an expired request -> ignore the results
                        provider.suggestions = suggestions;

                        this.render();
                    }
                })
                .catch(reason => {
                    console.log(`${provider.type} search failed with: `, reason);
                    return [];
                });
            searchPromises.push(provider.promise);
        });

        Promise.all(searchPromises).then(() => {
            this.toggleSearchingGif(false);
        });
    }

    /**
     * Performs a search on the myWorld server/database
     * @param  {string} searchText
     * @return {Promise<Array<autoCompleteResult>>}
     */
    async mywSearch(searchText, bounds) {
        const datasource = this.app.getDatasource('myworld');
        const options = { bounds };

        //setup to determine if request is taking longer than predefined value
        //if it is, we'll render the results we already have (usually google)
        this.isMywRequestSlow = undefined;
        if (this.options.resultDisplayDelay) {
            setTimeout(() => {
                if (this.isMywRequestSlow !== false) {
                    this.isMywRequestSlow = true;
                    this.render();
                }
            }, this.options.resultDisplayDelay);
        } else {
            this.isMywRequestSlow = true; //show other data as soon as available
        }

        const results = await datasource.runSearch(searchText, options);
        results.forEach(result => {
            result.datasource = datasource.getName();
        });
        return this._groupResults(results);
    }

    /**
     * Performs a Places autocomplete request
     * @param  {string}         searchTerm  Text to use in the autocomplete request
     * @param  {LatLngBounds} bounds      Location to bias the results on
     * @return {Promise}  Promise that will resolve when the request is completed
     */
    placesAutocomplete(searchTerm, bounds) {
        const placesAcEngine = this._getPlacesAcEngine();
        if (!placesAcEngine) return Promise.resolve([]);

        return placesAcEngine.runSearch(searchTerm, { bounds: bounds }).catch(reason => {
            if (!this.app.hasInternetAccess) new Error('No internet access');
            else throw reason;
        });
    }

    placesAttribution() {
        const placesEngine = this._getPlacesAcEngine();
        return placesEngine?.getAttribution?.();
    }

    /**
     * Performs a search on the external datasources
     * @param  {string} searchTerm
     * @return {Promise<Array<autoCompleteResult>>} Results are limited to maxResultsPerProvider option
     */
    externalSearches(searchTerm, bounds) {
        const options = { bounds: bounds };
        return this._getExternalDataSources().then(datasources => {
            const externalRequests = datasources.map(async ds => {
                try {
                    await ds.ensureLoggedIn();
                    const results = await ds.runSearch(searchTerm, options);
                    results.forEach(result => {
                        result.datasource = ds.getName();
                    });
                    return results;
                } catch (reason) {
                    console.log(
                        `Warning: External search request for ${ds.getExternalName()} failed with: `,
                        reason
                    );
                    return [];
                }
            });
            return Promise.allSettled(externalRequests).then(outcomes => {
                const results = [];
                outcomes.forEach(outcome => {
                    if (outcome.status == 'fulfilled') {
                        const suggestions = outcome.value;
                        results.push(this._groupResults(suggestions));
                    } else {
                        //unexpected. errors should have been caught and resolved to []
                        console.log(
                            'Warning: External search request failed with: ',
                            outcome.reason()
                        );
                    }
                });

                //combine results making sure that there are at least some results from each datasource
                return sampledUnion(results, this.options.maxResultsPerProvider);
            });
        });
    }

    /**
     * Group results with the same data id (groups the 'all', 'in window' and 'in selection' queries)
     * @param  {Array} results  flat list of results
     * @return {Array}          grouped results
     * @private
     */
    _groupResults(results) {
        const resultList = {};
        Object.entries(results).forEach(([index, result]) => {
            if (result.type !== 'query') resultList[index] = result;
            else {
                const resultItem = Object.values(resultList).find(
                    item => item[0]?.data?.id === result.data.id
                );
                if (!resultItem) {
                    resultList[index] = [result];
                } else {
                    resultItem.push(result);
                }
            }
        });

        //Return the array of the results making sure that items that are arrays with one item in them are changed to just the suggestion
        return Object.values(resultList).map(item => {
            if (Array.isArray(item) && item.length === 1) return item[0];
            else return item;
        });
    }

    /**
     * Returns the list of external datasources that requests should be sent to. <br/>
     * The datasources are obtained from the accessible layers
     * @return {Promise<Array<IDatasource>>}
     * @private
     */
    async _getExternalDataSources() {
        //  Note that while we cannot cache this here, as it will not account for added private layers added at the current session,
        //  the underlying request to the server is cached at System.getStartupInfo
        const availableLayers = await this.app.getLayersDefs();
        const placesEngine = this._getPlacesAcEngine();

        let datasources = availableLayers
            .map(this._datasourceFrom.bind(this))
            .filter(Boolean)
            //filter out datasources that don't provide search
            .filter(datasource => typeof datasource.runSearch == 'function')
            //filter out myWorld datasource as it's being handled via separate 'provider'
            //ENH: merge providers with datasources
            .filter(datasource => datasource.name !== 'myworld')
            //filter out placesEngine datasource as it's being handled via separate 'provider'
            .filter(ds => ds !== placesEngine);

        return [...new Set(datasources)];
    }

    /**
     * Returns the external datasource of a given layer
     * @param  {layerDefinition} layerDef
     * @return {IDatasource}
     * @private
     */
    _datasourceFrom(layerDef) {
        try {
            return this.app.getDatasource(layerDef.datasource);
        } catch (error) {
            console.warn(
                `SearchControl: Unable to get datasource for layer '${layerDef.name}': ${error.message}`
            );
        }
    }

    /**
     * Checks if the seartText matches a coordinate and if so returns a corresponding suggestion (in a list)
     * @param  {string} searchText
     * @return {Array<autoCompleteResult>}
     */
    checkForCoordinate(searchText) {
        const latLng = Util.parseLatLng(searchText);
        if (latLng) {
            //create a suggestion for the coordinate
            const label = Util.formatLatLng(latLng),
                feature = new GeocodeFeature(
                    {
                        geometry: { coordinates: [latLng.lng, latLng.lat], type: 'Point' },
                        properties: {},
                        id: 1
                    },
                    label
                ),
                suggestion = {
                    type: 'coordinate',
                    label: label,
                    value: searchText,
                    data: { feature: feature }
                };
            return Promise.resolve([suggestion]);
        }
        return Promise.resolve([]);
    }

    // if element is a feature object convert it into GeocodeFeature
    _convertRecentSearches(recentSearches = []) {
        return recentSearches.map(recentSearch => {
            if (recentSearch.type === 'coordinate') {
                recentSearch.data.feature = new GeocodeFeature(
                    recentSearch.data.feature,
                    recentSearch.label
                );
            }
            return recentSearch;
        });
    }

    /**
     * Performs the operations associated with the user selecting a search suggestion
     * @param {autoCompleteResult} suggestion
     * @private
     */
    selectACSuggestion(suggestion) {
        if (Array.isArray(suggestion)) {
            //user selected a query "group" suggestion, not an individial query suggestion
            //pick the first one - tipically "all" or "in window"
            suggestion = suggestion[0];
        }

        this._selectACSuggestion(suggestion);
        this.addToRecentSearches(suggestion);

        this.toggleSearchingGif(false);

        this.render();
    }

    addToRecentSearches(suggestion) {
        //If the suggetsion is an array of [window, selection, all] searches, pick the first search item,
        //since that's the one that is executed while in the suggetsions list
        if (Array.isArray(suggestion)) suggestion = suggestion[0];

        // When '...' is clicked for a feature query, assign its value to the label so the suggestion Item is rendered as 'Objects matching: <label>'
        if (!suggestion.label.length) suggestion.label = suggestion.value;

        // if the suggestion is already in the recent searches, remove it so it can be placed on top again
        this.recentSearches = this.recentSearches.filter(item => !isEqual(item, suggestion));

        if (this.recentSearches.length == this.options.maxRecentSearchesSaved) {
            //Remove the oldest suggestion
            this.recentSearches.pop();
        }
        this.recentSearches.unshift(suggestion);
    }

    /**
     * Receives an autocomplete result and executes the corresponding search/selection
     * If the suggestion is a query, it will execute it.
     * If it's bookmark it will go to it
     * If it's a feature it will set it as the current feature
     * @param  {autoCompleteResult} suggestion      Data associated with chosen suggestion
     * @private
     */
    _selectACSuggestion(suggestion) {
        //ENH: simplify (use a mapping of type to method?)
        const app = this.app,
            data = suggestion.data,
            type = suggestion.type;

        switch (type) {
            case 'geocode':
                //not used by product. kept for backward compatibility of custom Autocomplete engines
                //geocode the available suggestion geocode
                app.doAddressSearch(suggestion.label);
                return;

            case 'placesAc':
                //geocode the available suggestion geocode
                app.doAddressSearch(suggestion);
                return;

            case 'coordinate':
                app.handleAddressSearchResults([data.feature]);
                return;

            case 'query':
                this.runQuery(suggestion.datasource, data);
                return;

            case 'bookmark': {
                const bookmarkId = data.id,
                    map = app.map;

                app.system
                    .getBookmark(bookmarkId)
                    .then(bookmarkDetails => {
                        map.useBookmark(bookmarkDetails);
                    })
                    .catch(() => {
                        app.message(app.msg('missing_bookmark_error'));
                    });
                return;
            }

            case 'feature_search': {
                app.fire('query-started');
                const datasource = app.getDatasource(suggestion.datasource);
                datasource
                    .getFeaturesMatching(suggestion.value, {
                        limit: config['core.queryResultLimit']
                    })
                    .then(app.setCurrentFeatureSet.bind(app));
                return;
            }

            case 'feature': {
                //the suggestion is a myWorld feature
                app.fire('selection-started', { origin: 'ac' });
                const database = app.database;
                database
                    .getFeatureByUrn(data.urn)
                    .then(feature => {
                        if (feature) {
                            app.setCurrentFeature(feature, { zoomTo: true });
                        } else {
                            throw new ObjectNotFoundError();
                        }
                    })
                    .catch(reason => {
                        app.setCurrentFeature(null);
                        if (
                            reason instanceof ObjectNotFoundError ||
                            reason instanceof UnauthorizedError
                        )
                            app.message(app.msg('missing_object_error'));
                        else console.log(app.msg('missing_feature'));
                    });
                return;
            }

            case 'kml_feature': {
                const feature = data.feature;
                if (feature) {
                    app.setCurrentFeature(feature, { zoomTo: true });
                } else {
                    throw new ObjectNotFoundError();
                }
            }
        }
    }

    /**
     * Executes a query. Results will be set as app's current feature set
     * @param  {queryDefinition} queryDef
     * @return {Promise}
     */
    runQuery(dsName, queryDef) {
        const options = {},
            app = this.app,
            spatialRestrictionType = queryDef.spatial_restriction;

        if (spatialRestrictionType == 'window') {
            options.bounds = this.app.map.getBounds();
        } else if (spatialRestrictionType == 'selection') {
            // Use geometry of representation as this is the selected geometry
            const currentFeatureRep = app.getCurrentFeatureRep(),
                geometryType = currentFeatureRep?.getGeometryType(),
                isPolygon =
                    currentFeatureRep &&
                    (geometryType == 'Polygon' || geometryType == 'MultiPolygon');
            if (isPolygon) {
                options.polygon = currentFeatureRep.getGeometry();
            } else {
                app.message(app.msg('select_polygon'));
                app.setCurrentFeatureSet([]);
                return;
            }
        }

        const featureType = `${dsName}/${queryDef.feature_type}`;
        const queryDefWithFeatureType = { ...queryDef, featureType };

        this.app.fire('query-started');

        return this.app.database
            .runQuery(queryDefWithFeatureType, options)
            .then(features => {
                app.saveCurrentQueryDetails(queryDefWithFeatureType, options, features);
                app.setCurrentFeatureSet(features, { queryDetails: app.getCurrentQueryDetails() });
            })
            .catch(reason => {
                console.log(reason);
                app.message(app.msg('execute_error'));
                app.setCurrentFeatureSet([]);
            });
    }

    /**
     * Returns the current text entered by the user. Before and after spaces are trimmed
     * @return {string}
     */
    getSearchText() {
        return this.searchInput.val().trim();
    }

    /**
     * @return {boolean} Whether there are suggestions to present or not
     */
    resultsToShow() {
        //only return true if we already gotten a response from myWorld or if response is taking too long
        //this is to avoid flickering of the UI
        const haveSomeResults = this.allSuggestions().length > 0;
        const haveReceivedMywResponse = !!this.providers.myw.suggestions;
        const waitedEnoughForMyw = this.isMywRequestSlow;
        trace(
            'search',
            6,
            'haveSomeResults:',
            haveSomeResults,
            'haveReceivedMywResponse:',
            haveReceivedMywResponse,
            'waitedEnoughForMyw:',
            waitedEnoughForMyw
        );

        return !!(haveSomeResults && (haveReceivedMywResponse || waitedEnoughForMyw));
    }

    /**
     * Returns a list of all suggestions from the different datasources
     * @return {Array<autoCompleteResult>}
     */
    allSuggestions() {
        return Object.values(this.providers)
            .flatMap(p => p.suggestions)
            .filter(Boolean);
    }

    /**
     * @return {autoCompleteResult} The currently highlighted suggestion
     * @private
     */
    getHighlightedSuggestion() {
        const highlightedSubIndex = this.highlightedSubIndex;
        const subSuggestions = this.currentSubSuggestions;
        const highlightedIndex = this.highlightedIndex;
        let suggestions = this.allSuggestions();

        if (suggestions.length === 0) {
            //There are no current suggestions, so select from the recent searches
            suggestions = this._searchExamples.recentSearches;
        }

        if (subSuggestions && highlightedSubIndex <= subSuggestions.length) {
            return subSuggestions[highlightedSubIndex];
        } else if (suggestions.length >= highlightedIndex) {
            return suggestions[highlightedIndex];
        } else {
            return undefined;
        }
    }

    /**
     * Highlights the suggestion with the given index
     * @param {number}index
     */
    setHighlightedIndex(index) {
        this.highlightedIndex = index;
        this.trigger('change:highlightedIndex');
        this.trigger('change');
    }

    setHighlightedSubIndex(subIndex) {
        this.highlightedSubIndex = subIndex;
        this.trigger('change:highlightedSubIndex');
    }

    showSubMenu(index) {
        this.trigger('showSubMenu');
    }

    hideSubMenu(index) {
        this.trigger('hideSubMenu');
    }

    _getPlacesAcEngine() {
        return this.app.getGeocoder();
    }

    getState() {
        return {
            recentSearches: this.recentSearches
        };
    }

    remove() {
        this._searchExamples?.remove();
        this.suggestionListView?.remove();
        super.remove();
    }

    /**
     * Assigns an the default width on the container provided
     * If the window is not wide enough to accomodate that width, than assigns a scaled down width
     * Makes the container's width resizable using jquery ui
     * @param {jqueryElement} container  The container html element being sized/resized
     * @private
     */
    _setContainerWidth(container) {
        const boxWidth = this.options.boxWidth;
        let containerWidth;

        if (this.isFullscreen) {
            containerWidth = $(window).width() - 20;
        } else {
            const spaceInWindow = $(window).width() - container.offset().left - 100;
            containerWidth = spaceInWindow < boxWidth ? spaceInWindow : boxWidth;

            container.resizable({
                handles: 'e, w', //only horizontal resizing
                minWidth: 230, //So the contents don't look too squished
                maxWidth: spaceInWindow, //So the screen always has some space left for the query popouts that display 'In Selection'/'In Window'/'All'
                start: () => {
                    this.hideSubMenu();
                }
            });
        }
        container.width(containerWidth);
    }
}

/**
 * Definition of a search provider
 * @typedef searchProvider
 * @property {string}      type             Internal name of the type of search
 * @property {string}      title            Title to use when displaying the results for this provider
 * @property {function}    search           Function that performs the search. Receives a string with the search text and should return a promise to be fulfilled with an array of autoCompleteResult}
 * @property {string}      [attribution]    Url of an attribution image to show next to the results
 */

export default SearchControl;
