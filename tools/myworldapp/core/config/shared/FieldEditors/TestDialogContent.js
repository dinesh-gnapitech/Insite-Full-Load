import React, { Component } from 'react';
import { Button, Card } from 'antd';
import { observer } from 'mobx-react';

@observer
export class TestDialogContent extends Component {
    state = { showResult: false };

    render() {
        const { msg, success, testResult } = this.props;
        const testMsg = success ? JSON.stringify(testResult.msg) : '';
        if (success) {
            return (
                <>
                    <div>{`${msg('testing_url')}:`}</div>
                    <samp>{testResult.url}</samp>
                    <br />
                    <br />
                    <div>{msg('test_success')}</div>
                    {!this.state.showResult && (
                        <Button style={{ marginTop: '10px' }} onClick={this.showResult}>
                            {msg('show_result')}
                        </Button>
                    )}
                    {this.state.showResult && (
                        <Card style={{ marginTop: '10px' }}>
                            <samp>{testMsg}</samp>
                        </Card>
                    )}
                </>
            );
        } else {
            return (
                <>
                    <div>{`${msg('testing_url')}:`}</div>
                    <samp>{testResult.url}</samp>
                    <br />
                    <br />
                    <div>{msg('test_failure', { errorMsg: testResult.msg })}</div>
                </>
            );
        }
    }

    showResult = () => {
        this.setState({ showResult: true });
    };
}
