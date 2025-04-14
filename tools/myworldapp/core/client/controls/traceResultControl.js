// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control } from 'myWorld/base/control';
import { TreeView } from '../uiComponents/index';

/**
 * Control to render the title and short description of the features in the current feature set <br/>
 * Each item includes behaviour to allow the user to select and zoom to the feature
 * @name TraceResultControl
 * @constructor
 * @extends {Control}
 */
export class TraceResultControl extends Control {
    static {
        this.prototype.messageGroup = 'TracePlugin';
    }

    constructor(owner, options) {
        super(owner, options);
    }

    render() {
        this.rootBranch = this.app.currentFeatureSet.start;
        this.app.currentFeatureSet.start.buildSpine();

        const treeView = new TreeView({
            messageGroup: 'TracePlugin',
            app: this.app,
            root: this.rootBranch,
            zoomEnabled: true,
            leafRenderer(node, type) {
                if (type === 'node') {
                    return `Branch: ${node.feature.getTitle()}`;
                }
                return node.feature.getTitle();
            },
            branchRenderer(children) {
                return `Branch: ${children.length} objects`;
            }
        });
        treeView.render();
        this.tableContainer = $('<div id="#results-content-table" class="verticalScroll">')
            .append(treeView.$el)
            .scrollTop(0);

        this.$el.html(this.tableContainer);

        this._setTableHeight();
    }

    _setTableHeight() {
        const detailsTabSpace = this.$el.parent(),
            resultReportHeight = this.limitReport?.is(':visible')
                ? this.limitReport.outerHeight()
                : 0,
            navBarHeight = this.$el.siblings('.navigation-bar').outerHeight(),
            panelContentHeight = detailsTabSpace.height() - navBarHeight,
            topBarHeight = this.$el.siblings('.top').outerHeight() || 0; //Used in the phone layout

        this.tableContainer.height(panelContentHeight - resultReportHeight - topBarHeight);
    }

    invalidateSize() {
        if (this.tableContainer) this._setTableHeight();
    }

    hide() {
        this.$el.hide();
        this.undelegateEvents();
    }
}

export default TraceResultControl;
