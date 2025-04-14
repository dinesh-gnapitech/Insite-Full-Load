// Copyright: IQGeo Limited 2010-2023

import { FormComponent } from './formComponent';
import React, { useRef, useState } from 'react';
import View from 'myWorld/base/view';
import { Select } from 'myWorld/uiComponents/react';
import { renderReactNode } from '../react';
import { isTouchDevice } from 'myWorld/base/browser';

/**
 * @class  Dropdown
 * @param  {dropdownOptions} options.options    Options to add to the select box. If list of objects, object should had 'id' and 'label' as keys
 * @param  {string}        options.selected   Selected item identifier
 * @param  {function}      options.onChange   onChange handler. Will receive value(string) and instance(Dropdown) as arguments
 * @param  {boolean}       options.allowClear Allow clearing the selected value with a 'x' button
 * @param  {boolean}       [options.minWidth = '40px']  (Optional) Min width of the select box, default 40px
 * @param  {string}        [options.sortField = undefined]   'id'|'label'; If specified, options are sorted by sortField
 * @param  {boolean}       [options.allowSearch = options.options > 6] Enables free text search on the options list (touch devices need an extra tap on the box to enable search)
 * 

 * @example
 * new Dropdown(options:['On', 'Off'], selected: 'On'})
 *
 * @extends {FormComponent}
 **/
export class Dropdown extends FormComponent {
    static {
        this.prototype.className = 'ui-select';
        this.prototype.blackListParams = ['onChange'];
        this.prototype.events = {};
    }

    constructor(options) {
        super(options);

        this.dropdownOptions = [];
        this.options.options.forEach(option => {
            if (typeof option != 'object') {
                this.dropdownOptions.push({ value: option, display_value: option });
            } else {
                this.dropdownOptions.push({ value: option.id, display_value: option.label });
            }
        });
        this.selected = options.selected;
        this._isReadonly = options.readonly;
        this._onChange = this._onChange.bind(this);
        this.render();
    } //Over-riding parent's events since we don't need them in this component

    render(options) {
        const {
            allowClear,
            allowSearch = this.dropdownOptions.length > 6,
            placeholder,
            sortField,
            minWidth
        } = this.options;
        this.renderRoot = renderReactNode(
            this.el,
            DropdownWithFilter,
            {
                enumValues: this.dropdownOptions,
                value: this.selected,
                minWidth,
                allowClear,
                allowSearch,
                placeholder,
                sortField,
                onChange: this._onChange,
                disabled: this._isReadonly
            },
            this.renderRoot
        );
        super.render(options);

        return this;
    }

    setValue(value) {
        this.selected = value;
        this.render();
    }

    _onChange(value) {
        this.selected = value == undefined ? '' : value; //value can be undefined when clear(x) button is used
        const options = this.options;
        if (options.onChange) {
            options.onChange.call({}, value, this);
        }
        this.render();
    }

    getValue() {
        return this.selected ?? this.options.selected;
    }

    /**
     * Enables or disables the dropdown to match the given readonly value
     * @param {boolean} readonly
     */
    setReadonly(readonly = false) {
        this._isReadonly = readonly;
        this.render();
    }
}

const DropdownWithFilter = props => {
    const {
        enumValues,
        value,
        onChange,
        placeholder,
        allowClear,
        disabled,
        sortField,
        minWidth = '40px',
        allowSearch
    } = props;

    const [isActive, setActive] = useState(false);
    const [showSearch, setShowSearch] = useState(!isTouchDevice && allowSearch);

    //Used for touch devices
    //Only opens the dropdown on first click and allows search on the second click if the list is allowSearch
    const toggleOptions = e => {
        //For all clicks except on the dropdown that selects an option
        if (e.target.className !== 'ant-select-item-option-content') {
            if (isActive) {
                setShowSearch(allowSearch);
                selectRef.current.focus();
            } else setActive(!isActive);
        }
    };

    const closeOptions = () => {
        setActive(false);
        setShowSearch(false);
    };

    const options = [];
    enumValues.forEach(item => {
        options.push({ value: item.value || '', label: item.display_value });
    });

    // This will hold reference to `<Select>`
    const selectRef = useRef(null);

    return (
        <Select
            style={{ minWidth }}
            value={value}
            showSearch={showSearch}
            allowClear={allowClear}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            options={options}
            optionFilterProp="children"
            filterOption={(input, option) =>
                //This makes the search, filter the display value of the options
                {
                    const label = option?.label;
                    const labelString =
                        typeof label === 'string' ? label?.toLowerCase() : label?.toString();
                    return labelString?.includes(input.toLowerCase());
                }
            }
            filterSort={(optionA, optionB) =>
                (optionA?.[`${sortField}`] ?? '')
                    .toLowerCase()
                    .localeCompare((optionB?.[`${sortField}`] ?? '').toLowerCase())
            }
            //Props to make searchable select boxes work better on touch devices
            ref={selectRef}
            key={showSearch ? 'searchable' : 'list-only'}
            showAction={isTouchDevice ? ['focus'] : undefined}
            autoFocus={isTouchDevice ? true : undefined}
            open={isTouchDevice ? isActive : undefined}
            onClick={isTouchDevice ? toggleOptions : undefined}
            onBlur={isTouchDevice ? closeOptions : undefined}
        ></Select>
    );
};

View.prototype.componentMapping['dropdown'] = Dropdown;

/**
 * List options for the select box
 * @typedef {Array<object|string>} dropdownOptions
 * @property {string}      id   Select option value
 * @property {string}    label  Select option label
 */

export default Dropdown;
