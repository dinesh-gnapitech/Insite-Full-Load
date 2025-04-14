import React from 'react';
import { Link } from 'react-router-dom';

export const LinkBox = props => {
    const { to, label, icon } = props;
    return (
        <div className="link-box">
            <Link className="link" to={to}>
                <span className="title">{label}</span>
                <span className="icon">
                    <img src={icon} alt={label} />
                </span>
            </Link>
        </div>
    );
};
