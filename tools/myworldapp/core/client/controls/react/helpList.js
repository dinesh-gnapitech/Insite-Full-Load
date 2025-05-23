// Copyright: IQGeo Limited 2010-2023
import React from 'react';
import { List, Collapse } from 'antd';
import myw from 'myWorld-base';
import { ReadOutlined, ExclamationCircleOutlined, ShakeOutlined } from '@ant-design/icons';

/**
 * A list of help links to be used in the help tab in the left hand panel
 * @param {myw.Control} owner             The control that creates this list
 * @param {array} version_info            List of all the module, platform and schema versions
 * @param {boolean} showPatches           Whether to show the patch info or not
 * @param {function} handlePatchLinkClick Function that opens up a dialog with the patch list
    
 }} handlePatchLinkClick
 */
export const HelpList = ({ owner, versionInfo, showPatches, handlePatchLinkClick }) => {
    const { Panel } = Collapse;
    const { Item } = List;
    const moduleUserGuides = owner.options.user_guides;
    const appRoot = myw.isNativeApp
        ? owner.app.system.settings['replication.replica_sync_url']
        : '.';

    //Create data to show in the list
    const baseUserGuideLink = '/doc/User%20Guide/index.html';
    const data = [
        {
            //Link to a standalone user guide (opens a new tab)
            description: (
                <a>{owner.msg(moduleUserGuides.length ? 'base_user_guide' : 'user_guide')}</a>
            ),
            avatar: <ExclamationCircleOutlined />,
            handleClick: () => {
                window.open(`${appRoot}${baseUserGuideLink}`, '_blank').focus();
            }
        }
    ];

    //Links for module user guides as configured in the application definition file
    moduleUserGuides.forEach(([name_id, link]) => {
        data.push({
            description: <a>{owner.msg(name_id)}</a>,
            avatar: <ReadOutlined />,
            handleClick: () => {
                window.open(`${appRoot}${link}`, '_blank').focus();
            }
        });
    });

    if (showPatches) {
        data.push({
            //Link to patches installed list (opens a dialog)
            description: <a>{owner.msg('patches')}</a>,
            avatar: <ShakeOutlined />,
            handleClick: handlePatchLinkClick
        });
    }

    data.push({
        //Version info (collapsible panel)
        description: (
            <Collapse bordered={false}>
                <Panel header={owner.msg('version_info')} key="1">
                    {versionInfo.map((info, index) => (
                        <div key={index}>{info}</div>
                    ))}
                </Panel>
            </Collapse>
        ),
        avatar: '',
        handleClick: null
    });

    return (
        <List
            itemLayout="horizontal"
            dataSource={data}
            renderItem={(item, index) => {
                const { avatar, description, content, handleClick } = item;
                return (
                    <Item key={index} onClick={handleClick} style={{ cursor: 'pointer' }}>
                        <Item.Meta avatar={avatar} description={description} />
                        {content}
                    </Item>
                );
            }}
        />
    );
};
