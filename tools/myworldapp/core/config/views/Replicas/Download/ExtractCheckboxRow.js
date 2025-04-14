import { observer } from 'mobx-react';
import { Checkbox } from 'antd';
import React, { Component } from 'react';
import { localise } from '../../../shared/Localise';
import myw from 'myWorld-base';
import gotoImg from 'images/goto.png';

@localise('fieldEditor')
@observer
export class ExtractCheckboxRow extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showLinkIcon: false
        };
    }

    render() {
        const { msg, value, label, expiry, itemRepresents, selected, disabled } = this.props;

        return (
            <li
                className="checkboxRow"
                onPointerEnter={this.toggleLinkIcon}
                onPointerLeave={this.toggleLinkIcon.bind(this)}
            >
                <Checkbox checked={selected} onChange={this.onChange} disabled={disabled}>
                    {
                        <div
                            style={{
                                display: 'inline-block',
                                verticalAlign: 'top',
                                maxWidth: '320px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}
                        >
                            {label}
                        </div>
                    }
                </Checkbox>
                <a
                    title={msg('view')}
                    className="linkToEdit"
                    href={`./config.html#/${itemRepresents}/${value}`}
                >
                    <img
                        className={!this.state.showLinkIcon ? 'hidden' : ''}
                        alt="View"
                        src={gotoImg}
                    />
                </a>
                <div style={{ float: 'right' }}>{expiry ? myw.Util.formatDate(expiry) : ''}</div>
            </li>
        );
    }

    onChange = ev => {
        this.props.onChange(this.props.value, ev.target.checked);
    };

    toggleLinkIcon = () => {
        this.setState((prevState, props) => ({ showLinkIcon: !prevState.showLinkIcon }));
    };
}
