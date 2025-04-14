import myw from 'myWorld-base';
import React, { Component } from 'react';
import { Checkbox, Button, Select, Popover } from 'antd';
import { inject, observer } from 'mobx-react';
import { NativeAppVectorEditor } from './NativeAppVectorEditor';
import { EllipsisOutlined } from '@ant-design/icons';
const Option = Select.Option;

@inject('store')
@observer
export class RenderingEditor extends Component {
    state = {
        value: this.props.value,
        enumerator: this.props.args.enumerator
    };

    render() {
        const { args, msg, form } = this.props;
        const { enumerator } = this.state;
        if (!enumerator) return null;
        const value = this.props.value || args.default;
        const asVectorForNative = args.store.current && !!args.store.current.spec.nativeAppVector;

        const nativeAppVectorSpec = args.store.current?.spec.nativeAppVector;
        const fromScaleValue = nativeAppVectorSpec?.['fromScale'];
        const options = [...Array(31).keys()];

        const OptionsButton = (
            <Button
                className="config-native-render-btn"
                title={this.props.msg('config_native_render_title')}
                disabled={!asVectorForNative}
            >
                <EllipsisOutlined />
            </Button>
        );

        return (
            <span className="render-field-editor">
                <Select
                    defaultValue={value}
                    value={value}
                    onChange={value => this.props.onChange(value)}
                    style={{ width: '200px', marginRight: '10px' }}
                >
                    {Object.entries(enumerator).map(([key, val]) => {
                        const optionVal =
                            typeof val == 'object' ? myw.msg(val.group, val.key) : val;
                        return (
                            <Option key={key} value={key}>
                                {optionVal}
                            </Option>
                        );
                    })}
                </Select>
                {['tilestore', 'geoserver'].includes(value) && (
                    <>
                        <Checkbox
                            defaultChecked={asVectorForNative}
                            onChange={this.handleVectorChange}
                        >
                            {this.props.msg('vector_for_native_app_label')}
                        </Checkbox>

                        {nativeAppVectorSpec ? (
                            <Popover
                                disabled={!asVectorForNative}
                                content={
                                    <span>
                                        <NativeAppVectorEditor
                                            msg={this.props.msg}
                                            form={form}
                                            store={args.store}
                                        />
                                    </span>
                                }
                            >
                                {OptionsButton}
                            </Popover>
                        ) : (
                            OptionsButton
                        )}
                    </>
                )}
                {value === 'tilestore' && (
                    <>
                        <span style={{ paddingLeft: '5px' }}>{msg('spec_from_scale')}</span>
                        <Select
                            value={fromScaleValue || 0}
                            onChange={this.handleScaleChange}
                            style={{ width: '60px', marginLeft: '10px' }}
                            disabled={!asVectorForNative}
                        >
                            {options.map(option => (
                                <Option key={option} value={option}>
                                    {option}
                                </Option>
                            ))}
                        </Select>
                    </>
                )}
            </span>
        );
    }

    handleVectorChange = e => {
        const store = this.props.args.store;
        const checkedVaue = e.target.checked;
        const spec = { ...store.current.spec };
        if (checkedVaue) {
            store.modifyCurrent({ spec: { ...spec, nativeAppVector: {} } });
        } else {
            store.modifyCurrent({ spec: { ...spec, nativeAppVector: null } });
        }
    };

    handleScaleChange = val => {
        const store = this.props.args.store;
        const spec = { ...store.current.spec };
        store.modifyCurrent({
            spec: { ...spec, nativeAppVector: { ...spec.nativeAppVector, fromScale: val } }
        });
    };
}
