// Copyright: IQGeo Limited 2010-2023
/*****************************  Default configuration file ************************
 ******* This file should not be edited for a specific project or customization *********
 */

//default configuration.
//will be merged with database settings by System
// ENH: Fix OnDemandExractPlugin to use units setting and remove this
export const config = {
    /** Units conversion contants to convert from 'meter'(length) and 'square meters'(area) */
    unitConversionConstants: {
        m: 1,
        km: 0.001,
        ft: 3.2808399,
        yard: 1.0936133,
        mi: 0.00062137119,
        'm^2': 1,
        hectare: 0.0001,
        'km^2': 0.000001,
        'ft^2': 10.7639104,
        'yd^2': 1.195990046,
        acres: 0.000247105,
        'mi^2': 3.8610216e-7
    }
};

export default config;
