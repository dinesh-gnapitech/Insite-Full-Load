// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { pick, sortBy } from 'underscore';
import { Plugin, PluginButton } from 'myWorld-base';
import { Dialog, confirmationDialog } from 'myWorld/uiComponents';
import writeImg from 'images/toolbar/write.svg';

export class CreateFeaturePlugin extends Plugin {
    static {
        this.mergeOptions({
            setReferenceField: false
        });
    }

    /**
     * @class Plugin to allow users to create features <br/>
     * Adds a button to the toolbar which when clicked will display a list with types of features the user can create.
     * When the user chooses one of the types, a form for the specified type will be activated
     * @param  {Application} owner  The application
     * @param {Object} [options]
     * @param {boolean} [options.setReferenceField=false] //If true when creating a feature the reference field (if it has one) is set to currently selected feature
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);

        this.map = this.app.map;
        this.editableFeaturesListHtml = null;
        this.featureDefs = null;
    }

    /**
     * show the create feature dialog
     */
    showDialog() {
        this.getContents().then(contents => {
            if (this.app.isHandheld) {
                this.app.layout.showCreateObjectPage(contents);
            } else {
                if (!this.addObjectDialog)
                    this.addObjectDialog = new CreateFeatureDialog({
                        owner: this,
                        contents: contents
                    });
                else {
                    this.addObjectDialog.setContent(contents).then(() => {
                        this.addObjectDialog.open();
                    });
                }
            }
        });
    }

    /**
     * get the editable features for the application
     * @returns {Object<featureDD>} keyed on feature type
     * @private
     */
    async _getEditableFeatures() {
        if (!this._editableFeaturesPromise) {
            this._editableFeaturesPromise = this.app
                .userHasPermission('editFeatures')
                .then(hasPerm => {
                    this.hasPerm = hasPerm;
                    if (hasPerm) {
                        return Object.keys(this.app.database.getEditableFeatureTypes());
                    } else {
                        return [];
                    }
                });
        }
        //DD info is not cached here as it can change
        //ex: in native app, master is temporarily inaccessible
        //also datasource can cache it
        const types = await this._editableFeaturesPromise;
        const featureDDs = await this.app.database.getDDInfoFor(types); //Returns all featureDDs (but need DDs, not types)
        this.featureDefs = featureDDs;

        //Pick only from features on an editable layer
        return pick(featureDDs, featureDD => featureDD?.editable && featureDD.insert_from_gui);
    }

    /**
     * Get the contents to show in the create feature dialog or page
     * @return {Promise<string|jqueryElement>} contents  Html object for the list of editable features
     *                                           If no editable features found, then return a message
     */
    getContents() {
        return this._getEditableFeatures()
            .then(featuresDD => {
                // Find out if the database is registered
                // and return only those features that come from editable datasources
                if (Object.keys(featuresDD).length > 0) {
                    const featuresWithEditableDs = pick(featuresDD, featureDD =>
                        featureDD.datasource.isEditable()
                    );
                    this.isDsRegistered = Object.keys(featuresWithEditableDs).length > 0;
                    return featuresWithEditableDs;
                } else {
                    this.isDsRegistered = true;
                    return featuresDD;
                }
            })
            .then(featuresDD => {
                let contents;
                const messageEl = $('<div>', { class: 'createFeature-msg' });

                if (Object.keys(featuresDD).length === 0 && this.isDsRegistered) {
                    contents = messageEl.text(this.msg('no_features'));
                } else if (!this.hasPerm) {
                    contents = messageEl.text(this.msg('not_authorised'));
                } else if (!this.isDsRegistered) {
                    contents = messageEl.text(this.msg('db_not_writable'));
                } else {
                    contents = $('<ul>', { class: 'createFeature-menu' });
                    const insertableFeaturesTypes = sortBy(featuresDD, 'external_name');
                    let listItem;

                    // build the html
                    insertableFeaturesTypes.forEach(featureDD => {
                        if (this.app.isFeatureEditable(featureDD.name)) {
                            listItem = $(
                                `<li class="newFeature enabled" id=${featureDD.ufn}>${featureDD.external_name}</li>`
                            );
                            contents.append(listItem);
                        }
                    });
                }
                return contents;
            });
    }

    /**
     * Displays a confirmation dialog if a user tries to replace an unsaved feature to add a new object
     * @private
     */
    addNewFeature(featureName) {
        // If the current feature is unsaved, get user confirmation before creating the new feature
        if (this.app.currentFeature?.isNew) {
            this._createConfirmationDialog(featureName);
            this.addObjectDialog.close();
        } else {
            this._createFeature(featureName);
        }
    }

    /**
     * Displays a confirmation dialog
     * @private
     */
    _createConfirmationDialog(featureName) {
        confirmationDialog({
            title: this.msg('confirm_add', {
                external_name: this.featureDefs[featureName].external_name
            }),
            msg: this.msg('confirm_add_content', {
                featureType: this.app.currentFeature.featureDD.external_name
            }),
            confirmCallback: this._createFeature.bind(this, featureName)
        });
    }

    /**
     * start drawing a new feature
     * @param  {string} featureType
     * @private
     */
    _createFeature(featureType) {
        let referenceField;
        let keyOrReference;
        let referencedFeatureTitle;
        let referencedFeatureUrn;
        let referencedFeatureKeyName;
        const featureDD = this.featureDefs[featureType];
        const fieldsDD = featureDD.fields;
        const currentFeature = this.app.currentFeature;
        //Set the refernce field details if a current feature exists and is not detached/unsaved
        if (currentFeature && !currentFeature.isNew && this.options.setReferenceField) {
            referencedFeatureTitle = currentFeature.getTitle();
            referencedFeatureUrn = currentFeature.getUrn();
            referencedFeatureKeyName = currentFeature.keyFieldName;
        }

        referenceField = this._checkForReferenceField(fieldsDD); //ENH This only returns one field name, no support for > 1 reference fields

        this.app.database.createDetachedFeature(featureType).then(detachedFeature => {
            if (
                referencedFeatureTitle &&
                referenceField &&
                !detachedFeature.properties[referenceField]
            ) {
                if (!detachedFeature.displayValues) detachedFeature.displayValues = {};
                // if type of field is reference then featureURN is stored in the database
                // if type of field is a foreign key then featureKey value is stored
                keyOrReference = fieldsDD[referenceField].type;
                if (keyOrReference === 'reference')
                    detachedFeature.properties[referenceField] = referencedFeatureUrn;
                else
                    detachedFeature.properties[referenceField] =
                        currentFeature.properties[referencedFeatureKeyName];

                detachedFeature.displayValues[referenceField] = referencedFeatureTitle;
            }

            this.app.setCurrentFeature(detachedFeature);
        });

        if (this.addObjectDialog) this.addObjectDialog.close();
    }

    /**
     * check if a field with type reference exists for feature
     * @param  {Object} fieldsDD Field dd object from the feature dd
     * @return {boolean|string} false if no reference field exists or more than one exist, internal name if one exists
     * @private
     */
    _checkForReferenceField(fieldsDD) {
        //ENH: add support for multiple reference fields
        const currentFeatureType = this.app.currentFeature?.getType();
        const referenceFields = [];
        const hasAppropriateForeignKey = fieldDDType => {
            if (currentFeatureType && fieldDDType.includes('foreign_key')) {
                const splittedArray = fieldDDType.split('(', 2); // get feature type from foreign key field
                const featureType = splittedArray[1].slice(0, -1); //  remove last character from the string which is ")"
                return featureType == currentFeatureType;
            } else {
                return false;
            }
        };
        Object.values(fieldsDD).forEach(fieldDD => {
            if (fieldDD.baseType == 'reference' || hasAppropriateForeignKey(fieldDD.type)) {
                referenceFields.push(fieldDD.internal_name);
            }
        });

        if (referenceFields.length == 1) {
            return referenceFields[0];
        } else {
            return false;
        }
    }
}

class CreateFeatureDialog extends Dialog {
    static {
        this.prototype.messageGroup = 'CreateFeaturePlugin';
        this.prototype.className = 'createFeature-dialog';

        this.prototype.events = {
            'click .newFeature.enabled': '_addNewFeature'
        };

        this.mergeOptions({
            width: 360,
            position: { my: 'center', at: 'top', of: window, collision: 'fit' },
            title: '{:create_title}'
        });
    }

    /**
     * Asks the owner plugin to add the selected feature
     * @private
     */
    _addNewFeature(ev) {
        const selectedFeatureName = $(ev.currentTarget).prop('id');
        this.options.owner.addNewFeature(selectedFeatureName);
        this.options.owner.app.recordFunctionalityAccess(
            `core.toolbar.create_feature.${selectedFeatureName}`
        );
    }
}

CreateFeaturePlugin.prototype.buttons = {
    dialog: class extends PluginButton {
        static {
            this.prototype.id = 'a-createFeature';
            this.prototype.titleMsg = 'toolbar_msg'; //for automated tests
            this.prototype.imgSrc = writeImg;
        }

        action() {
            this.owner.showDialog();
        }
    }
};

export default CreateFeaturePlugin;
