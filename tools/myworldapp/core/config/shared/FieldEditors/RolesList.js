import React, { Component } from 'react';
import { Checkbox } from 'antd';
import { inject } from 'mobx-react';
import gotoImg from 'images/goto.png';

class CheckboxRow extends Component {
    /**
     *
     * @param {Object} props
     * @param {Array}    props.value              Array of roles to display in the list
     * @param {function} props.onChange           Method to call when there is a change to the list
     * @param {function} props.valProp            The property ("id" or "name") of the role used for selection and to send back when there is a change.
     * @param {Array}    [props.disabledRoles]    (Optional) Roles that should not be added/deleted from the list.
     *                                             Array of ids or names depending on the valProp.
     *                                             They show up as selected/checked
     * @param {function}   props.msg               Message localisation function
     */
    constructor(props) {
        super(props);
        this.state = {
            showLinkIcon: false
        };
    }

    render() {
        const {
            msg,
            val,
            id,
            label,
            itemRepresents,
            value,
            disabled,
            showLink = true
        } = this.props;
        const selected = value.includes(val);

        const link = showLink ? (
            <a
                title={msg('view_role')}
                className="linkToEdit"
                href={`./config.html#${itemRepresents}s/${id}/edit`}
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
                className="checkboxRow user-form"
                onPointerEnter={this.toggleLinkIcon}
                onPointerLeave={this.toggleLinkIcon.bind(this)}
            >
                <Checkbox
                    checked={selected || disabled}
                    onChange={this.onChange}
                    disabled={disabled}
                >
                    {label}
                </Checkbox>
                {link}
            </li>
        );
    }

    onChange = ev => {
        this.props.onChange(this.props.val, ev.target.checked);
    };

    toggleLinkIcon = () => {
        this.setState((prevState, props) => ({ showLinkIcon: !prevState.showLinkIcon }));
    };
}

@inject('store')
export class RolesList extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showLink: false
        };
    }

    async componentDidMount() {
        const { store } = this.props;
        const showLink = await store.permissionStore.userCurrentlyHasPermission('roles');
        this.setState({ showLink });
    }

    render() {
        const { msg, value, valProp, disabledRoles } = this.props;
        const { showLink } = this.state;
        return (
            <ul className="noStyleList">
                {this.props.roles.map(item => {
                    return (
                        <CheckboxRow
                            key={item.id}
                            val={item[valProp]}
                            label={item.name}
                            id={item.id}
                            itemRepresents="role"
                            msg={msg}
                            value={value}
                            showLink={showLink}
                            onChange={this.onChange.bind(this)}
                            disabled={disabledRoles?.includes(item[valProp])}
                        />
                    );
                })}
            </ul>
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
