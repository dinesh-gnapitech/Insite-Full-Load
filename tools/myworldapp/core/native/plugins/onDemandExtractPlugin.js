// Copyright: IQGeo Limited 2010-2023
import {
    geometry,
    localisation,
    Plugin,
    PluginButton,
    latLng,
    UnauthorizedError
} from 'myWorld-base';
import { displayErrorAlert } from '../base/utils';
import { OnDemandExtractRunner } from './onDemandExtractRunner';

/**
 * @class Plugin which provides auto upload functionality to the application<br/>
 * Adds a background "process" to periodically run the sync. <br/>
 * Adds an image and label to the status bar which will indicate status.
 * @extends {Plugin}
 */
export class OnDemandExtractPlugin extends Plugin {
    static {
        this.mergeOptions({
            areaLimit: 100.0,
            areaUnits: 'mi^2'
        });
    }

    /**
     * @param  {Application} owner                       The application
     * @param  {object} [options]
     * @param  {boolean} [options.areaLimit=100.0]
     * @param  {boolean} [options.areaUnits='mi^2']
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);

        this.hasExtractState = 'checking';
        this._runnerReady = false;

        localisation.loadNamespace('myw.app', 'nativeResources/locales');
        const tableSetName = this.app.system.settings['replication.extract_table_set'];

        if (!tableSetName) return;

        geometry.init(); //ENH: wait for this

        this._runner = new OnDemandExtractRunner(this, tableSetName);
        this.ready = this._runner.ready
            .then(() => {
                this._runnerReady = true;
                this.trigger('change');
            })
            .catch(reason => {
                if (reason instanceof UnauthorizedError)
                    this.app.errorAlertMessageToUser(
                        'Error: missing access to on myw_on_demand_extract'
                    );
                throw reason;
            });
        this._checkExtractState();
    }

    canExtract() {
        return this._runnerReady;
    }

    canDelete() {
        return this._runnerReady && this.hasExtractState === true;
    }

    // TODO: Duplication with _convertBoundsToGeoJson
    _getArea(bounds) {
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const west = bounds.getWest();

        const latLngs = [
            latLng(south, east),
            latLng(north, east),
            latLng(north, west),
            latLng(south, west)
        ];
        const area = geometry.polygon(latLngs).area();
        const conversionConstant =
            this.app.system.settings['core.units'].area.units[this.options.areaUnits];
        return (area / conversionConstant).toFixed(2);
    }

    _convertBoundsToGeoJson(bounds) {
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const west = bounds.getWest();

        const geometry = {
            type: 'Polygon',
            coordinates: [
                [
                    [east, south],
                    [east, north],
                    [west, north],
                    [west, south],
                    [east, south]
                ]
            ]
        };

        return geometry;
    }

    _displayTooBigMessage(actual, limit, units) {
        // TODO: Square formatting copied from measure tool
        let unitsLabel = units;
        if (unitsLabel.indexOf('^2') > -1) {
            unitsLabel = unitsLabel.replace('^2', '&#178;');
        }
        const messageParams = {
            actual,
            limit,
            units: unitsLabel
        };
        return displayErrorAlert(
            this.msg('too_big_title'),
            [this.msg('too_big_desc', messageParams), this.msg('too_big_hint')],
            this.msg('too_big_button')
        );
    }

    extractButtonHandler() {
        const bounds = this.app.map.getBounds();
        const area = this._getArea(bounds);
        if (area > this.options.areaLimit) {
            this._displayTooBigMessage(area, this.options.areaLimit, this.options.areaUnits);
        } else {
            const region = this._convertBoundsToGeoJson(bounds);
            this.getExtract(region);
        }
    }

    getExtract(region) {
        if (!this._runner) {
            return this._makeRejectedPromiseForNoTableSetName();
        }
        const regionStr = JSON.stringify(region);
        return this._runner.getExtract(regionStr).then(succeeded => {
            if (succeeded === true) {
                this._setExtractState(true);
            }
            return succeeded;
        });
    }

    deleteExtract() {
        if (!this._runner) {
            return this._makeRejectedPromiseForNoTableSetName();
        }
        return this._runner.deleteExtract().then(succeeded => {
            if (succeeded === true) {
                this._setExtractState(false);
            }
            return succeeded;
        });
    }

    _checkExtractState() {
        this._runner.hasExtract().then(this._setExtractState.bind(this));
    }

    _setExtractState(newState) {
        if (this.hasExtractState != newState) {
            this.hasExtractState = newState;
            this.trigger('change');
        }
    }

    _makeRejectedPromiseForNoTableSetName() {
        return Promise.reject(new Error('Database does not support on-demand extract'));
    }
}

const imagesRoot = 'nativeResources/images/';

OnDemandExtractPlugin.prototype.buttons = {
    extract: class extends PluginButton {
        static {
            this.prototype.id = 'a-odextract';
            this.prototype.titleMsg = 'odextract_msg'; //for automated tests
            this.prototype.imgSrc = `${imagesRoot}download.svg`;
        }

        render() {
            this.setActive(this.owner.canExtract());
        }

        action() {
            this.owner.extractButtonHandler();
        }
    },

    remove: class extends PluginButton {
        static {
            this.prototype.id = 'a-oddelete';
            this.prototype.titleMsg = 'oddelete_msg'; //for automated tests
            this.prototype.imgSrc = `${imagesRoot}download_delete.svg`;
        }

        render() {
            this.setActive(this.owner.canDelete());
        }

        action() {
            this.owner.deleteExtract();
        }
    }
};
