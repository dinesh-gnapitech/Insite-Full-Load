// Copyright: IQGeo Limited 2010-2023

function factory(...mixinsOrFactories) {
    const mixins = mixinsOrFactories.map(mixinOrFactory =>
        typeof mixinOrFactory == 'function' ? mixinOrFactory.prototype : mixinOrFactory
    );
    const proto = Object.assign.apply(null, [{}].concat(mixins));
    const factory = (...args) => {
        const obj = Object.create(proto);
        obj.initialize?.(...args);
        return obj;
    };
    factory.prototype = proto;
    return factory;
}
export default factory;
