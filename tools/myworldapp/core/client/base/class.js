// Copyright: IQGeo Limited 2010-2023
// Adapted from Leaflet (https://github.com/Leaflet/Leaflet)
import { Localisable } from './localisation';

/**
 * Merges given objects (mixins) into the given class
 * @param  {function} targetClass
 * @param  {...Object} mixins
 * @example
 *  const MyMixin = {
 *      foo() { return 123+this.bar; },
 *      bar: 5
 *  };
 *
 *  class MyClass  {
 *  }
 *  include(MyClass, MyMixin)
 *
 *  const a = new MyClass();
 *  a.foo(); // 128
 */
export function include(targetClass, ...mixins) {
    const proto = targetClass.prototype;
    //ensure items already in prototype override what comes from mixins
    const propDescriptors = [...mixins, proto].reduce((acc, mixin) => {
        if (typeof mixin !== 'object') {
            console.error(`${this.name} include() call - invalid mixin object:`, mixin);
            return acc;
        } else return Object.assign(acc, Object.getOwnPropertyDescriptors(mixin));
    }, {});
    Object.defineProperties(proto, propDescriptors);
}

/**
 * Base class that provides easier handling of options and mixins as well as localisation methods
 * @class
 * @extends Localisable
 */
export class MywClass extends Localisable {
    static {
        this.prototype.messageGroup = 'MywClass';
    }

    /**
     * Merges given objects (mixins) into the class
     * @param  {...Object} mixins
     * @example
     *  const MyMixin = {
     *      foo() { return 123+this.bar; },
     *      bar: 5
     *  };
     *
     *  class MyClass extends MywClass {
     *      static {
     *          this.includes(MyMixin)
     *      }
     *  }
     *
     *  const a = new MyClass();
     *  a.foo(); // 128
     */
    static include(...mixins) {
        include(this, ...mixins);
    }

    /**
     * Merges given options with options from parent class
     * @param {object} options
     * @example
     * class MyClass extends MywClass {
     *     static {
     *         this.mergeOptions({
     *             myOption1: 'foo',
     *             myOption2: 'bar'
     *         });
     *     }
     * }
     *
     * class MyChildClass extends MyClass {
     *     static {
     *         this.mergeOptions({
     *             myOption1: 'baz',
     *             myOption3: 5
     *         });
     *     }
     * }
     *
     * let a = new MyChildClass();
     * a.options.myOption1; // 'baz'
     * a.options.myOption2; // 'bar'
     * a.options.myOption3; // 5
     */
    static mergeOptions(options) {
        this.prototype.options = Object.assign({}, this.prototype.options, options);
    }

    /**
     * Sets the options property with the result of merging the given options with the default set on the class
     * @param {object} options
     * @returns {object} the merged options
     * @example
     * class MyClass extends myw.MywClass {
     *     static {
     *         this.mergeOptions({
     *             foo: 'bar',
     *             bla: 5
     *         });
     *     }
     *
     *     constructor (options) {
     *         super();
     *         this.setOptions(options);
     *     }
     * }
     *
     * let c = new MyClass({bla: 10}); // {foo: 'bar', bla: 10}
     */
    setOptions(options) {
        if (this.options?.v) options = this.upgradeOptionsTo(this.options.v, options);
        this.options = Object.assign({}, this.options, options);
        return this.options;
    }

    /**
     * Updates the given options from a previous schema to the target schema version
     * @param {number} targetVersion
     * @param {object} options
     * @returns {object} upgraded options
     */
    upgradeOptionsTo(targetVersion, options) {
        for (let v = options.v || 1; v < targetVersion; v++) {
            const method = this[`upgradeOptionsToV${v + 1}`];
            if (method) options = method.call(this, options);
            else console.log(`Missing method upgradeOptionsToV${v + 1} on `, this.constructor.name);
        }
        return options;
    }
}

export default MywClass;
