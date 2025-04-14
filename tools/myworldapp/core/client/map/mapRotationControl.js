import $ from 'jquery';
import { Control } from 'ol/control';
import { msg as mywMsg } from 'myWorld/base/localisation';
import { toDegrees } from 'ol/math';
import rotateToNorthImg from 'images/actions/rotate-to-north.svg';

const msg = mywMsg('UserLocationPlugin');

export class MapRotationControl extends Control {
    /**
     * @class Map Control do show device heading and toggle map rotation mode
     * @constructs
     * @extends {ol/Control}
     */
    constructor({ userLocation }) {
        //Create element to pass to control
        let element = $('<div/>', {
            class: 'myw-rotate-button ol-unselectable ol-control'
        });
        super({ element: element[0] }); //Must not be JQuery element
        element.on('pointerdown', this._toggleRotation.bind(this));
        element.attr('title', msg('active_rotation_mode'));

        this.userLocation = userLocation;

        this._handleRotation = this._handleRotation.bind(this);
    }

    //called by OL when control is added or removed from map
    setMap(map) {
        const oldMap = this.getMap();
        if (oldMap) oldMap.getView().un('change:rotation', this._handleRotation);

        super.setMap(map);

        if (!map) return;
        map.getView().on('change:rotation', this._handleRotation);

        $(
            '.myw-rotate-button'
        )[0].innerHTML = `<img class='compassImage' src='${rotateToNorthImg}'/>`;
    }

    _handleRotation(evt) {
        this._rotateIcon(toDegrees(evt.target.getRotation()));
    }

    _rotateIcon(degrees) {
        $('.compassImage').css('transform', `rotate(${degrees}deg)`);
    }

    /*
     * Handler for when user clicks the map rotation button
     * Toggles map rotation mode.
     */
    _toggleRotation(event) {
        event.stopPropagation();

        if (this.userLocation.isRotatingMap) {
            //Rotation mode -> stop it
            this.userLocation.rotateStop();
            $('.myw-rotate-button').attr('title', msg('active_rotation_mode'));
        } else if (this.userLocation.isTracking) {
            //not in map rotation mode but tracking user location
            //Tracking mode
            if (this.userLocation.hasOrientation) {
                this.userLocation.rotateStart();
                $('.myw-rotate-button').attr('title', msg('deactivate_rotation_mode'));
                this._rotateIcon(45);
            } else {
                //If the device has never recieved a heading don't want to enter rotation mode
                this.getMap().getView().setRotation(0);
                this._rotateIcon(0);
            }
        } else {
            //in map rotation mode - rotate map to north but don't change mode
            this.getMap().getView().setRotation(0);
            this._rotateIcon(0);
        }
    }
}

export default MapRotationControl;
