// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import View from 'myWorld/base/view';
import adHocQueryHtml from 'text!html/adHocQuery.html';
import { Predicate } from 'myWorld/base/predicate';

export class GeomClauseView extends View {
    static {
        this.prototype.messageGroup = 'QueryRow';
        this.prototype.className = 'geom-clause';
        this.prototype.geomClauseTemplate = template(
            $(adHocQueryHtml).filter('#ad-hoc-geom-clause-template').html()
        );
    }

    constructor(owner, options) {
        super(options);
        this.owner = owner;
        this.app = owner?.app;
        this.render();

        this.app.on(
            'currentFeature-changed currentFeatureSet-changed',
            this.onFeatureSetChanged.bind(this)
        );
        this.onFeatureSetChanged();
    }

    render() {
        this.$el.html(this.geomClauseTemplate({}));
        this.inWindowCheck = this.$('[name=inWindow]');
        this.inSelectionCheck = this.$('[name=inSelection]');
    }

    onFeatureSetChanged() {
        let currentFeatureGeom = this.app.currentFeature?.getGeometryInWorld('geo');

        this.polygonSelected =
            currentFeatureGeom &&
            ['polygon', 'multipolygon'].includes(currentFeatureGeom.type.toLowerCase());

        this.inSelectionCheck.prop('disabled', !this.polygonSelected);
        if (!this.polygonSelected) this.inSelectionCheck.prop('checked', false);
        this.inSelectionCheck.parent().toggleClass('inactive', !this.polygonSelected);
    }

    getValue(primaryGeom) {
        let predicate = null;
        let inWindow = this.inWindowCheck[0].checked;
        let inSelection = this.inSelectionCheck[0].checked;

        if (inWindow) {
            const bounds = this.app.map.getBounds();
            predicate = Predicate.intersects(primaryGeom, bounds);
        }

        if (inSelection) {
            const currentItems = this.app.currentFeatureSet.items;
            let selectionPredicate = null;
            for (let item of currentItems) {
                const newPredicate = Predicate.intersects(primaryGeom, item.getGeometry());
                selectionPredicate = selectionPredicate
                    ? selectionPredicate.or(newPredicate)
                    : newPredicate;
            }
            predicate = predicate ? predicate.and(selectionPredicate) : selectionPredicate;
        }

        return predicate;
    }
}
