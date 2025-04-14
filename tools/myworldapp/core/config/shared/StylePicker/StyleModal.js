/* eslint-disable no-prototype-builtins */
import React, { Component } from 'react';
import { Modal, Button, Checkbox } from 'antd';
import { inject, observer } from 'mobx-react';
import { localise } from '..';
import LabelStyleForm from './LabelStyleForm';
import LinestringStyleForm from './LinestringStyleForm';
import PolygonStyleForm from './PolygonStyleForm';
import { PointStyleForm } from './PointStyleForm';
import LookupStyleForm from './LookupStyleForm';

@inject('store')
@localise('StylePicker')
@observer
export default class StyleModal extends Component {
    timeoutRef;

    /**
     * A modal that contains a styleForm for use with the stylepicker component
     */
    state = {
        visible: true,
        okBtnValid: true,
        showLookupForm: false,
        style: null
    };

    componentWillUnmount() {
        clearTimeout(this.timeoutRef);
    }

    static getDerivedStateFromProps(props, state) {
        if (props.hasCanceled || !state.style) {
            return {
                style: props.data,
                showLookupForm:
                    props.type === 'polygon'
                        ? !!props.data?.line?.hasOwnProperty('lookupProp')
                        : !!props.data?.hasOwnProperty('lookupProp')
            };
        } else
            return {
                style: state.style,
                showLookupForm:
                    props.type === 'polygon'
                        ? !!state.style.line?.hasOwnProperty('lookupProp')
                        : !!Object.prototype.hasOwnProperty.call(state.style, 'lookupProp')
            };
    }

    handleOk = () => {
        this.setState({ loading: true });
        let isValid = true;
        if (this.state.showLookupForm) {
            //Make sure the lookup style has a defaultStyle
            const style = this.props.type === 'polygon' ? this.state.style.line : this.state.style;
            if (!style['defaultStyle']) {
                isValid = false;
                this.setState({ loading: false, isValid: false });
                return;
            }
        }
        if (isValid) {
            this.props.onOk(this.props.data?.settingName, this.state.style);
            this.timeoutRef = setTimeout(() => {
                this.setState({ loading: false, visible: false, isValid: true });
            }, 3000);
        }
    };

    handleCancel = () => {
        this.props.onCancel();
    };

    saveFormRef = formRef => {
        this.formRef = formRef;
    };

    render() {
        const { additionalOptions, visible, type, data, msg, onCancel, showLookup } = this.props;
        let title = 'point_style';

        let StyleForm = PointStyleForm;
        switch (type) {
            case 'text':
                StyleForm = LabelStyleForm;
                title = 'text_style';
                break;
            case 'linestring':
                StyleForm = LinestringStyleForm;
                title = 'line_style';
                break;
            case 'polygon':
                StyleForm = PolygonStyleForm;
                title = 'polygon_style';
                break;
        }
        const lookupCheckbox = showLookup ? (
            <Checkbox
                onChange={this.handleModeChange}
                style={{ marginBottom: '10px' }}
                checked={this.state.showLookupForm}
            >
                {msg('lookup_title')}
            </Checkbox>
        ) : (
            ''
        );

        const form = this.state.showLookupForm ? (
            <LookupStyleForm
                additionalOptions={additionalOptions}
                getFields={this.props.getFields}
                geomType={type}
                data={this.state.style}
                onChange={this.onChange}
                isValid={this.state.isValid}
                featureName={this.props.featureName}
                featureFieldName={this.props.featureFieldName}
            />
        ) : (
            <StyleForm
                additionalOptions={additionalOptions}
                wrappedComponentRef={this.saveFormRef}
                data={this.state.style || {}}
                featureName={this.props.featureName}
                featureFieldName={this.props.featureFieldName}
                onChange={this.onChange}
                key={data?.settingName}
                setValidState={this.setValidState.bind(this)}
            />
        );

        return (
            <Modal
                open={visible}
                title={msg(title)}
                onOk={this.handleOk}
                onCancel={onCancel}
                wrapClassName={'style-modal'}
                footer={[
                    <Button
                        key="OK"
                        type="primary"
                        onClick={this.handleOk}
                        disabled={!this.state.okBtnValid}
                    >
                        {msg('ok_btn')}
                    </Button>,
                    <Button key="cancel" onClick={onCancel}>
                        {msg('cancel_btn')}
                    </Button>
                ]}
            >
                {lookupCheckbox}
                {form}
            </Modal>
        );
    }

    setValidState = boolean => {
        this.setState({ okBtnValid: boolean });
    };

    onChange = data => {
        this.setState(prevState => ({ style: { ...prevState.style, ...data } }));
    };

    getDefaultStyle = (geomType, isLookup, data, lookupStyleCommonDefault) => {
        if (!isLookup) {
            return geomType === 'polygon'
                ? { line: data?.line?.defaultStyle, fill: data?.fill?.defaultStyle }
                : data?.defaultStyle;
        }

        return geomType === 'polygon'
            ? {
                  isLookup,
                  line: { ...lookupStyleCommonDefault, defaultStyle: data.line },
                  fill: { ...lookupStyleCommonDefault, defaultStyle: data.fill }
              }
            : {
                  ...lookupStyleCommonDefault,
                  isLookup,
                  defaultStyle: data
              };
    };

    // when switch between lookup mode, prevent losing current style
    // - turning on, apply current style to lookup default style
    // - turning off, apply lookup default style to current style
    handleModeChange = e => {
        const isLookup = !!e.target.checked;
        const lookupStyleCommonDefault = {
            lookupProp: null,
            pick_list: null,
            lookup: []
        };
        const newDefaultStyle = this.getDefaultStyle(
            this.props.type,
            isLookup,
            this.state.style,
            lookupStyleCommonDefault
        );
        this.setState({
            showLookupForm: isLookup,
            style: newDefaultStyle
        });
    };
}
