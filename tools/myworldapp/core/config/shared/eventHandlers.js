const onControlS = handler => event => {
    let charCode = String.fromCharCode(event.which).toLowerCase();
    // hand save on ctrl+S, for MAC we can use metaKey to detect cmd key
    if ((event.ctrlKey && charCode === 's') || (event.metaKey && charCode === 's')) {
        event.preventDefault();
        return handler();
    }
};
export { onControlS };
