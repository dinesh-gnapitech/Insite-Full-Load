import $ from 'jquery';

const MIN_COLUMN_WIDTH = 100;

/*
 * Functionality to attach a ResizeObserver to a DOM element and auto-size it properly
 * Currently only used by fieldEditorsPanel and featureViewer
 * Elements of the grid can implement the following methods to affect layout:
 * - putInNewRow()  - if true the element starts a new row
 * - getRequiredWidth() - for the grid to determine the element should take more than 1 column
 */
const ResizableGridMixin = {
    initialize() {
        this.prevWidth = 0; //Grid's container width
        this.resizeObserver = new ResizeObserver(changes =>
            changes.forEach(change => this._handleContainerResize(change))
        );
        this.resetRegisteredGrids();
    },

    remove() {
        this.resizeObserver.disconnect();
    },

    resetRegisteredGrids() {
        this._registeredResizableGrids = [];
    },

    registerResizeableGrid(el, sizeObjects, desiredWidth = null) {
        const fields = [];
        const nodes = $(el).find('.field-name-display,.feature-edit-input,.myw-separator');

        let separatorCount = 0;
        sizeObjects.forEach((obj, index) => {
            let nodeIndex = index * 2 - separatorCount;
            let info;
            if ($(nodes[nodeIndex]).hasClass('myw-separator')) {
                separatorCount = separatorCount + 1;
                info = { els: [nodes[nodeIndex]], obj };
            } else {
                info = { els: [nodes[nodeIndex], nodes[nodeIndex + 1]], obj };
            }
            if (fields.length === 0 || (obj.putInNewRow?.() ?? true)) {
                fields.push([info]);
            } else {
                fields[fields.length - 1].push(info);
            }
        });

        //  Ensure that the desiredWidth doesn't go above the size of the window
        if (desiredWidth) {
            desiredWidth = Math.min(window.innerWidth, desiredWidth);
        }
        this._registeredResizableGrids.push({
            el,
            fields,
            desiredWidth
        });
        this.resizeObserver.observe(el);
        this._setGrid(el);
    },

    /*
     * Only re-render the table if the form width changes </br>
     * width < prevWidth - 20 is to account for the width change due to the scroll bar appearing
     * in which case we do not want to re-render
     */
    _handleContainerResize(change) {
        const width = change.borderBoxSize?.[0].inlineSize;
        if (typeof width === 'number' && (width > this.prevWidth || width < this.prevWidth - 20)) {
            this.prevWidth = width;
            this._setGrid(change.target);
        }
    },

    /*
     * Creates a grid layout according to the available width
     */
    _setGrid(tableEl) {
        //  Figure out the column count of the table where we can keep things spaced properly
        const info = this._registeredResizableGrids.find(entry => entry.el == tableEl) ?? {};
        const { fields, desiredWidth } = info;

        //  If the elements in the table required less than MIN_COLUMN_WIDTH * 2, it would cause issues with maxColumnCount becoming 0 below
        //  To fix this, we restrict the minimum width of the table here
        const availableWidth = Math.max(desiredWidth || tableEl.clientWidth, MIN_COLUMN_WIDTH * 2);

        const $tableEl = $(tableEl);
        if (desiredWidth) $tableEl.css('width', `${desiredWidth}px`);
        if (!fields) return;
        let maxColumnCount = fields.reduce((prev, cur) => Math.max(prev, cur.length * 2), 0);
        let maxColumnWidth = Math.floor(availableWidth / maxColumnCount);
        while (maxColumnWidth < MIN_COLUMN_WIDTH) {
            maxColumnCount -= 2;
            maxColumnWidth = Math.floor(availableWidth / maxColumnCount);
        }

        const newContainers = [];
        const columnWidths = [];

        fields.forEach((rowInfo, rowIndex) => {
            const newContainer = $('<div>').css('display', 'contents');
            if (rowIndex === 0) newContainer.addClass('first-row');
            if (rowIndex === fields.length - 1) newContainer.addClass('last-row');

            let widthCount = 0;
            let currentColumn = 0;
            let currentContainer = $('<div>').css('display', 'contents');
            rowInfo.forEach(cellChunk => {
                //  Push a default size
                const { obj, els } = cellChunk;
                const sizes = [null, obj.getRequiredWidth?.()];
                const colspans = [
                    sizes[0] ? Math.ceil(sizes[0] / maxColumnWidth) : 1,
                    sizes[1] ? Math.ceil(sizes[1] / maxColumnWidth) : 1
                ];
                const requiredWidth = (sizes[0] || maxColumnWidth) + (sizes[1] || maxColumnWidth);
                if (
                    currentColumn >= maxColumnCount ||
                    widthCount + requiredWidth > availableWidth
                ) {
                    newContainer.append(currentContainer);
                    currentContainer = $('<div>').css('display', 'contents');
                    widthCount = 0;
                    currentColumn = 0;
                }
                for (let i = 0; i < 2; ++i) {
                    $(els[i]).css('grid-column', `${currentColumn + 1} / span ${colspans[i]}`);
                    while (columnWidths.length < currentColumn + 1) columnWidths.push(0);
                    if (sizes[i]) {
                        columnWidths[currentColumn] = Math.max(
                            columnWidths[currentColumn],
                            sizes[i]
                        );
                    }
                    widthCount += colspans[i] * maxColumnWidth;
                    ++currentColumn;
                }
                currentContainer.append(els);
            });
            newContainer.append(currentContainer);
            newContainers.push(newContainer[0]);
            $tableEl.append(newContainer[0]);
        });

        //  We have a few empty nodes in the DOM still, remove them here
        $tableEl.children().not(newContainers).remove();

        //  Finally, re-determine grid-column for the last columns to fill the remaining space
        $tableEl.children().each(function () {
            $(this)
                .children()
                .each(function (index) {
                    $(this.children[this.childElementCount - 1]).css(
                        'grid-column-end',
                        maxColumnCount + 1
                    );
                });
        });
    }
};

export default ResizableGridMixin;
