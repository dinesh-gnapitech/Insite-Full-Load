import React, { Component } from 'react';
import { Checkbox } from 'antd';
import { localise, RolesList } from '../../../shared';

@localise('replicas')
export class DownloadRolesList extends Component {
    render() {
        const { value, msg, onAllFieldChange } = this.props;
        const allRoles = value.includes('all');
        return (
            <>
                <div>
                    <Checkbox className="select-all" onChange={onAllFieldChange} checked={allRoles}>
                        {msg('select_all')}
                    </Checkbox>
                </div>
                {!allRoles && <RolesList {...this.props}></RolesList>}
            </>
        );
    }
}
