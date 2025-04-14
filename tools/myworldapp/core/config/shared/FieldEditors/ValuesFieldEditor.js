import React, { Component } from 'react';
import { observer } from 'mobx-react';
import { Button } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { EditableTable } from '../../shared';

@observer
export class ValuesFieldEditor extends Component {
    /**
     *
     * @param {*} props
     * @param {Array}    props.value     Array of values to display in the list
     * @param {function} props.onChange  Method to call when there is a change to the list
     * @param {function} props.mapValue  Method that maps the editor value to the desirable format
     * @param {Object}   props.msg       Localisation object
     */
    constructor(props) {
        super(props);
        const { value } = this.props;
        this.state = {
            values: (value || []).map((li, i) => ({ id: i, ...li }))
        };
        this.count = value?.length || 0;
    }

    componentDidUpdate(prevProps) {
        if (this.props.value !== prevProps.value) {
            const { value } = this.props;
            this.setState({
                values: (value || []).map((li, i) => ({ id: i, ...li }))
            });
            this.count = value?.length || 0;
        }
    }

    addItem() {
        let values = [...this.state.values];
        values.push({ id: this.count++, value: '' });
        this.setState({ values });
        this.triggerChange(values);
    }

    removeItem(item) {
        let values = [...this.state.values];
        values.splice(item.seq - 1, 1);
        this.setState({ values });
        this.triggerChange(values);
    }

    triggerChange(values) {
        const onChange = this.props.onChange;
        if (onChange) {
            onChange(this.serialize(values));
        }
    }

    serialize(vals) {
        return [...vals].map(value => this.props.mapValue(value));
    }

    render() {
        const { msg } = this.props;

        const cols = [
            {
                title: '',
                dataIndex: 'seq',
                width: '35px',
                className: 'text-center',
                render: (text, item) => (
                    <div className="seq-cell">
                        <span className="test-no-print">{item.seq}</span>
                        <span
                            className="delete-row-btn hidden"
                            onClick={() => this.removeItem(item)}
                        >
                            <DeleteOutlined type="delete" />
                        </span>
                    </div>
                )
            },
            {
                title: '',
                className: 'value-field-editor-val',
                dataIndex: 'value',
                inputType: 'string'
            }
        ];

        this.data = this.state.values.map(
            ({ value, id }, seq) => ({ seq: seq + 1, value, id }) //id is added so that the table can correctly identify deleted rows
        );
        return (
            <div className="values-field-editor">
                <EditableTable
                    style={{ width: 500, marginBottom: 10 }}
                    showHeader={false}
                    columns={cols}
                    dataSource={this.data}
                    rowKey="id"
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    moveRow={this.moveRow}
                    onFieldsChange={this.updateItem}
                    size="small"
                />
                <div className="controls-container">
                    <Button
                        icon={<PlusOutlined />}
                        onClick={this.addItem.bind(this)}
                        title={msg('add_value_btn')}
                    >
                        {msg('add_value_btn')}
                    </Button>
                </div>
            </div>
        );
    }

    moveRow = (dragIndex, hoverIndex) => {
        const values = [...this.state.values];

        const value = this.data[dragIndex];
        const beforeValue = this.data[hoverIndex];

        const origIndex = value.seq - 1;
        const targetIndex = beforeValue.seq - 1;
        const movingEl = values.splice(origIndex, 1); //remove the element that is moving
        values.splice(targetIndex, 0, movingEl[0]); //add the element in the new position

        this.setState({ values });
        this.triggerChange(values);
    };

    updateItem = (index, item, propName, value) => {
        const values = [...this.state.values];
        values[item.id].value = value;
        this.setState({ values });
        this.triggerChange(values);
    };
}
