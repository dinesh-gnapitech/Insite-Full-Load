import React, { Component } from 'react';
import gotoImg from 'images/goto.png';

export class FeatureName extends Component {
    render() {
        const { msg, text, datasource = 'myworld', showLink = true } = this.props;

        const link = showLink ? (
            <a
                title={msg('view_feature')}
                className="linkToEdit"
                href={`./config.html#/features/${datasource}/${text}/edit`}
            >
                <img className={'hidden'} alt="View" src={gotoImg} />
            </a>
        ) : null;

        return (
            <label>
                {text}
                {link}
            </label>
        );
    }
}
