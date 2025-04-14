import React, { Component } from 'react';

export class ScrollableView extends Component {
    constructor(props) {
        super(props);
        this.state = { height: this.calculateHeight() };
        this.updateDimensions = this.updateDimensions.bind(this);
    }

    calculateHeight() {
        const { topOffset, bottomOffset } = this.props;
        return window.innerHeight - ((topOffset || 0) + (bottomOffset || 0));
    }

    componentDidMount() {
        this.updateDimensions();
        window.addEventListener('resize', this.updateDimensions);
    }

    updateDimensions() {
        this.setState({ height: this.calculateHeight() });
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.updateDimensions);
    }

    render() {
        const { height } = this.state;

        return (
            <div className="scroll-view" style={{ height, overflowY: 'auto', overflowX: 'auto' }}>
                {this.props.children}
            </div>
        );
    }
}
