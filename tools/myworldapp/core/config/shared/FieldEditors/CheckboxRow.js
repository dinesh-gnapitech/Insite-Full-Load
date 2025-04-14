import { observer } from 'mobx-react';
import { Checkbox } from 'antd';
import React, { Component } from 'react';
import { localise } from '../Localise';
import gotoImg from 'images/goto.png';

@localise('fieldEditor')
@observer
export class CheckboxRow extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showLinkIcon: false
        };
    }

    render() {
        const { msg, value, label, itemRepresents, selected, showLink = true } = this.props;

        const link = showLink ? (
            <a
                title={msg('view')}
                className="linkToEdit"
                href={`./config.html#${itemRepresents}s/${value}/edit`}
            >
                <img
                    className={!this.state.showLinkIcon ? 'hidden' : ''}
                    alt="View"
                    src={gotoImg}
                />
            </a>
        ) : null;

        return (
            <li
                className="checkboxRow"
                onPointerEnter={this.toggleLinkIcon}
                onPointerLeave={this.toggleLinkIcon.bind(this)}
            >
                <Checkbox checked={selected} onChange={this.onChange}>
                    {label}
                </Checkbox>
                {link}
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
