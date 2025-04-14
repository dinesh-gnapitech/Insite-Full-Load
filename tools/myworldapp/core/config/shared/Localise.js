import myw from 'myWorld-base';
import React, { Component } from 'react';

export const localise = messageGroup => WrappedComponent => {
    return class Wrapper extends Component {
        msg(...args) {
            args[0] = args[0].replace(/\./g, '_'); //because of nested fields in Form builder (ex: spec fields)
            return myw.msg(messageGroup, ...args);
        }

        render() {
            return <WrappedComponent {...this.props} msg={this.msg} />;
        }
    };
};
