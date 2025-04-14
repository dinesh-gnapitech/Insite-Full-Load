import React from 'react';
import { LockOutlined, PlusOutlined } from '@ant-design/icons';
import { KeyValueView_Unwrapped } from './KeyValueView';
import { localise } from '../../shared/Localise';
import { EditableTable } from '../../shared';
import { Button } from 'antd';
import { GeoserverCredentialsDialog } from './geoserverCredentialsDialog';
import { GeoserverAuthDefaults } from 'myWorld/layers/geoserverImgRequest';

//  Modified base KeyValueView class to add some extra fields
@localise('fieldEditor')
export class GeoserverURLTable extends KeyValueView_Unwrapped {
    //  We can't override this because of the localise wrapper
    constructor(props) {
        super(props);

        //  Add in the extra column here
        const { msg, args } = props;
        const { authTitle } = args;

        const authHeader = authTitle || msg('auth');

        const newColumn = {
            title: authHeader,
            dataIndex: 'auth',
            width: '70px',
            getInput: record => (
                <Button
                    icon={<LockOutlined />}
                    onClick={this.onAuthenticate.bind(this, record)}
                    title={msg('add_value_btn')}
                />
            )
        };
        newColumn.title = newColumn.title.length ? newColumn.title : '';
        this.columns.push(newColumn);
        this.columns[1].width = '20%';

        this.onDialogCancel = this.onDialogCancel.bind(this);
        this.onDialogOkay = this.onDialogOkay.bind(this);
    }

    static getDerivedStateFromProps(props, state) {
        if (state.values?.length >= 1) return {}; //use existing state ENH: should check if props have any different keys or values

        //initial state
        const values = GeoserverURLTable.getValues(props);
        return { values, currentAuthRecord: null };
    }

    componentDidUpdate(prevProps) {
        if (
            this.props.value !== prevProps.value &&
            this.state.values &&
            this.state.values.length <= 1
        ) {
            const values = GeoserverURLTable.getValues(this.props);
            this.setState({ values });
        }

        //  Check for any blank auth values and replace with default
        for (let index = 0; index < this.state.values.length; ++index) {
            const values = this.state.values[index];
            if (values.auth === '') {
                this.handleChange(index, 'auth', Object.assign({}, GeoserverAuthDefaults));
            }
        }
    }

    addItem() {
        let values = [...this.state.values];
        values.push({ id: ++this.count, key: '', value: '', auth: '', seq: values.length });
        this.setState({ values });
        this.triggerChange(values);
    }

    static getValues(props) {
        const propsValue = props.value || [];
        const keyName = props.args.keyProp || 'key';
        const valueName = props.args.valueProp || 'value';

        //check if object, if so convert to array of {key, value} elements
        let values = props.args.isArray
            ? propsValue
            : Object.entries(propsValue).map(([key, value]) => ({ key, value }));

        //check for no rows. if so, add an empty one
        if (values.length == 0) values.push({ key: '' });

        //convert given props into format to be used as state (including id and seq)
        values = values.map((element, index) => {
            const key = element[keyName] || element.key || ''; //if element[keyName] is '' will be falsy but want to include it
            let value = element[valueName] || element.value || {};
            if (typeof value === 'string') {
                value = { url: value, auth: '' };
            }
            const url = value.url;
            const auth = value.auth;
            return { id: index, seq: index, key, value: url, auth };
        });

        return values;
    }

    /**
     * For return to server
     * takes values and returns array of objects - [{keyProp:..., valueProp:...},{}] if isArray, else returns an object
     * @param {Object} value
     */
    unFormatValues(value) {
        if (this.props.args.isArray) {
            let values = [];
            const keyName = this.props.args.keyProp || 'key';
            const valueName = this.props.args.valueProp || 'value';
            value.forEach(keyValPair => {
                if (keyValPair.key == '' && !this.props.blankAllowed) {
                    return;
                } else {
                    values.push({
                        [keyName]: this.getKey(keyValPair),
                        [valueName]: this.getValue(keyValPair)
                        //[authName]: this.getValue(keyPairVal)
                    });
                }
            });
            return values;
        } else {
            //format data back into what is expected from form
            let values = {};
            value.forEach(element => {
                if (element.key != '')
                    values[element.key] = {
                        url: this.getValue(element),
                        auth: this.getAuth(element)
                    };
            });
            return values;
        }
    }

    getAuth(element) {
        return element.auth;
    }

    render() {
        const { msg } = this.props;
        if (!this.state.values.length) return null;

        const values = this.state.values;
        const data = values.map((value, seq) => {
            //Add seq onto value object, used in columns
            return {
                auth: value.auth,
                seq: seq + 1,
                key: value.key || '',
                value: value.value || '',
                rowKey: `${value.id}`
            };
        });

        let flag = false;
        data.forEach((element, index) => {
            if (!element.rowKey || element.rowKey == 'undefined') flag = true;
        });
        if (flag) return null; //stop render before values have been formatted

        //Enable moving row if isArray
        const isArray = this.props.args.isArray;
        const moveRow = isArray ? this.moveRow : null;

        return (
            <div className="values-field-editor key-value-editor">
                <EditableTable
                    className="input-container editable-table"
                    columns={this.columns}
                    dataSource={data}
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    size="small"
                    moveRow={moveRow}
                    rowKey={'rowKey'}
                />
                <div className="controls-container">
                    <Button
                        icon={<PlusOutlined />}
                        onClick={this.addItem.bind(this)}
                        title={msg('add_value_btn')}
                    />
                </div>
                <GeoserverCredentialsDialog
                    formRef={React.createRef()}
                    record={this.state.currentAuthRecord}
                    msg={this.props.msg}
                    onCancel={this.onDialogCancel}
                    onOkay={this.onDialogOkay}
                />
            </div>
        );
    }

    onAuthenticate(record) {
        this.setState({ currentAuthRecord: record });
    }

    onDialogCancel() {
        this.setState({ currentAuthRecord: null });
    }

    onDialogOkay(settings) {
        this.handleChange(this.state.currentAuthRecord.seq - 1, 'auth', settings);
        this.setState({ currentAuthRecord: null });
    }
}
