import React, { Component } from 'react';
import { Form, Input } from 'antd';
import { localise } from '../../../shared';

const FormItem = Form.Item;

@localise('settings')
export class PointStyleForm extends Component {
    state = {};
    componentDidMount() {
        const { iconUrl, iconAnchor } = this.props.data;
        this.setState({
            iconUrl,
            iconAnchorX: iconAnchor?.[0],
            iconAnchorY: iconAnchor?.[1]
        });
    }
    render() {
        const { msg } = this.props;
        const formItemLayout = {
            labelCol: { span: 8 },
            wrapperCol: { span: 14 }
        };

        return (
            <Form layout="horizontal">
                <FormItem label={msg('location')} {...formItemLayout}>
                    <Input
                        style={{ width: 220 }}
                        value={this.state.iconUrl}
                        onChange={this.handleChangeOf.bind(this, 'iconUrl')}
                    />
                </FormItem>
                <FormItem label={msg('anchor')} {...formItemLayout}>
                    X{' '}
                    <Input
                        style={{ width: 50, marginLeft: 5, marginRight: 10 }}
                        value={this.state.iconAnchorX}
                        onChange={this.handleChangeOf.bind(this, 'iconAnchorX')}
                    />{' '}
                    Y
                    <Input
                        style={{ width: 50, marginLeft: 5 }}
                        value={this.state.iconAnchorY}
                        onChange={this.handleChangeOf.bind(this, 'iconAnchorY')}
                    />
                </FormItem>
            </Form>
        );
    }

    handleChangeOf(name, e) {
        const val = e.target.value;
        const stateObj = {};
        stateObj[name] = val;
        this.setState(stateObj, () => {
            const { iconUrl, iconAnchorX, iconAnchorY } = this.state;
            this.props.onChange({ iconUrl: iconUrl, iconAnchor: [iconAnchorX, iconAnchorY] });
        });
    }
}
