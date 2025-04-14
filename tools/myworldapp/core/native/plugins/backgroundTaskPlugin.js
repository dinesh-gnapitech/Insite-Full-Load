// Copyright: IQGeo Limited 2010-2023
import { Plugin, trace as mywTrace } from 'myWorld-client';
const trace = mywTrace('backgroundTasks');

/**
 * @class Provides a platform plugin to schedule background tasks using the cordova BackgroundFetch plugin.
 * These tasks will run only when the app is in the background. To register code to run when the background task fires,
 * listen for the 'background-task-active' event on the application.
 * refer to https://github.com/transistorsoft/cordova-plugin-background-fetch
 * @extends {Plugin}
 */
export class BackgroundTaskPlugin extends Plugin {
    static forOnlineApp = false;

    static {
        this.mergeOptions({
            minimumFetchInterval: 15 // Mobile background tasks are limited to 15 minutes or greater
        });
    }

    /**
     * @param  {Application} owner The application
     * @param  {object} options
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);

        this.backgroundFetch = window.BackgroundFetch; // window.BackgroundFetch is only available on mobile
        this.startBackgroundTask(this.options); // okay to call without await
    }

    /**
     * Starts the background task
     * @param {number} options.minimumTaskInterval The minimum interval in minutes for the background task to fire
     * @returns {Promise<void>}
     */
    async startBackgroundTask({ minimumTaskInterval = 15 }) {
        // When running on iOS or Android, use the native backgroundFetch plugin
        if (this.backgroundFetch) {
            const status = await this.backgroundFetch.configure(
                {
                    minimumFetchInterval: minimumTaskInterval // This is not guaranteed to be the actual interval
                },
                async taskId => {
                    trace(5, `Native background task fired: ${taskId}`);
                    this.app.fire('background-task-active');
                    // Must call finish to signal to the OS that the task is complete
                    this.backgroundFetch.finish(taskId);
                },
                async taskId => {
                    // This callback is called when the background task takes too long to complete
                    trace(5, `Native background task timeout: ${taskId}`);
                    this.app.fire('background-task-timeout');
                    this.backgroundFetch.finish(taskId);
                }
            );

            trace(5, `Native background task status: ${status}`);
            this.app.fire('background-task-enabled');

            return;
        }
    }
}
