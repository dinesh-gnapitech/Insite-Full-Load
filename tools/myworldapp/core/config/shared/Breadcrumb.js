import React, { Component } from 'react';

export const breadcrumb = WrappedComponent => {
    return class Wrapper extends Component {
        componentDidMount() {
            this.props.store.breadcrumbStore.set(
                this.props.msg('breadcrumb'),
                this.props.match.url
            );
        }

        componentWillUnmount() {
            this.props.store.breadcrumbStore.clear();
        }

        render() {
            return <WrappedComponent {...this.props} />;
        }
    };
};
