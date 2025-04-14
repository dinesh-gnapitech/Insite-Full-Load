// Copyright: IQGeo Limited 2010-2023
import { Plugin, PluginButton, msg } from 'myWorld-base';
import { MapDoodleDialog } from 'myWorld/controls/mapDoodleDialog';
import doodleImg from 'images/toolbar/doodle.svg';

export class MapDoodlePlugin extends Plugin {
    static {
        /**
         * @property {string}     messageGroup     Specifies the message group to be used by the plugin
         */
        this.prototype.messageGroup = 'MapDoodlePlugin';

        this.mergeOptions({
            color: '#FF0000'
        });
    }

    /**
     * @class Provides a toolbar button to quickly create a doodle.
     * For this plugin to work, you'll need to have a feature with an image type field
     * Clicking the toolbar button will initiate creating of a feature and start the doodle mode for configured image field
     *
     * If the internals map is being displayed in the map view, draws on that, otheriwse draws on the geo map
     *
     * @param   {Application}     owner     The application this plugin is attached to
     * @param   {Object}              options
     * @param   {string}              options.featureType       Feature type to create
     * @param   {string}              options.fieldName         Name of image field where the doodle will be saved
     * @param   {string}              [options.tooltipMsg]      Tooltip message key used for the toolbar button tooltip(based on the featureType?)
     *                                                          You'll need to use this key in your .msg file to add the tooltip
     * @param   {string}              [options.color='#FF0000'] Default color to be used to doodle. The subsequest color changes will be remembered
     * @example
     * myw.applicationDefinition.plugins['mapDoodle'] = [
     *     MapDoodlePlugin,
     *     {
     *         featureType: 'data_correction',
     *         fieldName: 'correction_sketch',
     *         tooltipMsg: 'data_correction_tooltip'
     *     }
     *];
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.app = this.owner.app;
        ['handleChange', 'setColor'].forEach(method => (this[method] = this[method].bind(this)));
        this.color = this.options.color;
    }

    showDialog(existing_doodle) {
        const dialog = new MapDoodleDialog(this, {
            color: this.color,
            setColor: this.setColor,
            onChange: this.handleChange,
            onClose: () => {}
        });

        // Begin doodling
        dialog.beginDoodling(existing_doodle);
    }

    async handleChange(doodle_evt) {
        const { featureType, fieldName } = this.options;

        //Get the map doodle data
        let mapdoodle_data_url = doodle_evt.doodleData;
        const imageBlob = mapdoodle_data_url.replace(/^data:image\/(png|jpg|jpeg);base64,/, '');

        //Create a new feature with the properties of the freshly created feature.
        const detachedFeature = await this.app.database.createDetachedFeature(featureType, true);

        detachedFeature.properties[fieldName] = imageBlob;
        const mapCenter = this.app.map.getCenter();
        const { lat, lng } = mapCenter;
        detachedFeature.setGeometry('Point', [lng, lat]);
        this.insertFeature(detachedFeature);
    }

    /**
     * Inserts a new feature into the database
     * @param  {featureData} featureJson
     * @return {Promise<DDFeature>}
     */
    async insertFeature(feature) {
        const app = this.app;
        const featureJson = { ...feature };

        //start by running any preInsert hook
        await feature.preInsert(featureJson, app);

        //obtain from the feature model a transaction to perform the insertion
        const { transaction, opIndex } = await feature.buildInsertTransaction(featureJson, app);
        const res = await feature.datasource.runTransaction(transaction);

        //get feature from database (gets values updated by database triggers)
        const id = res.ids[opIndex];
        feature = await feature.datasource.getFeature(feature.getType(), id);

        //run post insert hook
        await feature.posInsert(featureJson, app);
        this.app.message(msg('FeatureEditor', 'created_ok', { title: feature.getTitle() }));
        this.app.setCurrentFeature(feature);
    }

    setColor(color_hex) {
        this.color = color_hex;
    }

    getState() {
        return {
            color: this.color
        };
    }
}

MapDoodlePlugin.prototype.buttons = {
    dialog: class extends PluginButton {
        static {
            this.prototype.id = 'a-map-doodle';
            this.prototype.titleMsg = 'toolbar_msg';
            this.prototype.imgSrc = doodleImg;
        }

        initUI() {
            const tooltip = this.owner.options.tooltipMsg;
            if (tooltip) this.setTitle(tooltip);
        }

        action() {
            this.owner.showDialog();
        }
    }
};

export default MapDoodlePlugin;
