// Copyright: IQGeo Limited 2010-2023
import { Plugin, PluginButton, latLng } from 'myWorld-base';
import directionsImg from 'images/actions/directions.svg';
import directionsInactiveImg from 'images/actions/directions-inactive.svg';
import { renderReactNode } from 'myWorld/uiComponents/react';
import { DirectionsDialog } from 'myWorld/controls/react';

export class DirectionsPlugin extends Plugin {
    /**
     * @class Plugin for the user to get directions between addresses and/or objects  <br/>
     * Provides a button that when pressed will display a dialog with "from" and "to" fields.
     * "To" will be populated automatically from the current object and "From" can be populated from the current device location
     * @param  {Application} owner  The application
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner);

        // application event handlers
        this.app.on('internetStatus-changed currentFeature-changed', () => {
            this.trigger('change');
        });
    }

    renderReact(open, toAddress) {
        this.renderRoot = renderReactNode(
            null,
            DirectionsDialog,
            {
                open,
                plugin: this,
                toAddress
            },
            this.renderRoot
        );
    }

    reverseGeocode(location) {
        const geocoder = this.app.getGeocoder();
        if (!geocoder) return Promise.reject(new Error('no_geocoder'));

        return geocoder.reverseGeocode(location);
    }

    /**
     * Opens the directions dialog with appropriate from and to fields
     * @param  {string} to
     */
    openDirectionsPanel(to) {
        const location = this.app.getCurrentFeatureRep()?.getCenter();
        if (!to && this.app.hasInternetAccess && location) {
            //Calculates the 'to' address
            //since phone layout calls this method directly and doesn't pass any params
            this.reverseGeocode(location)
                .then(address => {
                    if (address) this.renderReact(true, address);
                })
                .catch(error => {
                    throw error;
                });
        } else {
            this.renderReact(true, to);
        }
    }

    generateCurrentLocation(handleCurrentLocationUpdate) {
        const { app, msg } = this;

        navigator.geolocation.getCurrentPosition(
            position => {
                //success handler
                if (!position || !position.coords) {
                    return;
                }
                const location = latLng(position.coords.latitude, position.coords.longitude);
                this.reverseGeocode(location)
                    .then(theAddress => {
                        if (!theAddress) {
                            app.message(msg('problem_locating'));
                            return;
                        }
                        handleCurrentLocationUpdate(theAddress);
                    })
                    .catch(error => {
                        app.message(msg(error.message));
                    });
            },
            error => {
                //error handler
                const msgId =
                    error.code === 1 ? 'geolocation_not_authorised' : 'geolocation_generic_error';
                app.message(app.msg(msgId));
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0
            }
        );
    }
}
class DirectionsCurrentFeatureButton extends PluginButton {
    static {
        this.prototype.id = 'details-directions';
        this.prototype.titleMsg = 'directions_to';
        this.prototype.imgSrc = directionsImg;
        this.prototype.inactiveImgSrc = directionsInactiveImg;
    }

    render() {
        this.featureRep = this.app.getCurrentFeatureRep();
        const currentFeature = this.app.currentFeature,
            active =
                this.app.hasInternetAccess &&
                currentFeature &&
                currentFeature.hasGeometry() &&
                this.featureRep;

        this.$el.toggleClass('inactive', !active);

        if (active) this.delegateEvents();
        else this.undelegateEvents();
    }

    action() {
        if (this.app.hasInternetAccess && this.featureRep) {
            this.owner
                .reverseGeocode(this.featureRep.getCenter())
                .then(address => {
                    if (address) this.owner.openDirectionsPanel(address);
                })
                .catch(error => {
                    const msg = this.owner.msg('reverse_geocode_failed');
                    this.app.message(msg + ': \n' + error.message);
                });
        } // else do nothing
    }
}

DirectionsPlugin.prototype.buttons = {
    currentFeature: DirectionsCurrentFeatureButton
};

export default DirectionsPlugin;
