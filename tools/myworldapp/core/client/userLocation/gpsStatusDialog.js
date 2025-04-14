import myw from 'myWorld-base';
import React, { useEffect, useRef, useState } from 'react';
import {
    renderReactNode,
    Table,
    Button,
    Input,
    Select,
    Spin,
    Descriptions,
    DescriptionsItem
} from 'myWorld/uiComponents/react';
import { SyncOutlined } from '@ant-design/icons';
import Dialog from 'myWorld/uiComponents/dialog';

export class GPSStatusDialog extends Dialog {
    static {
        this.prototype.className = 'gps-status-dialog';

        this.mergeOptions({
            autoOpen: false,
            closeOnEscape: false,
            contents: <div id="gps-status-dialog-content" className="antd-component no-close" />,
            destroyOnClose: true,
            width: 600
        });
    }

    constructor(owner, options) {
        //  Normal props
        const app = owner.app;
        const { userLocation } = app;

        // Changes options depending on if we're in handheld mode
        const vertPos = owner.app.isHandheld ? 'botton' : 'top';
        const buttons = [
            {
                id: 'locator_sel_close_btn',
                text: owner.msg('close_btn'),
                click: () => {
                    this.close();
                }
            }
        ];
        if (userLocation.hasDynamicLocators()) {
            buttons.push({
                id: 'locator_sel_refresh_btn',
                text: owner.msg('refresh_btn'),
                click: () => {
                    if (!this.isRefreshingDevices) {
                        this.userLocation.refreshAvailableLocators(true);
                        //  Add a fake feedback spinner here to show that devices are refreshing.
                        //  In the native app, the timeout is set to 3 seconds, so give it 5 here for good measure
                        //  ENH: Find a way to get actual feedback from app
                        this.isRefreshingDevices = true;
                        this.renderReact();

                        setTimeout(() => {
                            this.isRefreshingDevices = false;
                            this.renderReact();
                        }, 5000);
                    }
                }
            });
        }

        super({
            title: owner.msg('gps_locator_dialog_title'),
            position: { my: `center ${vertPos}`, at: `center ${vertPos}`, of: window },
            modal: !!app.isHandheld,
            buttons,
            ...options
        });
        this.owner = owner;
        this.userLocation = userLocation;
        this.statusRefreshInterval = null;
        //  React props
        this.disabledLocators = [];
        this.statuses = {};
        this.isRefreshingDevices = false;

        this.render = this.render.bind(this);
    }

    open() {
        this.disabledLocators = [];
        this.statuses = {};

        this.userLocation.locators.forEach(locator => {
            if (locator.isAvailable() === false) this.disabledLocators.push(locator.key);
        }, []);

        this.render();
        super.open();
        this.app.userLocation.on('tracking-changed', this.render);
    }

    close() {
        this.unmountReactDom();
        super.close();
        this._hasBeenRendered = false;
        this.app.userLocation.off('tracking-changed', this.render);
    }

    render() {
        if (!this._hasBeenRendered) {
            super.render();
            this._hasBeenRendered = true;
        }
        this.renderReact();
    }

    renderReact() {
        this.renderRoot = renderReactNode(
            this.el,
            GPSStatusDialogContents,
            {
                owner: this.owner,
                selected: this.userLocation.isTracking ? this.userLocation.activeLocator : null,
                disabled: this.disabledLocators,
                statuses: this.statuses,
                isRefreshingDevices: this.isRefreshingDevices,
                onLocatorSelected: locator => this.selectLocatorItem(locator),
                getGPSStatuses: this.getGPSStatuses.bind(this),
                stopTracking: this.stopTracking.bind(this)
            },
            this.renderRoot
        );
    }

    //Unmount all the components in the renderRoot and “detach” React from the root DOM node
    unmountReactDom() {
        this.renderRoot?.unmount();
        this.renderRoot = undefined;
    }

    selectLocatorItem(locator) {
        this.owner.setLocator(locator, { forceStartTracking: true });
        this.renderReact();
    }

    getGPSStatuses() {
        this.owner.app.userLocation.locators.forEach(locator => {
            //  isAvailable can be true, false or null f its indeterminate, so start polling if its not true
            const locatorAvailable = locator.isAvailable();
            if (locatorAvailable === true) {
                if (this.enableLocatorItem(locator.key)) {
                    this.statuses[locator.key] = { quality: 'status_checking' };
                }
            } else {
                if (this.disableLocatorItem(locator.key)) {
                    this.statuses[locator.key] = { quality: 'status_none' };
                }
                locator.startTracking();
            }

            this.processGpsLocatorStatusResult(locator);
        });
        return {
            selected: this.userLocation.isTracking ? this.userLocation.activeLocator : null,
            disabled: this.disabledLocators,
            statuses: this.statuses,
            isRefreshingDevices: this.isRefreshingDevices
        };
    }

    stopTracking() {
        const userLocation = this.owner.app.userLocation;
        userLocation.locators.forEach(locator => {
            if (userLocation.isTracking && userLocation.activeLocator === locator) return; //keep tracking on the active locator
            locator.stopTracking();
        });
    }

    processGpsLocatorStatusResult(locator) {
        const locatorKey = locator.key;
        let status;
        const { accuracy, dop } = locator;

        if (!dop && !accuracy) status = 'checking';
        else if (!dop && accuracy) status = 'no_dop';
        else if (dop < 2) status = 'excellent';
        else if (dop >= 2 && dop < 5) status = 'good';
        else if (dop >= 5 && dop < 10) status = 'moderate';
        else if (dop >= 10 && dop < 20) status = 'fair';
        else if (dop >= 20) status = 'poor';

        if (status) {
            this.statuses[locatorKey] = {
                dop: dop && Math.round(dop * 100) / 100, //  Round to 2 decimal places
                accuracy: accuracy && Math.round(accuracy * 100) / 100, //  Round to 2 decimal places
                quality: `status_${status}`
            };
        }
    }

    disableLocatorItem(itemKey) {
        if (this.disabledLocators.includes(itemKey)) return false;

        this.disabledLocators.push(itemKey);
        return true;
    }

    enableLocatorItem(itemKey) {
        const index = this.disabledLocators.indexOf(itemKey);
        if (index == -1) return false;

        this.disabledLocators.splice(index, 1);
        return true;
    }
}

export class OptionsPanel extends React.Component {
    shouldComponentUpdate() {
        return false;
    }

    render() {
        const { msg, locator } = this.props;
        const options = {};
        const fields = locator.getOptions().map(field => {
            const { key, value, label, type, ...otherOpts } = field;
            options[key] = value;
            let embedded = null;
            switch (type) {
                case 'string':
                    embedded = (
                        <Input
                            defaultValue={options[key]}
                            onChange={event => (options[key] = event.target.value)}
                            {...otherOpts}
                        />
                    );
                    break;

                case 'number':
                    embedded = (
                        <Input
                            type="number"
                            defaultValue={options[key]}
                            onChange={event => (options[key] = parseInt(event.target.value))}
                            {...otherOpts}
                        />
                    );
                    break;

                case 'select':
                    {
                        const { values } = otherOpts;
                        delete otherOpts['values'];
                        embedded = (
                            <Select
                                defaultValue={options[key]}
                                onChange={value => (options[key] = value)}
                                {...otherOpts}
                            >
                                {values.map(([val, label]) => (
                                    <Select.Option key={val} value={val}>
                                        {label}
                                    </Select.Option>
                                ))}
                            </Select>
                        );
                    }
                    break;

                default:
                    break;
            }

            return (
                <DescriptionsItem key={key} label={label}>
                    {embedded}
                </DescriptionsItem>
            );
        });

        return (
            <>
                <Descriptions title={`${msg('settings')}:`} column={2} bordered>
                    {fields}
                </Descriptions>
                <Button onClick={() => locator.setOptions(options)}>{msg('ok_btn')}</Button>
            </>
        );
    }
}

export const GPSStatusDialogContents = function (props) {
    const { owner, onLocatorSelected, getGPSStatuses, stopTracking } = props;
    const [expandedRows, setExpandedRows] = useState([]);
    const [{ selected, disabled, statuses, isRefreshingDevices }, setGPSTableStatuses] = useState({
        selected: props.selected,
        disabled: props.disabled,
        statuses: props.statuses,
        isRefreshingDevices: props.isRefreshingDevices
    });

    const statusRefreshIntervalRef = useRef(null);

    const msg = myw.msg.bind(myw.msg, 'GpsStatusPlugin');
    const userLocation = owner.app.userLocation;

    const columns = [
        {
            title: msg('gps_name'),
            dataIndex: 'name'
        },
        {
            title: msg('gps_accuracy'),
            dataIndex: 'status',
            render: status => {
                const accuracy = status?.accuracy;
                return <span>{accuracy ? `${accuracy.toFixed(3)}m` : '-'}</span>;
            }
        },
        {
            title: msg('gps_dop'),
            colSpan: 2,
            dataIndex: 'status',
            render: status => {
                return <span>{status?.dop ?? '-'}</span>;
            }
        },
        {
            dataIndex: 'status',
            colSpan: 0,
            width: 36,
            render: status => {
                return <span>{status ? msg(status.quality) : ''}</span>;
            }
        }
    ];
    const data = userLocation.locators
        .filter(locator => locator.isAvailable() === true)
        .map(locator => ({
            key: locator.key,
            name: locator.name,
            status: statuses[locator.key],
            locator
        }));

    const handleRowExpand = (expanded, record) => {
        const key = record.key;

        if (expanded) {
            setExpandedRows([...expandedRows, key]);
        } else {
            setExpandedRows(expandedRows.filter(rowKey => rowKey !== key));
        }
    };

    const startGPSStatusPolling = () => {
        const intervalId = setInterval(() => {
            const newGPSTableStatuses = getGPSStatuses();
            setGPSTableStatuses(newGPSTableStatuses);
        }, 1000);
        statusRefreshIntervalRef.current = intervalId;
    };

    const stopGPSStatusPolling = () => {
        clearInterval(statusRefreshIntervalRef.current);
        statusRefreshIntervalRef.current = null;
        stopTracking();
    };

    useEffect(() => {
        startGPSStatusPolling(); // Start polling when the component mounts
        return () => {
            stopGPSStatusPolling(); // Stop polling when the component unmounts
        };
    }, []); // Empty dependency array ensures the effect runs only once during component mount

    return (
        <>
            <Table
                className="antd-component antd-globals"
                size="small"
                rowSelection={{
                    type: 'radio',
                    selectedRowKeys: selected ? [selected.key] : null,
                    onSelect: row => {
                        const { locator, key } = row;
                        if (disabled.includes(key) || statuses[key]?.quality === 'status_checking')
                            return;
                        onLocatorSelected(locator);
                    }
                }}
                expandable={{
                    rowExpandable: record => record.locator.getOptions,
                    expandedRowRender: record => (
                        <OptionsPanel msg={msg} locator={record.locator} />
                    ),
                    expandedRowKeys: expandedRows,
                    onExpand: handleRowExpand
                }}
                columns={columns}
                dataSource={data}
                pagination={false}
            />
            {isRefreshingDevices && (
                <Spin
                    tip="Refreshing devices..."
                    indicator={<SyncOutlined spin />}
                    style={{ width: '100%' }}
                />
            )}
        </>
    );
};

export default GPSStatusDialog;
