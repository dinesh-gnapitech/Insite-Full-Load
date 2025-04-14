import React from 'react';
import { createRoot } from 'react-dom/client';
import withConfigProvider from './withConfigProvider';

/**
 * Wrapper function for ReactDOM createRoot, React.createElement and root.render
 * Used when rendering a piece of JSX (“React node”) into a browser DOM node
 * Also adds AntD <ConfigProvider/> to the react node for consistent theming
 * @param {object}      [domNode=null]        Optional. A DOM element. React will create a root for this DOM element and allow you to call functions on the root, such as render to display rendered React content
 * @param {object}      reactNodeType  The type argument must be a valid React component type. </br>
 *                                     For example, it could be a tag name string (such as 'div' or 'span'), </br>
 *                                     or a React component (a function, a class, or a special component like Fragment).
 * @param {object|null} reactNodeProps React will create an element with props matching the props passed
 * @param {object}      [renderRoot=undefined]  Optional. Existing render root. If missing a new one will be created and returned
 *                                              (Pass in the returned object if your react node is going to be rendered multiple times)
 * @returns {object}                            root where the react dom will be added/rendered
 */
export function renderReactNode(domNode, reactNodeType, reactNodeProps, renderRoot) {
    if (!domNode) domNode = document.createElement('div');
    if (!renderRoot) {
        //React will create a root for the domNode, and take over managing the DOM inside it
        //We don't want to recreate the root if it already exists
        renderRoot = createRoot(domNode);
    }
    const e = React.createElement;
    const reactNode = e(withConfigProvider(reactNodeType), reactNodeProps);
    //Wrap the react component in AntD's ConfigProvider to drive style consistency
    renderRoot.render(reactNode);
    return renderRoot;
}
