// Copyright: IQGeo Limited 2010-2023
import { evalAccessors } from 'myWorld/base/util';

/* Provides functions for layers to embed custom views/widgets.
 * @mixin
 */
export const WidgetRendererMixin = {
    getDefinitions(classList) {
        let widgetDefinitions = [];
        if (classList?.startsWith('[')) {
            const definitions = classList
                .replace('[', '')
                .replace(']', '')
                .replace(/ /gi, '')
                .split(',');

            widgetDefinitions = [];

            for (const classItem of definitions) {
                if (evalAccessors(classItem)) {
                    widgetDefinitions.push(evalAccessors(classItem));
                }
            }

            return widgetDefinitions;
        }

        if (classList?.length > 0) {
            if (evalAccessors(classList)) {
                widgetDefinitions.push(evalAccessors(classList));
            }
        }

        return widgetDefinitions;
    }
};

export default WidgetRendererMixin;
