// Copyright: IQGeo Limited 2010-2023
import { localisation, View } from 'myWorld-base';
import { layoutConfiguration } from '../base';
import syncProgressDialogHtml from 'text!./syncProgressDialog.html';

export class SyncProgressDialog extends View {
    static {
        this.prototype.messageGroup = 'SyncGui';

        this.mergeOptions({
            cancelable: true,
            dismissable: false
        });
    }

    constructor(options) {
        super(options);
        this.engine = options.engine;
        this.initUI();

        this.engine.on('task-changed', this.render, this);
        this.engine.on('task-progress', this.render, this);
    }

    initUI() {
        const translatedHtml = localisation.translateHtml('SyncGui', syncProgressDialogHtml);
        this.$el.html(translatedHtml);

        const buttons = {};

        if (this.options.cancelable)
            buttons['Cancel'] = {
                text: this.msg('cancel_btn'),
                class: 'primary-btn cancel-sync',
                click: this.cancel.bind(this)
            };
        if (this.options.dismissable)
            buttons['Hide'] = {
                text: this.msg('close_btn'),
                class: 'primary-btn cancel-sync',
                click: this.close.bind(this)
            };

        this.$el.dialog({
            modal: true,
            width: 500,
            resizable: false,
            title: this.msg('syncing_with_remote_server'),
            dialogClass: 'no-close-button',
            closeOnEscape: true,
            buttons
        });
        this.render();
    }

    /**
     * Updates the UI to match the current state of the engine
     */
    render() {
        const engine = this.engine;
        if (!engine._cancelled) this.$el.find('.cancel-message').hide();
        this.$el.dialog('open');

        if (engine.currentTaskStatusId) {
            this.$('.progress-text').html(this._getProgressTextforTask(engine.currentTaskId));
            this.$('.task-name').html(this._nameForTask(engine.currentTask));

            const showProgressBar = !!engine.currentProgress;
            if (showProgressBar) {
                this.$('.sync-progress-bar').css('width', `${engine.currentProgress}%`);
            } else {
                const messageId = `task_status_${engine.currentTaskStatusId}`;
                const statusText = this.msg(messageId, engine.currentTaskDetails);
                this.$('.sync-status').html(statusText);
            }
            this.$('.sync-status').toggleClass('hidden', showProgressBar);
            this.$('.sync-progress-container').toggleClass('hidden', !showProgressBar);
        }

        if (engine._cancelled) {
            this.$('.cancel-sync').attr('disabled', 'disabled');
            this.$el.find('.cancel-message').show();
        }

        // Makes sure the dialog is in the right position.
        // This is needed since the dialog content keeps changing and updating the dialog height.
        const verticalPos = layoutConfiguration.dialogVerticalPosition();
        this.$el.dialog('option', 'position', {
            my: 'center',
            at: verticalPos,
            of: window,
            collision: 'fit'
        });
    }

    /**
     * Close the dialog
     */
    close() {
        this.$el.dialog('close');
    }

    destroy() {
        this.engine.off('task-changed', this.render, this);
        this.engine.off('task-progress', this.render, this);
        this.$el.dialog('destroy');
    }

    _nameForTask(task) {
        if (task.type == 'download') {
            return this.msg('download_update_task', { index: task.args[0] });
        }
        if (task.type == 'applyUpdate') {
            return this.msg('apply_update_task', { index: task.args[0] });
        }
        if (task.type == 'get_shard') {
            return this.msg('get_shard_task');
        }
        if (task.type == 'export') {
            return this.msg('upload_local_changes_task');
        }
        if (task.type == 'download' || task.type == 'applyUpdate') {
            return this.msg('install_update_task', { index: task.args[0] });
        }
        if (task.type == 'rebase') {
            return this.msg('rebase_task');
        }
        if (task.type == 'code_apply') {
            return this.msg('code_apply_task');
        }
        return `Unexpected task type: ${task.type}`;
    }

    /**
     * Create a localised text that displays which task is being run and the total number of tasks
     * Eg: Running task X of Y
     * @param  {number}taskSeq   The sequence of the currently running task amongst the tasks list
     * @return {string}            Localized string indicating the progress of the sync
     */
    _getProgressTextforTask(taskSeq) {
        const totalTasks = this.engine.getCurrentTasks().length;
        return this.msg('running_task_counter', { seq: taskSeq + 1, total: totalTasks });
    }

    /**
     * Cancel button handler. The user wishes to cancel the sync.
     * Disables the cancel button, displays the cancel message and informs the owner
     * that the user wants to cancel the sync.
     * This method does not close the dialog as it needs to be open while the system
     * completes essential tasks. It is the owner's responsibility to close the
     * dialog when the sync process has finished.
     */
    cancel() {
        this.engine.cancel();
        this.render();
    }
}
