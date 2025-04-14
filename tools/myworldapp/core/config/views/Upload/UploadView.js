import React, { Component } from 'react';
import { Upload, message, Checkbox, Input, Button, Card } from 'antd';
import { UploadOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import { observer, inject } from 'mobx-react';
import { localise, breadcrumb } from '../../shared';
import reqwest from 'reqwest';

@localise('upload')
@inject('store')
@breadcrumb
@observer
export class UploadView extends Component {
    constructor(props) {
        super(props);
        this.state = {
            encoding: '',
            autoCreateTable: false,
            fileList: [],
            file_upload_data: [],
            uploading: false,
            hasManagePerm: false
        };
        this.maximum_concurrent_uploads = 3;

        message.config({
            maxCount: 1
        });
    }

    async componentDidMount() {
        const hasPerm = await this.props.store.permissionStore.userHasPermission('upload');
        this.setState({ hasManagePerm: hasPerm });
    }

    render() {
        const Dragger = Upload.Dragger;
        const { uploading, fileList } = this.state;
        const { msg } = this.props;

        const props = {
            name: 'file',
            multiple: true,
            onRemove: file => {
                this.setState(state => {
                    const index = state.fileList.indexOf(file);
                    const newFileList = state.fileList.slice();
                    newFileList.splice(index, 1);
                    return {
                        fileList: newFileList
                    };
                });
            },
            fileList,

            beforeUpload: file => {
                const self = this;

                // Setup the file for upload
                // Start a new instance of FileReader
                var fileReader = new FileReader();

                // When the filereader loads initiate a function
                fileReader.onload = (function (file) {
                    // This function is run to put the upload in place.
                    return function (e) {
                        const file_id = file.name.replace(/\ |\./g, '_');
                        const file_upload_data = {
                            filename: file.name,
                            file_data: this.result,
                            file_id: file_id
                        };

                        // Add the data.
                        self.setState(state => ({
                            fileList: [...state.fileList, file],
                            file_upload_data: [...state.file_upload_data, file_upload_data]
                        }));
                    };
                })(file);

                // Preserve the files.
                fileReader.readAsDataURL(file); //ENH: Not required?
                return false;
            }
        };
        return (
            <div style={{ margin: '15px', maxWidth: '800px' }}>
                <Dragger {...props} className="file-drop-zone" disabled={!this.state.hasManagePerm}>
                    <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">{msg('drag_and_drop')}</p>
                </Dragger>

                <Checkbox onChange={this.handleAutoCreateChange}>{msg('auto_create')}</Checkbox>
                <div className="upload-encoding">
                    <span>{msg('encoding_label')}</span>
                    <Input onChange={this.handleEncodingChange} />
                    <span>
                        ({msg('encoding_msg')}{' '}
                        <a
                            className="encoding-url"
                            href={msg('encoding_url')}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {msg('encoding_url_title')}
                        </a>
                        )
                    </span>
                </div>
                <div className="page-actions-btns">
                    <Button
                        icon={<UploadOutlined />}
                        loading={uploading}
                        type="primary"
                        onClick={this.handleUpload}
                        disabled={this.state.file_upload_data.length === 0}
                    >
                        {msg('do_upload_btn')}
                    </Button>
                    <Button
                        icon={<DeleteOutlined />}
                        onClick={this.handleClearUploads}
                        disabled={this.state.fileList.length === 0}
                    >
                        {msg('clear_upload_btn')}
                    </Button>
                    <div className="queries-info">
                        <Card>
                            {`${msg('notes_title')}:`}
                            <ul>
                                <li className="ant-upload-hint">{msg('notes_msg_1')}</li>
                                <li className="ant-upload-hint">{msg('notes_msg_2')}</li>
                                <li className="ant-upload-hint">{msg('notes_msg_3')}</li>
                            </ul>
                        </Card>
                    </div>
                </div>
            </div>
        );
    }

    handleAutoCreateChange = e => {
        this.setState({ autoCreateTable: e.target.checked });
    };

    handleEncodingChange = e => {
        this.setState({ encoding: e.target.value });
    };

    handleUpload = async () => {
        this.setState({
            uploading: true
        });

        this.uploadFileData(this.state.file_upload_data[0]);
    };

    handleClearUploads = () => {
        this.setState({ fileList: [] });
    };

    uploadFileData(fileData) {
        const { file_upload_data, encoding, autoCreateTable } = this.state;

        //Put the file in uploading state
        this.setState({
            fileList: [...this.state.fileList].map(file => {
                if (file.name === fileData.filename)
                    return Object.assign(file, { status: 'uploading' });
                else return file;
            })
        });

        let formData = new FormData();
        formData.append('filename', fileData.filename);
        formData.append('autocreate-table', autoCreateTable);
        if (encoding.length) formData.append('file-encoding', encoding);
        formData.append('file_data', fileData.file_data);

        const token = this.readCookie('csrf_token');
        reqwest({
            url: 'config/upload_data',
            method: 'post',
            processData: false,
            data: formData,
            contentType: 'application/x-www-form-urlencoded;charset=UTF-8;',
            headers: { 'X-CSRF-Token': token }
        }).always(result => {
            //update the file in fileList
            const newFileList = [...this.state.fileList].map(file => {
                if (file.name === fileData.filename)
                    return Object.assign(file, {
                        status: result.success ? 'done' : 'error',
                        response: result.msg
                    });
                else return file;
            });

            if (result.success) message.success(result.msg);
            else message.error(result.msg);

            const newFileUploadData = [...file_upload_data].filter(data => {
                return data.filename !== fileData.filename;
            });
            this.setState({
                fileList: newFileList,
                file_upload_data: newFileUploadData,
                uploading: false
            });

            if (newFileUploadData.length) this.uploadFileData(newFileUploadData[0]);
            else this.setState({ uploading: false });
        });
    }

    readCookie(name) {
        var nameEQ = name + '=';
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i].trim();
            if (c.startsWith(nameEQ)) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }
}
