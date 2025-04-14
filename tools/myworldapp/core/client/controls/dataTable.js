// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { escape } from 'underscore';
import { MywClass } from 'myWorld/base/class';
import * as Browser from 'myWorld/base/browser';
import { FeatureViewer } from './feature/featureViewer';
import 'datatables.net-dt';
import 'datatables.net-scroller';
import 'datatables.net-colreorder';
import 'datatables-colresize';
import 'datatables-scrollResize';
import 'datatables-colvis';
import 'datatables-naturalSort';

export class DataTable extends MywClass {
    static {
        //Maps the database field types with column types used in dataTables
        this.prototype.typeMap = {
            double: 'num',
            integer: 'num',
            numeric: 'num',
            default: 'natural'
        };
        //In prod build the class name gets modified, so need to specify a messageGroup
        this.prototype.messageGroup = 'DataTable';
    }

    /**
     * Builds a grid with the features supplied and attaches it to the DOM element with id = gridId
     * @class Uses the [DataTables]{@link http://www.datatables.net/} javascript library to show a list of myWorld objects in a tabular/grid view
     * @constructs
     * @param  {Control}        owner       The component which is the owner of self.
     * @param  {String}             gridId      Id of the div the grid will be attached tp
     * @param  {Array<Feature>} features    features to be displayed in a grid using dataTables
     * @param  {function}           option.onFilterChange Callback for when the filter changes
     */
    constructor(owner, gridId, features, options) {
        super();
        this.app = owner.app;
        this.gridId = gridId;
        this.features = features;
        this.setOptions(options);
        this._featureViewer = new FeatureViewer(this); //ENH: have a better way to get fieldViewers

        const feature = features[0];
        const fieldsOrder = feature.getFieldsOrder();
        const fieldsDD = feature.getFieldsDD();
        this.createColumnsAndHeader(fieldsOrder, fieldsDD);
        this.dataSet = this.createDataSet(fieldsOrder, fieldsDD);
        this.buildTable();
        this.app.on('currentFeature-changed', e => {
            this._scrollToFeature(e.feature);
        });
    }

    /**
     * Uses the fields to create a columns array for DataTables and an HTML table header object for the grid
     * @param  {string[]} fieldsOrder Array of fields organized in display order
     * @param  {Object<fieldDD>}  fieldsDD    Field DD information keyed on field name
     */
    createColumnsAndHeader(fieldsOrder, fieldsDD) {
        const columns = [];
        const gridTableHeaderRow = $('<tr></tr>');
        let headerName;

        // Build the columns list and their corresponding grid header cells
        fieldsOrder.forEach(fieldName => {
            // get the field's dd
            const fieldDD = fieldsDD[fieldName];
            const baseType = fieldDD?.baseType;
            let dtType = this.typeMap[baseType] ?? this.typeMap['default'];
            if (fieldDD.unit) dtType = this.typeMap['default'];
            const columnDef = { data: fieldName, type: dtType, defaultContent: '' };

            if (baseType == 'date' || baseType == 'timestamp') {
                //date/times need a separate value for sorting which will be created when generating the dataset
                columnDef.render = { _: 'display', sort: 'iso' };
            }

            columns.push(columnDef);
            // If the field has a unit, add it to its header
            if (fieldDD) headerName = fieldDD.external_name;
            else headerName = '';

            gridTableHeaderRow.append(`<th>${headerName}</th>`);
        });
        // Prepend the column list with URN (as the hidden first column) and the Object name
        columns.unshift(
            { data: 'urn', type: this.typeMap['default'] },
            { data: 'myw_feature_title', type: 'natural' }
        );
        columns.push({ data: '-', type: this.typeMap['default'] }); // Dummy blank column to span the remaining available width

        gridTableHeaderRow.prepend(`<th>${this.msg('object')}</th>`);
        gridTableHeaderRow.prepend(`<th>${this.msg('object_urn')}</th>`);
        gridTableHeaderRow.append('<th>' + '' + '</th>'); // Dummy blank column to span the remaining available width

        this.columns = columns;
        this.tableHeader = $('<thead></thead>').append(gridTableHeaderRow);
        this.translate(this.tableHeader);
    }

    /**
     * Create a JSON array listing the features to be passed to the DataTables library
     * @param  {string[]}        fieldsOrder Order in which to display fields
     * @param  {Object<fieldDD>} fieldsDD    Field DD information keyed on field name
     * @return {Array<object>}               List of features properties
     */
    createDataSet(fieldsOrder, fieldsDD) {
        const dataSet = [];
        // Add a new element for each feature in the list.
        this.features.forEach(feature => {
            let obj = {};

            for (let i = 0; i < fieldsOrder.length; i++) {
                const fieldName = fieldsOrder[i];
                const fieldDD = fieldsDD[fieldName];

                if (fieldDD) {
                    const baseType = fieldDD.baseType;
                    const hasMapping = this.typeMap[baseType];
                    if (!feature.matchesPredicate(fieldDD.visible)) {
                        obj[fieldName] = '';
                        continue;
                    }
                    const fieldViewer = this._featureViewer.getFieldViewer(feature, fieldDD, {
                        inListView: true
                    });

                    if (baseType == 'date' || baseType == 'timestamp') {
                        const val = feature.getProperties()[fieldName];
                        //for dates to be sorted correctly we need to pass to datatables the iso string - not localised by any field viewer
                        //Dates already come as ISO strings whereas timestamps come as Date objects and need to be converted
                        obj[fieldName] = {
                            display: fieldViewer.$el.text(),
                            iso: (baseType == 'timestamp' ? val?.toISOString() : val) ?? ''
                        };
                        continue;
                    }

                    if (hasMapping) {
                        //The field has a mapping so we need the content, otherwise sorting won't work
                        //Keep the 'num' and 'date' type fields as just text
                        obj[fieldName] = fieldViewer.$el.text();
                    } else {
                        //For string sorting we can pass a html string
                        //Datatables doesn't seem to support passing elements (or jquery elements)
                        //Using outerHTML causes any event handlers to be lost
                        obj[fieldName] = fieldViewer.el.outerHTML;
                    }
                }
            }
            //Add an extra property for URN (will be hidden in the grid)
            obj['urn'] = feature.getUrn(true, true);
            obj['myw_feature_title'] = escape(feature.getTitle());
            obj['-'] = ''; // Dummy blank column data to span the remaining available width

            dataSet.push(obj);
        });

        return dataSet;
    }

    /**
     * Builds a DataTable for the features
     */
    buildTable() {
        this.gridContainer = $(`#${this.gridId}`);
        const gridTableId = `${this.gridId}-table`;
        const gridFilterId = 'grid-filter-container';

        const gridTable = $(`<table class="display" id="${gridTableId}" width="100%"></table>`);
        gridTable.prepend(this.tableHeader);
        this.gridContainer.css('height', '100%'); //Sets a height for the grid so it fills its parent container
        this.gridContainer.html(gridTable);

        // Change the error mode to thorw js errors instead of alerts.
        $.fn.dataTableExt.sErrMode = 'throw';

        this.grid = $(`#${gridTableId}`).dataTable({
            data: this.dataSet,
            columns: this.columns,
            columnDefs: [
                {
                    targets: [0],
                    visible: false,
                    searchable: false
                },
                {
                    targets: [-1],
                    bSortable: false,
                    searchable: false
                }
            ],
            fnCreatedRow: (nRow, aData, iDataIndex) => {
                $(nRow).attr('id', `${this.gridId}-${aData.urn}`);
            },
            sDom: `RC<".gridActionsLeft"<"#${gridFilterId}.left"f>><"clear">tS`,
            colVis: {
                buttonText: '',
                activate: 'click',
                sAlign: 'right',
                exclude: [0, this.columns.length - 1]
            },
            paging: false,
            sScrollY: 100, //dummy value. Height is controlled by the scrollResize plugin
            scrollResize: true,
            scrollCollapse: true,
            sScrollX: true,
            autoWidth: false,
            // We only include here the messages that are going to be shown based on the other
            // configuration options. For the full list see
            // http://datatables.net/manual/i18n
            language: {
                processing: this.msg('processing'),
                search: this.msg('filter')
            },
            order: [] // to remove the default ordering by the URN field
        });
        $(`#${gridTableId}`).DataTable().colResize.init();
        $(`#${gridFilterId} > div input`).addClass('text');
        this.gridContainer.find('.ColVis > button').attr('title', this.msg('show_hide_columns'));

        $(`#${gridTableId}`).on('search.dt', this._handleFilteredTable.bind(this));

        // To make sure that the grid-header is always aligned with the rest of the table
        this.gridContainer
            .find('.dataTables_scrollHeadInner')
            .width($(`#${gridTableId}`).width() - 17);
        this.gridContainer.find('.dataTables_scrollHeadInner').on('mousemove', () => {
            $(this).width($(`#${gridTableId}`).width());
        });

        if (Browser.android) {
            // Android native browsers don't recognize table-layout:fixed, hence we need to replace it with auto.
            $('table.dataTable').css('table-layout', 'auto !important');
        }
    }

    // method is called when fillter is applied to the table values.
    _handleFilteredTable() {
        if (this.grid) {
            const filteredList = this.grid.api().rows({ filter: 'applied' }).data().toArray(); //list of filtered rows
            let listOfFilteredUrns = filteredList.map(f => f.urn);
            if ($(`#${this.gridId}-table_filter`).find('input').val() === '')
                listOfFilteredUrns = undefined;
            this.options.onFilterChange?.(listOfFilteredUrns);
        }
        const dataLength = this.grid.fnGetData().length,
            currentDataLength = this.grid.fnSettings().fnRecordsDisplay();

        if (dataLength > currentDataLength) {
            $(`#${this.gridId}-result-report`).html(
                this.msg('result_report_outof', { count: currentDataLength, outof: dataLength })
            );
        } else {
            $(`#${this.gridId}-result-report`).html(
                this.msg('result_report', { count: dataLength })
            );
        }
    }

    _scrollToFeature(feature) {
        if (feature) {
            $(this.grid.find('tr.grid-row-selected')).removeClass('grid-row-selected');
            const filteredRows = this.grid.api().rows({ filter: 'applied' }); // available rows after appllying the filter
            const featureList = filteredRows.data(); //list of filtered rows
            const urnList = featureList.map(f => f.urn);
            if (urnList.length !== 0) {
                const featureId = feature.getUrn(true, true);
                const rowNumber = urnList.indexOf(featureId); //  number of row to scroll to
                const trDom = $(this.grid).find(
                    `#${$.escapeSelector(`${this.gridId}-${featureId}`)}`
                )[0];
                if (!this._isElementInViewport(trDom)) {
                    this._fnSettings = this._fnSettings || this.grid.fnSettings(); // we always use the same object for a table instance
                    this._fnSettings.oScroller.fnScrollToRow(rowNumber);
                }
                $(filteredRows.nodes()[rowNumber]).addClass('grid-row-selected');
            }
        }
    }

    // We don't want to scroll if the row is visible
    _isElementInViewport(trDom) {
        if (!trDom) return false;
        const tableDom = $($(this.grid).parent());
        const tableTop = tableDom.offset().top;
        const scollBodyBottom = tableTop + tableDom.height();
        const elemTop = $(trDom).offset().top;
        const elemBottom = elemTop + $(trDom).height();

        return elemTop > tableTop && elemBottom < scollBodyBottom;
    }

    clear() {
        $(`#${this.gridId}`).empty();
    }
}

export default DataTable;
