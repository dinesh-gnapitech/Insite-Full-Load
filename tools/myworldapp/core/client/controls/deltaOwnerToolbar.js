// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-base';
import { Toolbar } from 'myWorld/uiComponents';
import { Control } from 'myWorld/base/control';

/*
 * Tollbar providing functions for managing the current delta
 *
 * Has buttons to select design from list, open it, goto boundary, etc.
 */
export class DeltaOwnerToolbar extends Control {
    // Initialise self
    constructor(owner) {
        super(owner, {});
        this.owner = owner;
        this.app = this.owner.app;

        this.buttons = [];
        this.buttons.push({ owner: this.owner, Button: this.owner.OpenButton });
        // this.buttons.push( {owner: this.owner, Button: this.owner.ToggleBoundaryButton} ); // TODO: Doesn't work

        this.buttons.push({ owner: this.owner, Button: this.owner.SelectElementsButton });
        this.buttons.push({ owner: this.owner, Button: this.owner.ShowConflictsButton });

        if (!myw.isNativeApp) {
            this.buttons.push({ owner: this.owner, Button: this.owner.MergeButton });
            this.buttons.push({ owner: this.owner, Button: this.owner.PromoteElementsButton });
        }

        this.buttons.push({ owner: this.owner, Button: this.owner.CloseDeltaOwnerButton });
    }

    // Re-render self's elements
    render() {
        if (!this.parentDiv) return;

        this.parentDiv.find('.delta-owner-toolbar').remove();

        if (this.visible) {
            const div = $('<ul>');
            const ul = $('<div class="delta-owner-toolbar navigation-bar noselect"></div>');
            ul.append(div);
            this.parentDiv.append(ul);

            this.toolbar = new Toolbar({ element: div, buttons: this.buttons });
        }
    }
}

export default DeltaOwnerToolbar;
