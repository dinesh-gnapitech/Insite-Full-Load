import React, { Component } from 'react';
import { Input, Button } from 'antd';
import { inject, observer } from 'mobx-react';

@inject('store')
@observer
export class CodeInput extends Component {
    render() {
        const { value, onChange, msg } = this.props;
        return (
            <span className="test-no-print" style={{ display: 'flex', margin: '3px' }}>
                <Input
                    type="text"
                    style={{ marginRight: '6px' }}
                    value={value}
                    className={'input-small'}
                    onChange={onChange}
                />
                <Button onClick={this.handleButtonClick.bind(this)}>{msg('generate_btn')}</Button>
            </span>
        );
    }

    handleButtonClick() {
        const generatedCode = this.constructor.generateLayerCode(
            this.props.currentLayerName,
            this.props.layers
        );
        this.setState({ value: generatedCode });
        this.props.onChange(generatedCode);
    }

    /*********** Layer code generation ***********/
    static generateLayerCode(currentLayerName, layers) {
        var generatedCode,
            codeIsUnique = false;
        //Check if the generatedCode has already been used.
        var counter = 1;
        while (!codeIsUnique) {
            var layerName = currentLayerName || '';
            if (layerName !== '') {
                generatedCode = codeBasedOnName(layerName, counter);
            } else {
                generatedCode = randomString(3);
            }
            codeIsUnique = isCodeUnique(generatedCode, layers);
            counter++;
        }
        return generatedCode;
    }

    static isCodeUnique(code, layers, currentLayer) {
        return isCodeUnique(code, layers, currentLayer);
    }
}

/**
 * Creates a code using the first letters of all the words in the name
 * if name is just one word, it uses the first two letter
 * if the calculated code is not unique then add the counter number to it
 * @param  {string} name    Layer name that the code should be based on
 * @param  {int}    counter counter used to create a unique code
 * @return {string}         unique code for the layer
 */
const codeBasedOnName = (name, counter) => {
    var code = '';
    // if more than one word, get the first letters
    var words = name.split(' '),
        charLocation = 0,
        codeChar;
    if (words.length > 1) {
        for (var i = 0; i < words.length; i++) {
            codeChar = words[i].charAt(charLocation).toLowerCase();
            //if codeChar is not [a-z][0-9] use the next character
            while (codeHasInvalidChar(codeChar)[0]) {
                charLocation = charLocation + 1;
                codeChar = words[i].charAt(charLocation).toLowerCase();
            }
            code += codeChar;
        }
    } else {
        code = words[0].charAt(0).toLowerCase() + words[0].charAt(1).toLowerCase();
    }
    if (counter > 1) code += counter;
    return code;
};

/**
 * Generates a random string
 * @param  {int}    len     Length of the required random string
 * @param  {string} charSet The character set to use to create the random string
 * @return {string}         Random string
 */
const randomString = (len, charSet) => {
    charSet = charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
    var randomString = '';
    for (var i = 0; i < len; i++) {
        var randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz, randomPoz + 1);
    }
    return randomString;
};
/**
 * Checks is the code has not been used for any other layers
 * @param  {string}         code                 The code to check
 * @param  {Array<object>}  layers               All layers
 * @param  {Object}         [currentLayer=null]  Current layer
 * @return {Boolean}                             If the code is unique or not
 */
const isCodeUnique = (code, layers, currentLayer = null) => {
    let otherLayers = Object.values(layers);
    if (currentLayer) {
        otherLayers = otherLayers.filter(layer => layer.name !== currentLayer.name);
    }
    return !otherLayers.find(layer => layer.code === code);
};

/**
 * Checks if the code has any invalid characters and returns the invalid characters if any
 * @param  {string} Layer code that needs to be inspected
 * @return {object} An array of boolean for valid or invalid and the invalid characters if any
 */
const codeHasInvalidChar = code => {
    // Find invalid characters if any
    const iChars = '!@#$£%^&*()+=-[]\';,./{}|":<>?~';
    let invalidChar = '';

    for (let codeChar of code) {
        const codeCharLoc = iChars.indexOf(codeChar);
        if (codeCharLoc >= 0) {
            invalidChar += iChars[codeCharLoc];
        }
    }

    if (invalidChar.length > 0) {
        return [true, invalidChar];
    } else {
        return [false];
    }
};
