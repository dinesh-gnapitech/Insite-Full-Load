import $ from 'jquery';
const $window = $(window);

export class DialogPositionRetainer {
    constructor(dialogBody) {
        this.$dialogBody = dialogBody;
        dialogBody.on('dialogopen', this.onDialogOpen.bind(this));
        dialogBody.on('dialogclose', this.onDialogClose.bind(this));
        dialogBody.on('dialogdrag', this.onDialogDrag.bind(this));
        this.positionRatio = { x: 0.5, y: 0.5 };
    }

    onDialogOpen() {
        this.$dialog = this.$dialogBody.parent();
        this.resizeHandler = this.onWindowResize.bind(this);
        $window.on('resize', this.resizeHandler);
        this.refreshInfo();
    }

    onDialogClose() {
        $window.off('resize', this.resizeHandler);
    }

    onDialogDrag() {
        this.refreshInfo();
    }

    isMobile() {
        return $window.width() == this.$dialog.width() + 2;
    }

    refreshInfo() {
        const availableWidth = $window.width() - this.$dialog.width();
        const availableHeight = $window.height() - this.$dialog.height();
        const position = this.$dialog.position();
        if (!this.isMobile()) {
            this.positionRatio.x = position.left / availableWidth;
        }
        this.positionRatio.y = position.top / availableHeight;
    }

    onWindowResize(event) {
        let cssToSet = {};
        if (this.isMobile()) {
            cssToSet['left'] = 0;
        } else {
            const availableWidth = $window.width() - this.$dialog.width();
            cssToSet['left'] = availableWidth * this.positionRatio.x;
        }
        const availableHeight = $window.height() - this.$dialog.height();
        cssToSet['top'] = availableHeight * this.positionRatio.y;
        this.$dialog.css(cssToSet);
        this.refreshInfo();
    }
}
