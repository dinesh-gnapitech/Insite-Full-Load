// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { sortBy } from 'underscore';
import { translate } from 'myWorld/base';

import View from 'myWorld/base/view';
import zoomGreyImg from 'images/zoom-grey.svg';

export class TreeView extends View {
    static {
        this.prototype.events = {
            'click li.leaf': 'selectFeature',
            'click li.leaf .zoom': 'zoomToFeature',
            'click li.node': 'selectFeature',
            'click li.node .zoom': 'zoomToFeature',

            'mouseenter li .tree_label': 'leafHandleMouseEvent',
            'mouseleave li .tree_label': 'leafHandleMouseEvent',
            'mouseenter li .zoom': 'leafHandleMouseEvent',
            'mouseleave li .zoom': 'leafHandleMouseEvent',

            'click li.branch .zoom': 'zoomToBranch',
            'mouseenter li.branch .tree_label': 'branchHandleMouseEvent',
            'mouseleave li.branch .tree_label': 'branchHandleMouseEvent',
            'mouseenter li.branch .zoom': 'branchHandleMouseEvent',
            'mouseleave li.branch .zoom': 'branchHandleMouseEvent'
        };

        this.mergeOptions({
            zoomEnabled: true
        });
    }

    /**
     * Renders the UI to display the information about the current feature set
     */
    render() {
        this.rootBranch = this.options.root;
        this.tree = $('<ul class="tree">');
        this._renderTree(this.tree, this.rootBranch, true);
        this.$el = this.tree;
        translate(this.options.messageGroup, this.$el);
        this.delegateEvents();
    }

    _guid() {
        return (
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15)
        );
    }

    _renderLeaf(node, type) {
        const urn = node.getUrn(true, true);
        const title = this.options.leafRenderer(node, type) || node.feature.getTitle();
        const nodeEl = $(
            `<li class="${type}" data-id="${urn}" title="${node
                .metadata()
                .join(
                    '\n'
                )}"><input type="checkbox" id="${urn}"/><label class="tree_label" for="${urn}">${title}</label></li>`
        );

        if (this.options.zoomEnabled) {
            nodeEl.append(
                `<div class="zoom" title="{:result_zoom_link}"><img src="${zoomGreyImg}"/></div>`
            );
        }

        return nodeEl;
    }

    _renderChildren(parentList, children) {
        for (const child of children) {
            if (!child.children.length) {
                parentList.append(this._renderLeaf(child, 'node'));
            } else {
                const id = this._guid();
                const nestedChildren = this._getAllChildren([], child);
                const title =
                    this.options.branchRenderer(nestedChildren) || this.options.branchLabel;
                const pathNode = $(
                    `<li class="branch"><input type="checkbox" id="p${id}"/><label for="p${id}" class="tree_label">${title}</label></li>`
                ).data('children', nestedChildren);
                if (this.options.zoomEnabled) {
                    pathNode.append(
                        `<div class="zoom" title="{:result_zoom_link}"><img src="${zoomGreyImg}"/></div>`
                    );
                }
                const list = $('<ul/>');

                pathNode.append(list);
                this._renderTree(list, child, false);
                parentList.append(pathNode);
            }
        }
    }

    _renderTree(parentList, node, isRoot) {
        const sortedChildren = sortBy(node.children, 'spine');
        const spineNode = sortedChildren.find(sortedChild => sortedChild.spine === node.spine);
        const sortedChildrenNoSpine = sortedChildren.filter(c => node.spine != c.spine);

        parentList.append(this._renderLeaf(node, 'leaf'));

        if (sortedChildrenNoSpine.length == 1 && !sortedChildrenNoSpine[0].children.length) {
            parentList.append(this._renderLeaf(sortedChildrenNoSpine[0], 'node'));
        } else {
            this._renderChildren(parentList, sortedChildrenNoSpine);
        }

        if (spineNode) {
            this._renderTree(parentList, spineNode, isRoot);
        }
    }

    /**
     * Builds a list of child features which are not on the main spine.
     * @param  {Array}  acc array to accumulate results
     * @param  {node}   node initial starting point
     * @return {Array}  all children excluding children on the spine
     */
    _getAllChildren(acc, node) {
        const sortedChildren = sortBy(node.children, 'spine');
        const spineNode = sortedChildren.find(sortedChild => sortedChild.spine === node.spine);
        const sortedChildrenNoSpine = sortedChildren.filter(c => node.spine != c.spine);

        acc.push(node);

        if (sortedChildrenNoSpine.length == 1 && !sortedChildrenNoSpine[0].children.length) {
            acc.push(sortedChildrenNoSpine[0]);
        } else {
            for (const child of sortedChildrenNoSpine) {
                this._getAllChildren(acc, child);
            }
        }

        if (spineNode) {
            this._getAllChildren(acc, spineNode);
        }
        return acc;
    }

    leafHandleMouseEvent(ev) {
        ev.stopPropagation();
        const featureId = $(ev.currentTarget).parent().data('id');

        if (featureId) {
            const feature = this.options.app.currentFeatureSet.getFeatureByUrn(featureId);
            const trigger = ev.type == 'mouseenter' ? 'highlight-feature' : 'unhighlight-feature';

            this.options.app.fire(trigger, { feature: feature });
        }
    }

    branchHandleMouseEvent(ev) {
        ev.preventDefault();
        const clazz = $(ev.currentTarget).parent('li').attr('class');

        if (clazz.includes('branch')) {
            const self = this;
            const trigger = ev.type == 'mouseenter' ? 'highlight-feature' : 'unhighlight-feature';
            const children = $(ev.currentTarget).parent('li').data('children');
            children.forEach(node => {
                const feature = this.options.app.currentFeatureSet.getFeatureByUrn(
                    node.getUrn(true, true)
                );
                self.options.app.fire(trigger, { feature: feature });
            });
        }
    }

    selectFeature(ev) {
        ev.stopPropagation();
        const featureId = $(ev.currentTarget).data('id'),
            feature = this.options.app.currentFeatureSet.getFeatureByUrn(featureId);
        this.setAsCurrentFeature(feature);
        this.$el.remove(); //prevents unhighlight when in select feature view
    }

    zoomToFeature(ev) {
        ev.stopPropagation();
        const featureId = $(ev.currentTarget).parent().data('id');
        if (featureId) {
            this.options.app.map.zoomTo(featureId);
        }
    }

    zoomToBranch(ev) {
        ev.stopPropagation();
        const children = $(ev.currentTarget).parent().data('children') || [];

        if (children.length) {
            this.options.app.map.fitBoundsToFeatures(children);
        }
    }

    setAsCurrentFeature(feature) {
        if (feature.hasDetailsToPresent()) {
            this.options.app.setCurrentFeature(feature, { keepFeatureSet: true, zoomTo: true });
        } else {
            this.options.app.map.zoomTo(feature);
        }
    }
}

export default TreeView;
