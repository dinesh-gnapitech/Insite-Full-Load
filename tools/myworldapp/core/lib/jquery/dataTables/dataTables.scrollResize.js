/*!
   Copyright 2015 SpryMedia Ltd.

 License      MIT - http://datatables.net/license/mit

 This feature plug-in for DataTables will automatically change the DataTables
 page length in order to fit inside its container. This can be particularly
 useful for control panels and other interfaces which resize dynamically with
 the user's browser window instead of scrolling.

 Page resizing in DataTables can be enabled by using any one of the following
 options:

 * Setting the `scrollResize` parameter in the DataTables initialisation to
   be true - i.e. `scrollResize: true`
 * Setting the `scrollResize` parameter to be true in the DataTables
   defaults (thus causing all tables to have this feature) - i.e.
   `$.fn.dataTable.defaults.scrollResize = true`.
 * Creating a new instance: `new $.fn.dataTable.ScrollResize( table );` where
   `table` is a DataTable's API instance.
 ScrollResize for DataTables v1.0.0
 2015 SpryMedia Ltd - datatables.net/license
*/
(function (a) {
    'function' === typeof define && define.amd
        ? define(['jquery', 'datatables.net'], function (e) {
              return a(e, window, document);
          })
        : 'object' === typeof exports
        ? (module.exports = function (e, f) {
              e || (e = window);
              (f && f.fn.dataTable) || (f = require('datatables.net')(e, f).$);
              return a(f, e, e.document);
          })
        : a(jQuery, window, document);
})(function (a, e, f, n) {
    var k = function (c) {
        var d = this,
            b = c.table();
        this.s = {
            dt: c,
            host: a(b.container()).parent(),
            header: a(b.header()),
            footer: a(b.footer()),
            body: a(b.body()),
            container: a(b.container()),
            table: a(b.node())
        };
        b = this.s.host;
        'static' === b.css('position') && b.css('position', 'relative');
        c.on('draw', function () {
            d._size();
        });
        this._attach();
        this._size();
    };
    k.prototype = {
        _size: function () {
            var c = this.s,
                d = c.dt.table(),
                b = a(c.table).offset().top,
                g = c.host.height(),
                h = a('div.dataTables_scrollBody', d.container());
            g = g - b - (c.container.height() - (b + h.height()));
            a('div.dataTables_scrollBody', d.container()).css({ maxHeight: g, height: g });
        },
        _attach: function () {
            var c = this,
                d = a('<iframe/>')
                    .css({
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        width: '100%',
                        zIndex: -1,
                        border: 0
                    })
                    .attr('frameBorder', '0')
                    .attr('src', 'about:blank');
            d[0].onload = function () {
                var b = this.contentDocument.body,
                    g = b.offsetHeight,
                    h = this.contentDocument;
                (h.defaultView || h.parentWindow).onresize = function () {
                    var l = b.clientHeight || b.offsetHeight,
                        m = h.documentElement.clientHeight;
                    !l && m && (l = m);
                    l !== g && ((g = l), c._size());
                };
            };
            d.appendTo(this.s.host).attr('data', 'about:blank');
        }
    };
    a.fn.dataTable.ScrollResize = k;
    a.fn.DataTable.ScrollResize = k;
    a(f).on('init.dt', function (c, d) {
        'dt' === c.namespace &&
            ((c = new a.fn.dataTable.Api(d)),
            (d.oInit.scrollResize || a.fn.dataTable.defaults.scrollResize) && new k(c));
    });
});
