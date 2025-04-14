import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Input } from 'antd';
import { CloseCircleOutlined, SearchOutlined } from '@ant-design/icons';

export class SearchInput extends Component {
    static propTypes = {
        style: PropTypes.any,
        onClear: PropTypes.func,
        onChange: PropTypes.func,
        value: PropTypes.string
    };

    constructor(props) {
        super(props);
        this.state = { visible: false, val: props.value || '' };
        this.input = React.createRef();
    }

    componentDidMount() {
        this.input.current.focus();
        this.setState({ val: this.props.value });
    }

    handleChange(e) {
        this.setState({ val: e.target.value });
        this.props.onChange(e.target.value);
    }

    handleClear(e) {
        this.setState({ val: '' });
        this.props.onClear();
    }

    renderClear() {
        return this.props.value?.length ? (
            <CloseCircleOutlined className="clear" onClick={this.handleClear.bind(this)} />
        ) : null;
    }

    render() {
        return (
            <div className="search-input" style={this.props.style}>
                <SearchOutlined className="prefix" />
                <Input
                    ref={this.input}
                    onChange={this.handleChange.bind(this)}
                    value={this.props.value}
                />
                {this.renderClear()}
            </div>
        );
    }
}
