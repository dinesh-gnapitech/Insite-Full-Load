import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Input } from 'antd';

export class SearchItem extends Component {
    static propTypes = {
        value: PropTypes.string.isRequired,
        index: PropTypes.number.isRequired,
        onSelect: PropTypes.func,
        onChange: PropTypes.func,
        selected: PropTypes.bool
    };

    render() {
        const { index, value, selected, onSelect, onChange } = this.props;

        return (
            <Input
                value={value}
                className={selected ? 'myw-search-item selected' : 'myw-search-item'}
                onSelect={e => onSelect(index, e.target.value)}
                onChange={e => onChange(index, e.target.value)}
            />
        );
    }
}
