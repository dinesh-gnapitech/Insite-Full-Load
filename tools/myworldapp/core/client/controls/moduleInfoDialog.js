// Copyright: IQGeo Limited 2010-2023
import { template } from 'underscore';
import { Dialog } from 'myWorld/uiComponents';
import { copyNodeToClipboard } from 'myWorld/base/util';

export class ModuleInfoDialog extends Dialog {
    static {
        this.prototype.template = template(
            `<div id="module-info-content">
                <% Object.entries(modules || {}).forEach(function([key,module]){ %>
                    <% if(module.version){%>
                        <h4><%- key%> <span class="module-version">(<%- module.version %>)</span></h4>
                        <% if( !module.patches.length){%>
                            <span>&nbsp;&nbsp;None</span>
                        <%}else{%>
                                <% module.patches.forEach(function(patch){ %>
                                    <div>&nbsp;&nbsp;<%- patch.patch%></div>
                                <%}) %>
                        <%}%>
                    <%}%>
                <% }) %>
                </div>`
        );

        this.mergeOptions({
            modal: true,
            autoOpen: true,
            width: 'auto',
            resizable: false,
            destroyOnClose: true,
            buttons: {
                Close: {
                    text: '{:close_btn}',
                    click() {
                        this.close();
                    }
                },
                CopyToClipboard: {
                    text: '{:copy_to_clipboard}',
                    click() {
                        copyNodeToClipboard('#module-info-content');
                    }
                }
            }
        });
    }

    constructor(moduleInfo, options) {
        super(options);

        this.moduleInfo = moduleInfo;
        this.render();
    }

    render() {
        this.options.contents = this.template({ modules: this.moduleInfo });
        super.render();
    }
}

export default ModuleInfoDialog;
