// Copyright: IQGeo Limited 2010-2023
import { ReferenceTooltipFieldViewer } from './referenceTooltipFieldViewer';

/**
 * Extends Default behaviour by enabling a tooltip displaying urns
 * @name ReferenceSetTooltipFieldViewer
 * @constructor
 * @extends {ReferenceTooltipFieldViewer}
 */
export class ReferenceSetTooltipFieldViewer extends ReferenceTooltipFieldViewer {
    /**
     * Renders the field value in self's element
     */
    render() {
        const fieldValue = this.fieldValue;
        const dynamic = !!this.fieldDD.value;
        const nully = !dynamic && (fieldValue === null || fieldValue.length === 0);

        //first check if we should render the value or not
        if (nully && !this.options.renderAll) return;

        this.renderValue(fieldValue);
    }

    convertValue() {
        if (this.fieldDD.value) {
            //Dynamic Reference set
            return this.msg('item_many');
        } else {
            //Stored reference set
            const displayValue = this.feature.displayValues[this.fieldName];
            return this.msg('ref_set_description', { count: displayValue });
        }
    }
}

export default ReferenceSetTooltipFieldViewer;
