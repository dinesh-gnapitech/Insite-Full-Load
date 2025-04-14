const isTitleField = field => {
    return field.name === 'myw_title' || field.name === 'myw_short_description';
};

const geomTypes = ['point', 'polygon', 'linestring', 'raster'];
const isGeomField = field => {
    return (
        field.name?.startsWith('myw_') ||
        field.name?.startsWith('myw_gwn') ||
        field.name === 'myw_geometry_world_name' ||
        geomTypes.includes(field.type) ||
        field.fieldType == 'geom'
    );
};

const isCalculatedField = field => !!field.value || field.fieldType == 'calculated';

const isStoredField = field => !field.value || field.fieldType == 'stored';

const isFieldSeparator = fieldType => fieldType === 'separator';

const numberTypes = ['integer', 'double', 'numeric'];
const isNumberType = field => field.type && numberTypes.includes(field.type.split('(')[0]);

export {
    isTitleField,
    isGeomField,
    isCalculatedField,
    isStoredField,
    isFieldSeparator,
    isNumberType
};
