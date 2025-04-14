import React, { Component } from 'react';
import { StylePicker } from './StylePicker/StylePicker';

//Component for the Features tab of the Layer editor
export class GeomStyleSelect extends Component {
    /**
     * Class to render a stylePicker
     * StylePicker has an input element showing a feature style preview
     * When clicked a modal opens allowing user to select styles
     */
    render() {
        const {
            additionalOptions,
            type,
            value,
            featureName,
            featureFieldName,
            datasource,
            defaultStyle,
            showLookup
        } = this.props;
        if (!type) return null;

        return (
            <StylePicker
                additionalOptions={additionalOptions}
                style={value}
                type={type}
                showLookup={showLookup}
                featureName={featureName}
                featureFieldName={featureFieldName}
                datasource={datasource}
                defaultStyle={defaultStyle}
                onChange={this.onChange}
            ></StylePicker>
        );
    }

    onChange = spValue => {
        const { onChange } = this.props;
        if (!onChange) return;
        //convert from stylepicker format
        //call passed in onChange
        onChange(spValue);
    };
}
