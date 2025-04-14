/**
 * Obtain DD information about attachment feature type referenced by fieldDD
 * @param {fieldDD} DD info for a homongeneous calculated reference_set field
 * @param {Database} database
 * @returns { featureType, ownerFieldName, imageFieldDD, docFieldDD }
 */
export async function getAttachmentDD(fieldDD, database) {
    //Find the image and file field names in the configured attachment feature
    const selectParam = fieldDD.valueParams[0];
    if (!selectParam) {
        const { internal_name: name, value } = fieldDD;
        console.error(
            `Attachments: field '${name}' does not have a valid select expression (${value})`
        );
        return {};
    }

    const [featureType, ownerFieldName] = selectParam.split('.');

    const featureDDs = await database.getDDInfoFor([featureType]);
    const fieldDDs = getAttachmentFieldDDs(featureDDs[featureType]);

    return { featureType, ownerFieldName, ...fieldDDs };
}

/**
 * Find the attachment-specific fields in 'featureDD'
 * @param {featureDD} featureDD
 * @returns { imageFieldDD, docFieldDD }
 */
export function getAttachmentFieldDDs(featureDD) {
    const fieldsDD = Object.values(featureDD.fields);
    const imageFieldDD = fieldsDD.find(field => field.type.startsWith('image('));
    const docFieldDD = fieldsDD.find(field => field.type.startsWith('file('));
    const filenameFieldDD =
        fieldsDD.find(field => field.internal_name == 'filename') ??
        fieldsDD.find(field => field.internal_name == 'name');

    return { imageFieldDD, docFieldDD, filenameFieldDD };
}
