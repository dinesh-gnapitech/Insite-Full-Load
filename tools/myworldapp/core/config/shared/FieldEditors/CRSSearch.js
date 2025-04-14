// Copyright: IQGeo Limited 2010-2023
import React from 'react';
import { Select } from 'antd';
import { localise } from '../Localise';

@localise('layers')
export class CRSSearch extends React.Component {
    state = {
        value: null,
        options: [],
        fetched: false
    };

    static getDerivedStateFromProps(props) {
        if ('value' in props) {
            const value = props.value;
            return { value };
        }
    }

    render() {
        const { msg, value, onChange } = this.props;
        const { options, fetched } = this.state;

        return (
            <Select
                style={{ width: '300px' }}
                placeholder={msg('select_crs')}
                allowClear={true}
                showSearch={true}
                onSearch={this._ensureOptions}
                value={value}
                options={options}
                notFoundContent={fetched ? <div>{msg('no_matching_crs_found')}</div> : null}
                onChange={onChange}
            />
        );
    }

    _ensureOptions = async () => {
        const { fetched } = this.state;
        if (!fetched) {
            const res = await fetch(`system/crs`);
            const resJson = await res.json();
            this.setState({
                options: resJson.keys.map(val => ({
                    label: `EPSG:${val}`,
                    value: `EPSG:${val}`
                })),
                fetched: true
            });
        }
    };
}
