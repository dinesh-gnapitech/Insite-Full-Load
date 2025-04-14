// Copyright: IQGeo Limited 2010-2023
import View from 'myWorld/base/view';

export class ILayerControlWidget extends View {
    /**
     * Interface for class that represent a LayerControlWidget.
     * @interface
     * @param  {Application}       options.app
     * @param  {Layer}             options.layer
     * @constructs
     * @extends  {View}
     */
    constructor(options) {
        super(options);
    }
}

export default ILayerControlWidget;
