import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { localise, SortableTableBuilder } from '../../shared';

@withRouter
@localise('enumerators')
export class PickListTable extends Component {
    render() {
        const { msg } = this.props;

        return (
            <SortableTableBuilder
                {...this.props}
                size="small"
                columns={[
                    {
                        title: msg('name'),
                        dataIndex: 'name',
                        key: 'name',
                        render: text => <b>{text}</b>
                    },
                    { title: msg('description'), dataIndex: 'description', key: 'description' },
                    {
                        title: msg('values'),
                        dataIndex: 'values',
                        key: 'values',
                        render: (text, item) => item.values.length,
                        type: 'number',
                        sorter: (a, b) => {
                            let aVal = a.values.length,
                                bVal = b.values.length;
                            if (!aVal) aVal = 0;
                            if (!bVal) bVal = 0;
                            if (aVal != null && bVal != null) {
                                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                            }
                        }
                    }
                ]}
                dataSource={this.props.data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/enumerators/${record.name}/edit`);
                        }
                    };
                }}
            />
        );
    }
}
