import React, { Component } from 'react';

/**
 * Returns an high order component which wraps a component with an antd form.
 * The wrapped component receives a form ref as a prop
 */
export const withFormForProp = () => WrappedComponent => {
    return class Wrapper extends Component {
        render() {
            const formRef = React.createRef();
            return <WrappedComponent {...this.props} form={formRef} />;
        }
    };
};
