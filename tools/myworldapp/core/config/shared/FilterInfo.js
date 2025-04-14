import React, { Component } from 'react';
import { localise } from './Localise';
import { Card } from 'antd';

@localise('filters')
export class FilterInfo extends Component {
    render() {
        const { msg, datasource = 'myworld' } = this.props;

        return (
            <div className="queries-info">
                <Card>
                    <b>{msg('filter_format')}: </b>
                    [&lt;{msg('field_name')}&gt;] &lt;{msg('operator')}&gt; &lt;
                    {msg('field_value')}&gt;
                    <br />
                    {datasource === 'myworld'
                        ? msg('myworld_query_filter_help')
                        : msg('query_filter_help')}
                    <br />
                    {msg('examples')}:
                    <ul>
                        <li> {msg('query_filter_eg1')} </li>
                        <li> {msg('query_filter_eg2')} </li>
                        <li> {msg('query_filter_eg3')} </li>
                        <li> {msg('query_filter_eg4')} </li>
                    </ul>
                    {datasource === 'myworld' && (
                        <ul>
                            <li> {msg('query_filter_eg5')} </li>
                            <li> {msg('query_filter_eg6')} </li>
                            <li> {msg('query_filter_eg7')} </li>
                        </ul>
                    )}
                </Card>
            </div>
        );
    }
}
