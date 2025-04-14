// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import Backbone from 'backbone';
import pageHtml from 'text!html/phone/phone.html';

const editPageHtml = $(pageHtml).filter('#edit-page-template').html();

export class PhoneLayoutFeatureEditor extends Backbone.View {
    static {
        this.prototype.innerTemplate = template(editPageHtml);

        this.prototype.events = {
            'click [data-feature-editor-set-map-object]': 'geomMode'
        };
    }

    /*
     * @class   Page view to display a feature editor
     *
     * @param  {PhoneLayout}  owner       Owner of self
     * @extends {Backbone.View}
     * @constructs
     */
    constructor(options) {
        super(options);
        this.owner = options.owner;
        this.render();
    }

    render() {
        this.setElement(this.innerTemplate());
        //Setting the height of the conatiner to the window height
        //Need this since body tag has overflow: hidden
        $(window)
            .on('resize', () => {
                const editorHeight = $(window).height() + 10;
                this.$el.find('#feature-editor').height(editorHeight);
            })
            .trigger('resize');
    }

    /*
     * Activates the Editor's digitizing mode by hiding the fields,
     * so that the user can use the map to set a geometry
     */
    geomMode() {
        this.owner.showPage('page-map');
        this.openSetMapObjectPage();
    }

    /*
     * Opens the geom mode page (map and an instruction bar) that instructs the user to define a geometry on the map
     */
    openSetMapObjectPage() {
        if (!this.geomModePage) {
            this.geomModePage = new GeomModePage({ owner: this.owner });
        }
        this.geomModePage.render();
    }
}

const geomModePageHtml = $(pageHtml).filter('#geom-mode-page-template').html();

class GeomModePage extends Backbone.View {
    static {
        this.prototype.innerTemplate = template(geomModePageHtml);

        this.prototype.events = {
            'click .button-done': 'hide',
            'click .close-btn': 'hide'
        };
    }

    /*
     * @class   A page with the map and and an instruction bar
     *          The map is in geom mode so the user can create/edit a feature geometry
     *
     * @param  {PhoneLayout}  owner   Owner of self
     * @extends {Backbone.View}
     * @constructs
     */
    constructor(options) {
        super(options);
        this.owner = options.owner;
    }

    render() {
        const message = this.owner.detailsPage.editor.getGeomModeMsg();

        this.setElement(
            this.innerTemplate({
                title: this.owner.app.currentFeature.getTitle(),
                message: message
            })
        );
        this.owner.translate(this.$el);

        this.$el.appendTo(this.owner.$('#page-map')).show();
    }

    /*
     * Closes this page and displays the editor again
     */
    hide() {
        this.$el.remove();
        this.owner.showPage('page-edit');
    }
}

export default PhoneLayoutFeatureEditor;
