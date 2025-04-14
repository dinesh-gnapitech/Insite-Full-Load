// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-base';
import { Form, Input, PrimaryButton, Dropdown, UnitInput } from 'myWorld/uiComponents/';
import { BaseTracePane } from './baseTracePane';

export class TraceOutPane extends BaseTracePane {
    static {
        this.prototype.className = 'trace-out-pane';
        this.prototype.messageGroup = 'TracePlugin';
    }

    render() {
        super.render();
        const self = this;
        this.validUnit = typeof this.validUnit == 'undefined' ? true : this.validUnit; //Set validUnit to true by default
        const valid = !!(this.from && this.network && this.direction) && this.validUnit;

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
                                this.network = input.getValue();
                                this.render();
                            }
                        }),
                        new Dropdown({
                            options: this.subPaths,
                            disabled: !this.subPaths.length,
                            placeholder: !this.subPaths.length ? 'No sub paths' : null,
                            selected: this.subPath,
                            visible: this.subPaths.length,
                            cssClass: 'large',
                            onChange: input => {
                                self.subPath = input.getValue();
                                this.render();
                            }
                        })
                    ]
                },
                {
                    label: '{:direction_label}:',
                    components: [
                        new Dropdown({
                            options: this.state?.availableDirections || [],
                            disabled: !this.state?.availableDirections.length,
                            placeholder: !this.state?.availableDirections.length
                                ? this.msg('no_directions')
                                : null,
                            selected: this.direction,
                            cssClass: 'large',
                            onChange: function (input) {
                                self.direction = input.getValue();
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
                                    if (!input.getValue()) {
                                        //Null input is valid for trace
                                        self.maxDist = null;
                                        self.maxDistScaled = null;
                                    } else {
                                        //Parse input string
                                        self.maxDist = input.getUnitValue();
                                        self.maxDistScaled = input.getUnitValue().valueIn('m');
                                    }
                                    self.validUnit = true;
                                    self.render();
                                } catch (e) {
                                    //Handle invalid input string
                                    self.maxDist = input.getValue();
                                    self.validUnit = false;
                                    self.render();
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

    doTrace() {
        if (this.invalid) return;
        const self = this;
        this.options.app.clearResults();
        self.owner.fire('tracePlugin-traceStarted', { origin: 'dialog' });

        this.from.datasource
            .traceOut(this.network, this.subPath || this.from, {
                resultType: 'tree',
                direction: this.direction,
                maxDist: this.maxDistScaled
            })
            .then(res => {
                if (res.items.length) {
                    self.options.app.setCurrentFeatureSet(res);

                    const leaves = self.options.app.currentFeatureSet.start.getLeaves();
                    self.options.app.map.fitBoundsToFeatures(
                        self.options.app.currentFeatureSet.items
                    );
                    let message = `${res.items.length} ${self.msg('found_msg')}`;
                    if (leaves.length === 1) {
                        const leaf = leaves[0];
                        message += ` (${self.formatDistance(leaf.dist)})`;
                    }
                    self.owner.fire('tracePlugin-traceComplete', { type: 'info', msg: message });

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

export default TraceOutPane;
