// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';

const layoutConfiguration = {
    setLayoutPreference(layoutPreference) {
        this._layoutPreference = layoutPreference || 'auto';
    },

    getLayoutName(layoutPreference) {
        return this._calculateLayoutName();
    },

    dialogVerticalPosition() {
        return this._isSmallScreen() ? 'bottom' : 'center';
    },

    _isSmallScreen() {
        return $(window).width() <= 768;
    },

    _calculateLayoutName() {
        if (['phone', 'desktop'].includes(this._layoutPreference)) {
            return this._layoutPreference;
        }
        return this._isSmallScreen() ? 'phone' : 'desktop';
    }
};

layoutConfiguration.setLayoutPreference();

export { layoutConfiguration };
