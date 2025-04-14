import React, { Component } from 'react';
import { inject } from 'mobx-react';
import { createStylePreviewFor } from './StylePickerUtils';
import StyleModal from './StyleModal';

@inject('store')
export class StylePicker extends Component {
    /**
     * Renders an input element that displays a feature preview. When input is clicked renders a modal
     * @param {Object} props
     */
    constructor(props) {
        super(props);
        this.state = {
            currentData: props.style,
            stylePickerVisible: false,
            type: props.type
        };
    }

    componentDidUpdate(prevProps) {
        if (this.props.style !== prevProps.style) {
            this.setState({ currentData: this.props.style });
        }
    }

    render() {
        const { stylePickerVisible, currentData, type } = this.state;
        if (type === 'no geometry') return null;

        const styleModalData = currentData ?? this.props.defaultStyle;
        const stylePopup = stylePickerVisible ? (
            <StyleModal
                additionalOptions={this.props.additionalOptions}
                showLookup={this.props.showLookup}
                visible={stylePickerVisible}
                type={type}
                data={styleModalData}
                onCancel={this.onCancel}
                onOk={this.saveStyle}
                hasCanceled={this.state.hasCanceled}
                getFields={this.getFields}
                featureName={this.props.featureName}
                featureFieldName={this.props.featureFieldName}
            />
        ) : (
            ''
        );
        return (
            <span className="flex" data-style-picker>
                <span className="emulate-input" onClick={this.openStyleDialog}>
                    {createStylePreviewFor(type, this.state.currentData)}
                </span>
                <span
                    className={`emulate-input-addon icon-pencil ${type}-style-edit`}
                    onClick={this.openStyleDialog}
                />
                {stylePopup}
            </span>
        );
    }

    openStyleDialog = (type, data) => {
        this.setState({
            stylePickerVisible: true,
            hasCanceled: false,
            initialData: this.state.currentData
        });
    };

    onCancel = () => {
        this.setState({ currentData: this.state.initialData, hasCanceled: true });
        this.closeModal();
    };

    closeModal = () => {
        this.setState({ stylePickerVisible: false });
    };

    saveStyle = (name, style) => {
        this.closeModal();
        this.props.onChange(style);
        this.setState({ currentData: style });
    };

    /**
     * Returns an array of all the fields in the current feature
     */
    getFields = async () => {
        const { datasource, featureName, store } = this.props;
        const currentFeature = await store.ddStore.get(datasource, featureName);
        const fields = currentFeature.fields;
        return fields;
    };
}
