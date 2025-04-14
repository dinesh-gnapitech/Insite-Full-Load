// Copyright: IQGeo Limited 2010-2023
import myw, { UnitScale } from 'myWorld-base';
import traceService from './tracePluginService';
import { DisplayMessage } from 'myWorld/controls/displayMessage';
import View from 'myWorld/base/view';

export class BaseTracePane extends View {
    constructor(options) {
        super(options);
        this.owner = options.owner;
        this.app = options.app;
        this.traceService = traceService;
        this.resetForm();
        this.render();
        this.registerEvents();
    }

    render() {
        if (this.state?.availableNetworks) {
            const networkExists = this.state.availableNetworks.filter(
                item => item.id == this.network
            );

            if (!networkExists.length && this.state.availableNetworks.length) {
                this.network = this.state.availableNetworks[0].id;
            }
        }

        const networkDef = this.network && this.state.networks[this.network];
        if (!networkDef) this.network = null; //previously chosen network is not available for current feature

        //update direction based on network selection;
        if (this.state && networkDef) {
            const directions = (this.state.availableDirections = traceService.determineDirection(
                networkDef.directed
            ));
            const directionExists = directions.filter(item => item.id == this.direction);

            if (!directionExists.length && directions.length) {
                this.direction = directions[0].id;
            }
        }

        if (networkDef?.sub_paths) {
            const paths = networkDef.sub_paths;
            this.subPaths = Object.entries(paths).map(([id, label]) => ({
                id,
                label
            }));
        } else {
            this.subPaths = [];
            this.subPath = null;
        }

        const subPathExists = this.subPaths.filter(item => item.id == this.subPath);

        if (!subPathExists.length && this.subPaths.length) {
            this.subPath = this.subPaths[0].id;
        }

        this.$el.html('');

        if (!this.loading && this.messageType == 'error' && this.message.length > 0) {
            const statusAlert = new DisplayMessage({
                type: this.messageType,
                message: this.message
            });
            this.$el.html(statusAlert.$el);
        }

        myw.translate(this.messageGroup, this.$el);
    }

    resetForm() {
        this.state = null;
        this.from = null;
        this.to = null;
        this.network = null;
        this.direction = null;
        this.subPath = null;
        this.subPaths = [];
        this.maxDist = null;
        this.maxDistScaled = null;
        this.loading = false;
        this.message = '';
        this.messageType = '';
    }

    registerEvents() {
        const owner = this.owner;

        owner.on('tracePlugin-stateChange', newState => {
            const from = newState.selectedFeatures.from;
            const to = newState.selectedFeatures.to;
            if (!newState.active) return;

            if ((from && !this.from) || (from && from.id != this.from.id)) {
                this.from = from;
            }

            if (to) {
                this.to = to;
            }

            this.state = newState;
            this.render();
        });

        owner.on('tracePlugin-close', () => {
            this.resetForm();
            this.render();
        });

        owner.on('tracePlugin-traceStarted', e => {
            if (e.origin === 'dialog') {
                this.loading = true;
                this.message = '{:running_msg}';
                this.messageType = 'info';
                this.render();
            }
        });

        owner.on('tracePlugin-traceComplete', o => {
            this.loading = false;
            this.message = o.msg;
            this.messageType = o.msgType;
            this.render();
        });

        owner.on('tabPanel-activeTab', () => {
            this.message = '';
            this.render();
        });
    }

    formatDistance(val) {
        const defaultUnit = myw.applicationDefinition.displayUnits.length;
        const lengthConfig = this.app.system.settings['core.units'].length;
        const unitScale = new UnitScale(lengthConfig);
        const unit = unitScale.value(val, 'm');
        return unit.toString(defaultUnit);
    }
}
