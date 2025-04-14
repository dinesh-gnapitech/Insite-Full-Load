// Copyright: IQGeo Limited 2010-2023
import { escape } from 'underscore';
import { ObjectNotFoundError, UnauthorizedError, MissingFeatureDD } from 'myWorld/base';
import { FieldViewer } from './fieldViewer';

/**
 * Displays a reference field by displaying a link that allows the user to follow to the referenced feature
 * @name ReferenceFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class ReferenceFieldViewer extends FieldViewer {
    static {
        this.prototype.tagName = 'span';
        this.prototype.className = 'relationship';

        this.prototype.events = {
            click: 'followRelationship'
        };
    }

    /**
     * Renders the field value in self's element
     */
    render() {
        const fieldValue = this.fieldValue;
        const nully = fieldValue === null || fieldValue === '';

        //first check if we should render the value or not
        if (nully && !this.options.renderAll) return;

        this.renderValue(fieldValue);
    }

    /**
     * Converts the value for display <br/>
     * @return {string} Text describing the reference
     */
    convertValue(value) {
        let displayValue = this.displayValue;
        let result;

        if (displayValue?.toString().startsWith('error|')) {
            this.error = true; //used by the click handler
            displayValue = this.msg('reference_error', { reference: displayValue.slice(6) });
        }

        if (displayValue) result = displayValue;
        else {
            if (!value) {
                //no display value
                if (this.fieldDD.value) {
                    //calculated reference field
                    result = this.msg('calculated_reference');
                } else {
                    result = this.msg('no_reference');
                }
            } else if (typeof value == 'object') {
                //value is an actual feature (calculated field)
                result = value.getTypeExternalName();
            } else {
                //value is a urn or foreign key id
                this.getExternalNameForReference(value).then(externalName => {
                    this.feature.displayValues[this.fieldName] = externalName || value;
                    this.displayValue = externalName || value; //So the render doesn't try to convert the value again and get stuck in a loop
                    this.render();
                });

                result = value; //temporarily show urn until self is rendered with the external name
            }
        }
        return escape(result);
    }

    /*
     * Obtains the feature type external name for a given reference value
     * @param  {urn|string} value   Urn or foreign key id
     * @return {Promise<string>}
     */
    getExternalNameForReference(value) {
        const featureType =
            this.fieldDD.baseType == 'reference'
                ? value.split('/').slice(0, -1).join('/')
                : this.fieldDD.type.match(/foreign_key\((.+)\)/)[1];

        const database = this.feature.datasource.database;
        return database.getDDInfoFor([featureType]).then(featureDDs => {
            const targetFeatureDD = featureDDs[featureType];
            return targetFeatureDD?.external_name;
        });
    }

    followRelationship() {
        if (this.error) return;
        const app = this.app;

        this.$el.prop('class', 'process-relationship'); // This displays the spin-wheel svg to indicate a busy system

        this.feature
            .followRelationship(this.fieldName)
            .then(features => {
                if (features) {
                    const currentFeature = features.length == 1 ? features[0] : null;
                    app.setCurrentFeatureSet(features, { currentFeature });
                }
            })
            .catch(e => {
                if (
                    e instanceof ObjectNotFoundError ||
                    e instanceof UnauthorizedError ||
                    e instanceof MissingFeatureDD
                )
                    app.message(app.msg('missing_object_error'));
                else {
                    app.message(`${app.msg('unexpected_error')}: ${e.message}`);
                    console.log(e);
                }
            })
            .finally(() => {
                this.$el.prop('class', this.className); //Revert back to its original state
            });
    }
}

export default ReferenceFieldViewer;
