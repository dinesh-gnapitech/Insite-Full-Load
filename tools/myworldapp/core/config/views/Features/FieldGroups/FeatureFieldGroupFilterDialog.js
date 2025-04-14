import React, { Component } from 'react';
import { Modal, Button, Layout } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { FeatureFilterValField } from '../Fields/FeatureFilterValField';
import { AvailableFields } from '../AvailableFields';
import { localise, EditableTable, FilterInfo, MultiLanguageInput } from '../../../shared';

@localise('features')
export class FeatureFieldGroupFilterDialog extends Component {
    constructor(props) {
        super(props);

        this.state = {
            value: null,
            isVisible: false
        };

        //  Copied from FeatureFilters.js, ENH: Abstract this out into its own file
        this.sessionVars = ['{user}', '{application}', '{roles}', '{rights}', '{groups}'];
    }

    static getDerivedStateFromProps(props, state) {
        //  Update the values here, but only when the dialog opens
        if (!state.isVisible && props.visible) {
            //  Parse the value here
            const { value } = props;
            return {
                value: value || '',
                isVisible: props.visible
            };
        } else if (state.isVisible != props.visible) {
            return {
                isVisible: props.visible
            };
        } else {
            return null;
        }
    }

    render() {
        const { visible, msg, title, validatorsMode } = this.props;
        const { value } = this.state;

        let content = null;
        if (validatorsMode) {
            content = this.renderValidators();
        } else {
            content = (
                <FeatureFilterValField
                    filterValue={value}
                    onChange={this.onFilterChange}
                    dropField={this.addFilterVal}
                />
            );
        }

        return (
            <Modal
                open={visible}
                title={title}
                onCancel={this.onCancel}
                footer={[
                    <Button key="OK" type="primary" onClick={this.onOkay}>
                        {msg('ok_btn')}
                    </Button>,
                    <Button key="cancel" onClick={this.onCancel}>
                        {msg('cancel_btn')}
                    </Button>
                ]}
                width={1000}
            >
                <Layout style={{ height: '600px' }}>
                    <Layout.Content style={{ overflowY: 'auto' }}>
                        {content}
                        <FilterInfo />
                    </Layout.Content>
                    <Layout.Sider width={300} style={{ marginLeft: '10px', overflowY: 'auto' }}>
                        <AvailableFields
                            titleMsg={'drag_for_filter'}
                            fixedPosition={false}
                            extraFields={this.sessionVars}
                            style={{ height: '100%' }}
                        />
                    </Layout.Sider>
                </Layout>
            </Modal>
        );
    }

    renderValidators = () => {
        const { msg } = this.props;
        const { value } = this.state;
        const data = value.map((rec, index) => ({ index, ...rec }));

        const columns = [
            {
                title: '',
                dataIndex: 'index',
                width: '60px',
                className: 'text-center',
                render: (text, item) => (
                    <div className="seq-cell">
                        {item.index + 1}
                        <span
                            className="delete-row-btn hidden"
                            onClick={() => this.removeValidator(item.index)}
                        >
                            <DeleteOutlined />
                        </span>
                    </div>
                )
            },
            {
                title: msg('condition'),
                dataIndex: 'expression',
                render: (text, item) => (
                    <FeatureFilterValField
                        key={item.index}
                        index={item.index}
                        filterValue={text || ''}
                        dropField={this.addValidatorFilterVal.bind(this, item.index)}
                        onChange={val => this.setValidatorField(item.index, 'expression', val)}
                    />
                )
            },
            {
                title: msg('error_message'),
                dataIndex: 'message',
                render: (text, item) => (
                    <MultiLanguageInput
                        value={item.message}
                        onChange={val => this.setValidatorField(item.index, 'message', val)}
                    />
                )
            }
        ];

        return (
            <div style={{ position: 'relative' }}>
                <div className="feature-edit-fieldset" style={{ width: '100%' }}>
                    <div className="values-field-editor">
                        <EditableTable
                            className="input-container myw-list-view editable-table"
                            columns={columns}
                            dataSource={data}
                            rowKey="index"
                            pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                            onFieldsChange={(empty, field, prop, val) =>
                                this.setValidatorField(field.index, prop, val)
                            }
                            size="small"
                            style={{ height: '100%' }}
                        />
                        <div className="controls-container">
                            <Button
                                icon={<PlusOutlined />}
                                onClick={this.addValidator}
                                title={msg('add_value_btn')}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    //  Functions for normal mode

    onFilterChange = value => {
        this.setState({
            value
        });
    };

    addFilterVal = (origVal, fieldName, beforeIndex) => {
        this.setState({
            value: this.createValOnDrop(origVal, fieldName)
        });
    };

    //  Functions for validator mode

    addValidator = () => {
        const { value } = this.state;
        value.push({ expression: '', message: '' });
        this.setState({ value });
    };

    removeValidator = item => {
        const { value } = this.state;
        value.splice(item, 1);
        this.setState({ value });
    };

    setValidatorField = (index, propName, propValue) => {
        const { value } = this.state;
        value[index][propName] = propValue;
        this.setState({ value });
    };

    addValidatorFilterVal = (index, origVal, fieldName, beforeIndex) => {
        const { value } = this.state;
        value[index].expression = this.createValOnDrop(origVal, fieldName);
        this.setState({
            value
        });
    };

    //  Helper functions

    createValOnDrop(origVal, droppedText) {
        let fieldToAppend;

        if (this.sessionVars.includes(droppedText)) {
            fieldToAppend = droppedText; //use the text as is
        } else {
            fieldToAppend = '[' + droppedText + ']'; //Add square parenthesis around the text
        }
        return origVal + ' ' + fieldToAppend;
    }

    _commitValue = val => {
        const { onValueChange } = this.props;
        onValueChange(val);
    };

    onOkay = ev => {
        //  Determine the value
        const { value } = this.state;
        this._commitValue(value);
    };

    onCancel = ev => {
        this._commitValue(null);
    };
}
