import React, { useMemo, useState } from 'react';
import { Button, Input, DraggableModal } from 'myWorld/uiComponents/react';
import { Col, Row } from 'antd';
import Icon from '@ant-design/icons/lib/components/Icon';
import ReverseSvg from 'images/actions/reverse-direction.svg';
import CurrentLocationSvg from 'images/location.svg';

export const DirectionsDialog = ({ plugin, open, toAddress }) => {
    const [isModalOpen, setIsModalOpen] = useState(open);
    const [fromAddress, setFromAddress] = useState('');
    const [destAddress, setDestAddress] = useState(toAddress); //Destination address

    const handleGetDirections = () => {
        goToDirectionsUrl();
        plugin.app.recordFunctionalityAccess('core.details_tab.get_directions');
    };

    const handleCancel = () => {
        setIsModalOpen(false);
    };

    /**
     * Open another tab with the url for a google search directions search to the address of the currentFeature
     */
    const goToDirectionsUrl = () => {
        window.open(
            `http://maps.google.com/maps?saddr=${encodeURIComponent(
                fromAddress
            )}&daddr=${encodeURIComponent(destAddress)}`
        );
    };

    const generateCurrentLocation = () => plugin.generateCurrentLocation(setFromAddress);
    /**
     * Exchanges the values of the from and to input fields
     */
    const reverseDirection = () => {
        const from = fromAddress;
        const dest = destAddress;
        setFromAddress(dest);
        setDestAddress(from);
    };

    /**
     * In the event of return key press executed the goToDirectionsUrl method
     */
    const handleReturnKeypress = event => {
        if (event.which == 13) {
            goToDirectionsUrl();
        }
    };

    const Img = ({ src, alt, title, onClick, className }) => {
        return (
            <Icon
                className={className}
                style={{ cursor: 'pointer' }}
                component={() => <img src={src} alt={alt} title={title} />}
                onClick={onClick}
            />
        );
    };

    return (
        <DraggableModal
            title={plugin.msg('directions_title')}
            open={isModalOpen}
            onCancel={handleCancel}
            footer={[
                <Button key="cancel" onClick={handleCancel}>
                    {plugin.msg('close_btn')}
                </Button>,
                <Button key="get_directions" type="primary" onClick={handleGetDirections}>
                    {plugin.msg('get_directions')}
                </Button>
            ]}
        >
            <Row align="middle">
                <Col span={22}>
                    <Row gutter={[16, 16]}>
                        <Col span={24}>
                            <Input
                                addonBefore={
                                    <button className="ui-button icon-only-btn current-loc-btn">
                                        {useMemo(
                                            () => (
                                                <Img
                                                    src={CurrentLocationSvg}
                                                    alt={plugin.msg('use_my_location')}
                                                    title={plugin.msg('use_my_location')}
                                                    onClick={generateCurrentLocation}
                                                />
                                            ),
                                            []
                                        )}
                                    </button>
                                }
                                placeholder={plugin.msg('directions_from_placeholder')}
                                value={fromAddress}
                                onKeyUp={handleReturnKeypress}
                                onChange={e => setFromAddress(e.target.value)}
                            />
                        </Col>
                        <Col span={24}>
                            <Input
                                className="to-address"
                                addonBefore="To"
                                value={destAddress}
                                placeholder={plugin.msg('directions_to_placeholder')}
                                onKeyUp={handleReturnKeypress}
                                onChange={e => setDestAddress(e.target.value)}
                            />
                        </Col>
                    </Row>
                </Col>
                <Col span={2}>
                    <button
                        className="ui-button icon-only-btn reverse-directions-btn"
                        onClick={reverseDirection}
                    >
                        {useMemo(
                            () => (
                                <Img
                                    className="reverse-directions-icon"
                                    src={ReverseSvg}
                                    alt={plugin.msg('reverse_directions_title')}
                                    title={plugin.msg('reverse_directions_title')}
                                />
                            ),
                            []
                        )}
                    </button>
                </Col>
            </Row>
        </DraggableModal>
    );
};
