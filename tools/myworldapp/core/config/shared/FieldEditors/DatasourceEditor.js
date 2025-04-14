import React, { Component } from 'react';
import { Input, Select } from 'antd';
import { inject, observer } from 'mobx-react';
const Option = Select.Option;
import gotoImg from 'images/goto.png';

@inject('store')
@observer
export class DatasourceEditor extends Component {
    constructor(props) {
        super(props);
        this.state = { value: '', showLink: false };
    }

    async componentDidMount() {
        const { value, store } = this.props;
        const showLink = await store.permissionStore.userCurrentlyHasPermission('datasources');
        this.setState({ value, showLink });
    }

    render() {
        const { options, dsType, msg, value, onChange, disabled } = this.props;
        const { showLink } = this.state;

        const link = showLink ? (
            <a
                title={msg('view_datasource')}
                className="linkToEdit"
                href={`./config.html#/datasources/${value}/edit`}
            >
                <img
                    className={!this.state.showLinkIcon ? 'hidden' : ''}
                    alt="View"
                    src={gotoImg}
                />
            </a>
        ) : null;

        let editor = (
            <Input
                style={{ width: '200px', marginRight: '10px' }}
                disabled={disabled}
                value={value}
            />
        );

        if (options) {
            editor = (
                <Select
                    showSearch
                    value={value}
                    style={{ width: '200px', marginRight: '10px' }}
                    onChange={onChange.bind(this)}
                >
                    {options.map(ds => (
                        <Option key={ds} value={ds}>
                            {ds}
                        </Option>
                    ))}
                </Select>
            );
        }
        return (
            <span
                onPointerEnter={this.toggleLinkIcon}
                onPointerLeave={this.toggleLinkIcon.bind(this)}
                className="render-field-editor"
            >
                {editor}
                <span className="test-no-print"> {`${msg('type')}: ${dsType}`}</span>
                {link}
            </span>
        );
    }

    toggleLinkIcon = () => {
        this.setState((prevState, props) => ({ showLinkIcon: !prevState.showLinkIcon }));
    };
}
