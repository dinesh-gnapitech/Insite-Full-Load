/**
 * Items used in @Picker component for Type Picker
 */
export const Items = [
    { name: 'integer' },
    { name: 'bigint' },
    { name: 'double' },
    { name: 'numeric', inputs: ['text', 'text'] },
    { name: 'boolean' },
    { name: 'string', inputs: ['text'] },
    { name: 'date' },
    { name: 'timestamp' },
    { name: 'foreign_key', inputs: ['feature'], widths: ['calc(100% - 20px)'] },
    { name: 'reference', inputs: ['featurelist'] },
    { name: 'reference_set', inputs: ['featurelist'] },
    { name: 'link' },
    { name: 'image', inputs: ['text', 'text'] },
    { name: 'file', inputs: ['text'] }
];
