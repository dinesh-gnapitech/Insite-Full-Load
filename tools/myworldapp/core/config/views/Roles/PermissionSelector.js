import React, { Component, Fragment } from 'react';
import { observer } from 'mobx-react';
import { Checkbox } from 'antd';
import FeatureSelect from '../../shared/FieldEditors/FeatureSelect';
import gotoImg from 'images/goto.png';

@observer
export class PermissionSelector extends Component {
    static getDerivedStateFromProps(props, state) {
        if ('value' in props) {
            const value = props.value;
            let selectedApps = { ...state.selectedApps };
            value.forEach(element => {
                if (!selectedApps[element.application_id]) {
                    selectedApps[element.application_id] = { enabled: true, rights: {} };
                }
                selectedApps[element.application_id].rights[element.right_id] = {
                    enabled: true,
                    restrictions: element.restrictions
                };
            });
            const { rights } = props;
            const accessAppRight = Object.values(rights).find(r => r.name == 'accessApplication');
            const accessAppRightId = accessAppRight?.id;

            return { selectedApps, accessAppRightId };
        }
    }
    constructor(props) {
        super(props);
        this.state = {
            selectedApps: {}
        };
    }

    handleApplicationSelection = (applicationID, selected) => {
        let selectedApps = { ...this.state.selectedApps };
        selectedApps[applicationID] = selectedApps[applicationID] || {
            rights: {
                [this.state.accessAppRightId]: {
                    enabled: true,
                    restrictions: undefined
                }
            }
        };
        selectedApps[applicationID].enabled = selected;

        this.triggerChange(selectedApps);
    };

    handleRightSelection(applicationID, rightID, e) {
        let selectedApps = { ...this.state.selectedApps };
        selectedApps[applicationID].rights[rightID] = selectedApps[applicationID].rights[
            rightID
        ] || {
            enabled: undefined,
            restrictions: undefined
        };
        selectedApps[applicationID].rights[rightID].enabled = e.target.checked;

        this.triggerChange(selectedApps);
    }

    handleRestrictionUpdate(applicationID, rightID, values) {
        let selectedApps = { ...this.state.selectedApps };
        selectedApps[applicationID].rights[rightID].restrictions = values.length
            ? values
            : undefined;
        this.triggerChange(selectedApps);
    }

    triggerChange(selectedApps) {
        this.props.onChange?.(this.serialize(selectedApps));
    }

    serialize(selectedApps) {
        let rights = [];
        Object.entries(selectedApps).map(([id, application]) => {
            if (application.enabled)
                rights = [...rights, ...this._processRights(id, application.rights)];
        });
        return rights;
    }

    _processRights(application, rights = {}) {
        let temp = [];
        Object.entries(rights).map(([rightId, right]) => {
            const { enabled, restrictions } = right;
            if (enabled)
                temp.push({ application_id: application, right_id: rightId, restrictions });
        });
        return temp;
    }

    render() {
        const { applications, msg, showLink } = this.props;
        const { selectedApps } = this.state;
        const nameComp = (a, b) =>
            a.external_name < b.external_name ? -1 : a.external_name > b.external_name ? 1 : 0;
        let appsObj = Object.values(applications).map(application => ({
            id: application.id,
            name: application.name,
            external_name: application.external_name
        }));
        appsObj.sort(nameComp);

        return (
            <div>
                {appsObj.map(application => {
                    const checked = selectedApps[application.id]?.enabled;
                    return (
                        <Fragment key={application.id}>
                            <CheckboxRow
                                mywClassName={'myw-permissions'}
                                key={application.id}
                                value={application.id}
                                label={application.name}
                                msg={msg}
                                selected={checked}
                                showLink={showLink}
                                onChange={this.handleApplicationSelection}
                            />
                            <ul className="permission-list">
                                {this.renderChildren(application, checked)}
                            </ul>
                        </Fragment>
                    );
                })}
            </div>
        );
    }

    renderChildren(application, enabled) {
        const { selectedApps } = this.state;
        const { rights, msg } = this.props;
        const descComp = (a, b) =>
            a.description < b.description ? -1 : a.description > b.description ? 1 : 0;

        if (enabled) {
            let rightsObj = Object.entries(rights).map(([id, right]) => ({
                id,
                name: right.name,
                description: right.description,
                config: right.config
            }));
            rightsObj.sort(descComp);

            const configRights = rightsObj.filter(right => right.config);
            const accessAppRight = rightsObj.find(right => right.name == 'accessApplication');
            const appRights = rightsObj.filter(
                right => right != accessAppRight && !configRights.includes(right)
            );

            const currentAppRights = application.name === 'config' ? configRights : appRights; //config app should have associated rights

            return currentAppRights.map(right => {
                const { enabled: checked, restrictions = undefined } =
                    selectedApps[application.id].rights?.[right.id] || {};
                const featureSelect =
                    right.name == 'editFeatures' && checked ? (
                        <div style={{ width: '100%', display: 'flex', gap: '10px' }}>
                            <span style={{ whiteSpace: 'nowrap' }}>{msg('restricted_to')}:</span>
                            <FeatureSelect
                                id={application.id}
                                multiple={true}
                                maxTagCount="responsive"
                                defaultValue={restrictions}
                                style={{ flexGrow: 1 }}
                                onChange={this.handleRestrictionUpdate.bind(
                                    this,
                                    application.id,
                                    right.id
                                )}
                                featureFilter={this._featureFilter}
                            />
                        </div>
                    ) : null;

                return (
                    <li
                        className={`permission-list-item ${featureSelect ? 'hasFeatures' : ''}`}
                        key={right.id}
                    >
                        <Checkbox
                            checked={checked}
                            onChange={this.handleRightSelection.bind(
                                this,
                                application.id,
                                right.id
                            )}
                        >
                            {right.description}
                        </Checkbox>
                        {featureSelect}
                    </li>
                );
            });
        }
        return null;
    }

    /**
     * Returns only the features we want to show in the FeatureSelect
     * @param {Array<Features>} features
     * @returns {Array<Features>}
     */
    async _featureFilter(features) {
        //  ENH: Make it so we can filter by the application that the <FeatureSelect> is a part of
        return features.filter(feature => feature.editable);
    }
}

class CheckboxRow extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showLinkIcon: false
        };
    }

    render() {
        const { msg, value, label, selected, mywClassName, showLink = true } = this.props;

        const link = showLink ? (
            <a
                title={msg('view_application')}
                className="linkToEdit"
                href={`./config.html#/applications/${value}/edit`}
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
                className={mywClassName ? mywClassName : 'checkboxRow'}
                onPointerEnter={this.toggleLinkIcon}
                onPointerLeave={this.toggleLinkIcon}
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
        this.setState({ showLinkIcon: !this.state.showLinkIcon });
    };
}
