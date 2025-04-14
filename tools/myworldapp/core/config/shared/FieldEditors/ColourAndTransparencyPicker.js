import React, { Component } from 'react';
import { Popover } from 'antd';
import reactCSS from 'reactcss';
import { SketchPicker } from 'react-color';
import { observer } from 'mobx-react';

const getColor = (colorString, opacity) => {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorString);
    const rgb = result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16)
          }
        : null;
    const color = { ...rgb, ...{ a: opacity ?? 1 } };
    return color;
};

@observer
export class ColourAndTransparencyPicker extends Component {
    static getDerivedStateFromProps(props, state) {
        return {
            displayColorPicker: state?.displayColorPicker || false,
            color: state?.color || getColor(props.color, props.opacity)
        };
    }
    constructor(props) {
        super(props);
        this.state = {};
    }

    handleClick = () => {
        this.setState({ displayColorPicker: !this.state.displayColorPicker });
    };

    handleClose = () => {
        this.setState({ displayColorPicker: false });
    };

    handleChange = color => {
        this.setState({ color: color.rgb });
        this.props.onChange({ color: color.hex, opacity: color.rgb.a });
    };

    render() {
        const color = this.state.color;

        const styles = reactCSS({
            default: {
                color: {
                    width: '140px',
                    height: '14px',
                    borderRadius: '2px',
                    background: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`,
                    opacity: color.a
                },
                swatch: {
                    padding: '5px',
                    background:
                        "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==') left center",
                    borderRadius: '1px',
                    boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
                    display: 'inline-block',
                    cursor: 'pointer',
                    verticalAlign: 'middle'
                },
                cover: {
                    position: 'fixed',
                    top: '0px',
                    right: '0px',
                    bottom: '0px',
                    left: '0px'
                }
            }
        });

        let presetColors;
        if (!this.props.disallowTransparent) {
            presetColors = [
                'TRANSPARENT',
                '#D0021B',
                '#F5A623',
                '#F8E71C',
                '#8B572A',
                '#7ED321',
                '#417505',
                '#BD10E0',
                '#9013FE',
                '#4A90E2',
                '#50E3C2',
                '#B8E986',
                '#000000',
                '#4A4A4A',
                '#9B9B9B',
                '#FFFFFF'
            ];
        }

        return (
            <div>
                <div style={styles.swatch} onClick={this.handleClick}>
                    <div style={styles.color} />
                </div>
                {this.state.displayColorPicker ? (
                    <div>
                        <div style={styles.cover} onClick={this.handleClose} />
                        <Popover
                            align={{
                                offset: [0, 0],
                                targetOffset: [0, 0]
                            }}
                            color="transparent"
                            content={
                                <SketchPicker
                                    color={this.state.color}
                                    onChange={this.handleChange}
                                    disableAlpha={this.props.disableAlpha}
                                    presetColors={presetColors}
                                />
                            }
                            overlayStyle={{
                                padding: 0
                            }}
                            overlayClassName="myw-pop-color-and-transparency-picker"
                            overlayInnerStyle={{
                                border: 0,
                                boxShadow: 'none'
                            }}
                            placement="bottomLeft"
                            visible={this.state.displayColorPicker}
                        />
                    </div>
                ) : null}
            </div>
        );
    }

    hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16)
              }
            : null;
    }
}
