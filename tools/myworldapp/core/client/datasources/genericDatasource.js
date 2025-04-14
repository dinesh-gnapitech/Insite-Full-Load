// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { evalAccessors, processOptionsFromJson } from 'myWorld/base/util';
import Datasource from './datasource';

/**
 * @class Datasource to access visualization only layers
 * @name GenericDatasource
 */
export class GenericDatasource extends Datasource {
    static layerDefFields = [
        {
            name: 'extraArguments',
            type: 'json',
            viewClass: 'ListView',
            args: { sortable: false, valType: 'json' }
        }
    ];

    static specFields = [
        { name: 'layerClass', type: 'string', size: 'long' },
        {
            name: 'fixedArguments',
            type: 'json',
            viewClass: 'ListView',
            args: { sortable: false, valType: 'json' }
        }
    ];

    /**
     * Instantiates a layer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {ILayer}
     */
    createLayer(layerDef) {
        let layer;
        let Constructor = evalAccessors(this.options.layerClass);
        let args = processOptionsFromJson(this.options.fixedArguments) || [];
        const extraArgs = processOptionsFromJson(layerDef.extraArguments) || [];

        if (typeof Constructor != 'function') {
            console.log(
                `Error instantiating layer '${layerDef.name}'. '${layerDef.layerClass}' does not evaluate to a class`
            );
        }

        try {
            args = [undefined].concat(args, extraArgs); //first arg is this/context which in the case of a constructor can be undefined

            Constructor = Function.prototype.bind.apply(Constructor, args);
            layer = new Constructor();
        } catch (e) {
            console.log(
                `Error instantiating layer '${layerDef.name}'. Class: ${layerDef.layerClass}. Args: ${args}. Exception:${e}`
            );
        }

        return layer;
    }
}

myw.datasourceTypes['generic'] = GenericDatasource;

export default GenericDatasource;
