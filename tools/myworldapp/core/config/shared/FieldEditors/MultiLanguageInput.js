import React, { Component } from 'react';
import { Input } from 'antd';
import { inject, observer } from 'mobx-react';
import { localise } from '../Localise';

@inject('store')
@localise('fieldEditor')
@observer
export class MultiLanguageInput extends Component {
    constructor(props = {}) {
        super(props);
        this.systemLangs = this.props.store.settingsStore.languages;
        this.defaultLang = this.systemLangs[0];
        this.state = {
            val: props.value
        };
    }

    static getDerivedStateFromProps(props, state) {
        //  In instances where the initial value isn't yet available, its either undefined or null
        //  In instances where we are duplicating a value, the value prop is null
        //  Check for the proper value here and update it only if we haven't received it yet
        if (
            [undefined, null, ''].includes(state.val) ||
            props.value === null ||
            props.value !== state.value
        ) {
            return {
                val: props.value
            };
        } else return null;
    }

    render() {
        const { id, className, style, placeholder, prependDropTarget, type } = this.props;

        const lang = this.props.store.settingsStore.currentLang || this.systemLangs[0];
        const inputVal = this._getDisplayValFor(this.state.val);
        let inputProps = {};
        if (prependDropTarget) {
            inputProps = { placeholder, rows: '2', value: inputVal || '' };
            if (this.systemLangs.length > 1) {
                return prependDropTarget(
                    <div style={style}>
                        <Input
                            addonAfter={lang}
                            {...inputProps}
                            onChange={this.onChange.bind(this, false)}
                        />
                    </div>
                );
            } else {
                return prependDropTarget(
                    <div>
                        <Input {...inputProps} onChange={this.onChange.bind(this, false)} />
                    </div>
                );
            }
        } else {
            inputProps = {
                id,
                className,
                placeholder,
                value: inputVal,
                onMouseDown: this.props.onMouseDown,
                onClick: this.props.onClick
            };
            const InputComponent = type === 'textarea' ? Input.TextArea : Input;

            if (this.systemLangs.length > 1) {
                const extraStyles =
                    type === 'textarea'
                        ? { borderBottomRightRadius: 0, borderTopRightRadius: 0 }
                        : {};
                if (type === 'textarea') inputProps['autoSize'] = true;
                else inputProps['addonAfter'] = lang;
                return (
                    <div style={{ display: 'flex' }}>
                        <InputComponent
                            {...inputProps}
                            style={{ ...style, ...{ verticalAlign: '-11px' }, ...extraStyles }}
                            onChange={this.onChange.bind(this, true)}
                        />
                        {type === 'textarea' && (
                            <div
                                style={{
                                    borderBottomRightRadius: 5,
                                    borderTopRightRadius: 5,
                                    padding: '2px 10px 0',
                                    display: 'flex',
                                    border: '1px solid #d9d9d9',
                                    margin: '3px 0 4px -1px',
                                    lineHeight: '25px'
                                }}
                            >
                                {lang}
                            </div>
                        )}
                    </div>
                );
            } else {
                return (
                    <InputComponent
                        {...inputProps}
                        style={style}
                        onChange={this.onChange.bind(this, true)}
                    />
                );
            }
        }
    }

    onChange(stopPropagation, e) {
        if (stopPropagation) e.stopPropagation();
        const val = e.target.value;
        if (this.systemLangs.length > 1) {
            const lang = this.props.store.settingsStore.currentLang || this.systemLangs[0];
            this.handleChangeForLang(val, lang);
        } else {
            this.props.onChange(val);
            this.setState({ val });
        }
    }

    _getDisplayValFor(value) {
        if (!value) return value;
        const currentLang = this.props.store.settingsStore.currentLang;
        let displayValue = value;
        if (this.systemLangs.length > 1) {
            if (this.isJson(value)) {
                displayValue = JSON.parse(value)[currentLang];
            } else {
                displayValue = this.defaultLang === currentLang ? value : '';
            }
        } else {
            if (this.isJson(value)) {
                displayValue = JSON.parse(value)[this.defaultLang] || value;
            } else displayValue = value;
        }

        return displayValue;
    }

    isJson(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    handleChangeForLang(val, lang) {
        let valObj = {};

        const currentVal = this.props.value;
        if (currentVal && this.isJson(currentVal)) valObj = JSON.parse(currentVal);
        else if (currentVal) valObj[this.defaultLang] = currentVal;

        valObj[lang] = val;
        val = JSON.stringify(valObj);
        this.props.onChange(val);
        this.setState({ val });
    }
}
