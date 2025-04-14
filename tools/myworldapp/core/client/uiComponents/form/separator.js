// Copyright: IQGeo Limited 2010-2023

import { FormComponent } from './formComponent';
import View from 'myWorld/base/view';
import React from 'react';
import { Separator as ReactSeparator } from 'myWorld/uiComponents/react';
import { createRoot } from 'react-dom/client';

/**
 * @class  Separator
 *         Used to section content for eg. to section off group content in feature forms
 * @param  {string} options.label                  (Optional)
 * @param  {string} [options.orientation = 'left'] (Optional)'left'|'center'!'right'
 
 * @example
 * new Separator({label:'Section 1', orientation: 'center'})
 *
 * @extends {FormComponent}
 **/
export class Separator extends FormComponent {
    static {
        this.prototype.className = 'myw-separator';
        this.prototype.events = {};
    }

    constructor(options) {
        super(options);
        this.render();
    } //Over-riding parent's events since we don't need them in this component

    render(options) {
        const { label, orientation = 'left' } = this.options;
        const SeparatorComponent = (
            <ReactSeparator orientation={orientation}>{label}</ReactSeparator>
        );
        const root = createRoot(this.el);
        root.render(SeparatorComponent);
        super.render(options);

        return this;
    }
}

View.prototype.componentMapping['separator'] = Separator;

export default Separator;
