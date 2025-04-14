import React, { Component } from 'react';
import { message, Collapse } from 'antd';
import { SearchExamples } from './SearchExamples';
import { StylesView } from './SystemStyles/StylesView';
import { SaveCancelButtons } from './SaveCancelButtons';
import { inject, observer } from 'mobx-react';
import { ScrollableView, localise, onControlS, ErrorMsg } from '../../shared';
import { UnitsEditor } from '../../shared/FieldEditors/UnitsEditor';

const { Panel } = Collapse;

@inject('store')
@localise('settings')
@observer
export class SystemTab extends Component {
    constructor(props) {
        super(props);
        this.state = {
            saving: false, //localisation of modules supplying tabs
            unitData: [],
            updatedStyles: [],
            userTriggeredChange: false
        };

        message.config({
            maxCount: 1
        });
    }

    /**
     * @param {Object} data
     * Formats input object into array so that unitEditor can handle duplicate keys
     */
    static formatUnitData(data) {
        return Object.entries(data).map(([row, value], i) => ({
            scale: row,
            units: value.units,
            base_unit: value.base_unit,
            key: i
        }));
    }

    /**
     * Converts input array back into form expected from store
     * Formats unitEditor data into form expected form store
     * @param {Array} arr
     */
    arrToObj(arr) {
        const tempArr = [...arr];
        tempArr.map(row => {
            return { ...row };
        });
        const toReturn = {};
        tempArr.map(obj => {
            const temp = { ...obj };
            delete temp['key'];
            const key = temp['scale'];
            delete temp['scale'];
            toReturn[key] = temp;
        });

        return toReturn;
    }

    onChange = data => {
        this.setState({ unitData: data, userTriggeredChange: true });
    };

    /**
     * Passed into Units Editor as a prop, used when invalid data is entered to prevent the component saving
     */
    preventSave = check => {
        this.setState({ preventSave: check });
    };

    componentDidMount() {
        this.onControlSSave = onControlS(this.handleSave);
        document.addEventListener('keydown', this.onControlSSave);
    }

    static getDerivedStateFromProps(props, state) {
        const ret = { userTriggeredChange: false };
        if (!state.userTriggeredChange) {
            //  If the user has not triggered a change, we can infer that it was caused external to this object,
            //  eg. Pressing the cancel button
            ret.unitData = SystemTab.formatUnitData(
                JSON.parse(props.store.settingsStore.store['core.units'].value)
            );
        }
        return ret;
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.onControlSSave);
    }

    render() {
        const { msg } = this.props;
        const { saving } = this.state;

        return (
            <ScrollableView topOffset={170} bottomOffset={15}>
                <Collapse className="system-settings-panels" accordion bordered={false}>
                    <Panel header={<div>{msg('search_examples')}</div>} key="search_examples">
                        <SearchExamples />
                    </Panel>
                    <Panel header={<div>{msg('units')}</div>} key="units">
                        <UnitsEditor
                            data={this.state.unitData}
                            store={this.props.store.settingsStore}
                            msg={msg}
                            onChange={this.onChange}
                            preventSave={this.preventSave}
                        />
                    </Panel>
                    <Panel header={msg('system_styles')} key="system_styles">
                        <StylesView onChange={this.onStyleChange} />
                    </Panel>

                    <SaveCancelButtons handleSave={() => this.handleSave()} saving={saving} />
                </Collapse>
            </ScrollableView>
        );
    }

    /**
     * Keeps strack of with style settings were updated
     * To avoid updating all the styles everytime we save
     */
    onStyleChange = styleName => {
        this.setState((prevState, prop) => {
            const updatedStyles = [...prevState.updatedStyles];
            if (!updatedStyles.includes(styleName)) {
                updatedStyles.push(styleName);
            }
            return { updatedStyles };
        });
    };

    async handleSave() {
        if (this.state.preventSave) return;
        const { msg } = this.props;
        const store = this.props.store.settingsStore;
        this.props.store.settingsStore.setValue('core.units', this.arrToObj(this.state.unitData)); //Set data in unitEditor to store
        this.setState({ saving: true });

        const styleUpdatePromises = [];

        this.state.updatedStyles.forEach(settingName => {
            styleUpdatePromises.push(store.update(settingName, store.store[settingName]));
        });
        Promise.all([
            ...[
                store.update('core.searchExamples', store.store['core.searchExamples']),
                store.update('core.units', store.store['core.units'])
            ],
            ...styleUpdatePromises
        ])
            .then(() => {
                message.success(msg('saved'));
                this.setState({ saving: false });
            })
            .catch(error => {
                message.error(ErrorMsg.getMsgFor(error, true, msg));
                this.setState({ saving: false });
            });

        this.setState({ updatedStyles: [] });
    }
}
