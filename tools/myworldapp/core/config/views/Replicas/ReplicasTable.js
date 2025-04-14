import myw from 'myWorld-base';
import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { SortableTableBuilder, localise } from '../../shared';

@withRouter
@localise('replicas')
export class ReplicasTable extends Component {
    render() {
        const { msg } = this.props;
        return (
            <SortableTableBuilder
                loading={this.props.loading}
                size="small"
                columns={[
                    { title: msg('name'), dataIndex: 'id', key: 'id' },
                    { title: msg('type'), dataIndex: 'type', key: 'type' },
                    { title: msg('status'), dataIndex: 'status', key: 'status' },
                    { title: msg('owner'), dataIndex: 'owner', key: 'owner' },
                    { title: msg('location'), dataIndex: 'location', key: 'location' },
                    {
                        title: msg('shards'),
                        dataIndex: 'n_shards',
                        key: 'n_shards',
                        type: 'number'
                    },
                    {
                        title: msg('activated'),
                        dataIndex: 'activated',
                        key: 'activated',
                        render: (text, rec) => myw.Util.formatDate(rec.registered)
                    },
                    {
                        title: msg('last_updated'),
                        dataIndex: 'last_downloaded',
                        key: 'last_downloaded',
                        render: this.last_downloaded.bind(this)
                    },
                    {
                        title: msg('last_upload'),
                        dataIndex: 'last_upload',
                        key: 'last_upload',
                        render: this.last_upload.bind(this)
                    }
                ]}
                dataSource={this.props.data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/replicas/replicas/${record.id}`);
                        }
                    };
                }}
            />
        );
    }

    activated(text, rec) {
        return myw.Util.formatDate(rec.registered);
    }

    last_downloaded(text, rec) {
        return rec.last_updated
            ? myw.Util.timeSince(new Date(myw.Util.formatRawDate(rec.last_updated)))
            : '-';
    }

    last_upload(text, rec) {
        const lastImportTime = rec.last_import_time;
        return lastImportTime
            ? myw.Util.timeSince(new Date(myw.Util.formatRawDate(lastImportTime)))
            : '-';
    }
}
