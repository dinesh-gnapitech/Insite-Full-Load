// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { BaseTracePane } from './baseTracePane';
import { Form, Input, Dropdown, PrimaryButton, UnitInput } from 'myWorld/uiComponents/';

export class TraceFindRoutePane extends BaseTracePane {
    static {
        this.prototype.className = 'trace-find-route-pane';
        this.prototype.messageGroup = 'TracePlugin';
    }

    async render() {
        if (this.from && this.to) {
            await this.validNetwork();
        }
        super.render();
        const self = this;
        const valid = this.from && this.to && this.network && this.isNetworkValid;

        const fromTitle = this.from?.getTitle() || '';

        const form = new Form({
            messageGroup: 'TracePlugin',
            rows: [
                {
                    label: '{:from_label}:',
                    components: [
                        new Input({
                            value: fromTitle,
                            disabled: true,
                            style: `flex: 1; min-width: ${fromTitle.length * 7.7}px`
                        }),
                        new PrimaryButton({
                            text: '{:set_button_title}',
                            disabled: !this.options.app.currentFeature,
                            onClick: () => {
                                const feature = this.options.app.currentFeature;
                                if (!feature) {
                                    alert(this.msg('select_feature_error_msg'));
                                    return;
                                }
                                this.app.setCurrentFeature(feature);
                                this.owner.fire('tracePlugin-setFromFeature', { feature: feature });
                            }
                        })
                    ]
                },
                {
                    label: '{:to_label}:',
                    components: [
                        new Input({
                            value: this.to?._myw.title || '',
                            disabled: true,
                            style: `flex: 1; min-width: ${
                                (this.to?._myw.title.length || 0) * 7.7
                            }px`
                        }),
                        new PrimaryButton({
                            text: '{:set_button_title}',
                            disabled: !this.options.app.currentFeature,
                            onClick: () => {
                                const feature = this.options.app.currentFeature;
                                if (!feature) {
                                    alert(this.msg('select_feature_error_msg'));
                                    return;
                                }
                                this.app.setCurrentFeature(feature);
                                this.owner.fire('tracePlugin-setToFeature', { feature: feature });
                            }
                        })
                    ]
                },
                {
                    label: '{:network_label}:',
                    components: [
                        new Dropdown({
                            options: this.state?.availableNetworks || [],
                            disabled: !this.state?.availableNetworks.length,
                            placeholder: !this.state?.availableNetworks.length
                                ? this.msg('no_networks')
                                : null,
                            selected: this.network,
                            cssClass: 'large',
                            onChange: input => {
                                self.network = input.getValue();
                                this.render();
                            }
                        })
                    ]
                },
                {
                    label: '{:max_dist_label}:',
                    components: [
                        new UnitInput({
                            unitScaleDef: this.app.system.settings['core.units'].length,
                            defaultUnit: myw.applicationDefinition.displayUnits.length,
                            cssClass: 'medium',
                            value: this.maxDist,
                            onChange: function (input) {
                                try {
                                    self.maxDist = input.getUnitValue().toString();
                                    self.maxDistScaled = input.getUnitValue().valueIn('m');
                                } catch (e) {
                                    self.maxDist = input.getValue();
                                    self.maxDistScaled = null;
                                }
                            }
                        })
                    ]
                }
            ],
            bottomLeft: [
                new PrimaryButton({
                    text: '{:trace_button_title}',
                    disabled: !valid,
                    loading: this.loading,
                    onClick: () => {
                        this.doTrace();
                    }
                }),
                this.messageType != 'error'
                    ? `<span style="margin-left: 10px">${this.message}</span>`
                    : ''
            ],
            bottomRight: [
                new PrimaryButton({
                    id: 'zoomTo',
                    title: '{:zoom_to_results_tip}',
                    disabled: this.app.currentFeatureSet.items.length == 0,
                    onClick: () => {
                        this.app.map.fitBoundsToFeatures(this.app.currentFeatureSet.items);
                    }
                }),
                new PrimaryButton({
                    id: 'clearResults',
                    title: '{:clear_selections_tip}',
                    disabled: this.app.currentFeatureSet.items.length == 0,
                    onClick: () => {
                        this.options.app.clearResults();
                        this.message = '';
                        this.render();
                    }
                })
            ]
        });
        this.$el.append(form.$el);
    }

    /**
     * Dsiplays warning message if 'to' feature is not in the chosen network
     */
    async validNetwork() {
        const fromNetworks = await this.from.getNetworks();
        const toNetworks = await this.to.getNetworks();
        if (toNetworks[this.network] && fromNetworks[this.network]) {
            //To and from feature are in chosen network, so remove message and allow trace
            if (this.messageType == 'error') {
                this.message = '';
                this.messageType = '';
            }

            this.isNetworkValid = true;
        } else {
            this.isNetworkValid = false;
            //Find network label to display
            const chosenNetwork = this.state.availableNetworks.find(
                network => network.id == this.network
            );
            //Create message
            this.message = this.msg('wrong_network', {
                feature: this.to._myw.title,
                network: chosenNetwork?.label
            });
            this.messageType = 'error';
        }
    }

    doTrace() {
        const self = this;
        this.options.app.clearResults();
        self.owner.fire('tracePlugin-traceStarted', { origin: 'dialog' });
        this.from.datasource
            .shortestPath(this.network, this.from, this.to.getUrn(), {
                resultType: 'tree',
                maxDist: this.maxDistScaled
            })
            .then(res => {
                if (res.items.length) {
                    self.options.app.setCurrentFeatureSet(res);
                    self.options.app.map.fitBoundsToFeatures(
                        self.options.app.currentFeatureSet.items
                    );
                    const nodes = Object.values(res.nodes);
                    const totalDist = nodes[nodes.length - 1].dist;
                    const message = `${res.items.length} ${self.msg(
                        'found_msg'
                    )} (${self.formatDistance(totalDist)})`;
                    self.owner.fire('tracePlugin-traceComplete', { msg: message, type: 'info' });
                    return;
                }
                self.owner.fire('tracePlugin-traceComplete', {
                    msg: self.msg('no_results'),
                    msgType: 'info'
                });
            })
            .catch(err => {
                console.log(err.stack);
                self.owner.fire('tracePlugin-traceComplete', {
                    msg: err.message,
                    msgType: 'error'
                });
            });
    }
}

export default TraceFindRoutePane;
