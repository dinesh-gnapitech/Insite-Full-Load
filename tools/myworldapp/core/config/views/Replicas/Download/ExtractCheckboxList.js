import { inject, observer } from 'mobx-react';
import { Checkbox } from 'antd';
import React, { Component } from 'react';
import { localise } from '../../../shared/Localise';
import { ExtractCheckboxRow } from './ExtractCheckboxRow';

@inject('store')
@localise('fieldEditor')
@observer
/**
 * Used in the Role Downloads form
 */
export class ExtractCheckboxList extends Component {
    componentDidMount() {
        this.props.store.extractStore.getAll();
    }

    render() {
        this.options = this.props.options;
        const { msg, itemRepresents, store, onAllFieldChange, extractsForAll } = this.props;
        const allExtracts = this.props.value.includes('all');
        return (
            <div style={{ width: '500px' }}>
                <div className="select-all">
                    <Checkbox
                        className="select-all"
                        onChange={onAllFieldChange}
                        checked={allExtracts}
                    >
                        {msg('select_all')}
                    </Checkbox>
                </div>
                {!allExtracts && (
                    <ul className="noStyleList">
                        {this.options.map(item => {
                            const selected =
                                this.props.value.includes(item.value) ||
                                extractsForAll.includes(item.value);
                            const disabled = extractsForAll.includes(item.value);
                            return (
                                <ExtractCheckboxRow
                                    key={item.value}
                                    value={item.value}
                                    label={item.label}
                                    expiry={store.extractStore.store[item.value].expiry_time}
                                    itemRepresents={itemRepresents}
                                    msg={msg}
                                    selected={selected}
                                    disabled={disabled}
                                    onChange={this.onChange}
                                />
                            );
                        })}
                    </ul>
                )}
            </div>
        );
    }

    onChange = (value, isChecked) => {
        const newValueList = this.props.value.filter(item => {
            return item !== value;
        });
        if (isChecked) newValueList.push(value);

        this.props.onChange(newValueList);
    };
}
