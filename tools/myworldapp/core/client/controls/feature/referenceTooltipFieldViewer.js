// Copyright: IQGeo Limited 2010-2023
import { ReferenceFieldViewer } from './referenceFieldViewer';

/**
 * Extends default behaviour with tooltip listing feature urns;
 *
 * @name ReferenceTooltipFieldViewer
 * @constructor
 * @extends {ReferenceFieldViewer}
 */
export class ReferenceTooltipFieldViewer extends ReferenceFieldViewer {
    static {
        this.prototype.events = {
            mouseover: 'showToolTip',
            click: 'followRelationship'
        };
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
    }

    showToolTip() {
        if (typeof this.feature.properties[this.fieldName] == 'string') {
            this.$el.prop('title', this.feature.properties[this.fieldName]);
            return;
        }

        let str = '';
        (this.feature.properties[this.fieldName] || []).map(f => {
            str += `${f}\n`;
        });
        this.$el.prop('title', str);
    }
}

export default ReferenceTooltipFieldViewer;
