import { MywClass } from 'myWorld/base/class';
import { trace as mywTrace } from 'myWorld/base/trace';
import { EventsMixin } from 'myWorld/base/eventsMixin';

const trace = mywTrace('tasks');

const Priority = {
    LOW: -1,
    NORMAL: 0,
    HIGH: 1
};

/**
 * @class Class to queue, manage and throttle different requests. Primarily used to limit simultaneous server requests
 * @param  {object} options Options to pass into this class
 * @constructs
 * @extends MywClass
 * @mixes EventsMixin
 */
export class TaskManager extends MywClass {
    /**
     * Task configuration to be used by TaskManager
     * @typedef taskOptions
     * @property {string}  [id]  ID for the task, will be automatically set if not defined. pending tasks with same id get cancelled (won't be executed)
     * @property {TaskManager.Priority|Number}     [priority]    The priority of the task. Defaults to Priority.NORMAL if not set. Can also be an arbitrary number
     */
    static Priority = Priority;
    static {
        //add mixins
        this.include(EventsMixin);
        //set default (shared) options
        this.prototype.options = {
            maxConcurrentTasks: 4
        };
    }

    constructor(options) {
        super();

        this.setOptions(options);

        //  The list of tasks that are currently running, cannot be managed
        this.activeTasks = [];

        //  The list of tasks that are currently queued up to run, can be managed
        this.queuedTasks = [];

        //  Variable to hold the next task ID when one isn't provided
        this._autoIDVal = 0;

        //  Number of calls to pause. Acts as a semaphore
        this._pausedCounter = 0;
    }

    /**
     * Adds a task to run and wraps it in a promise. Will re-use an already created promise if a task is overridden
     * @param {function}    task   The task to run
     * @param {taskOptions} [options]
     * @return {Promise}
     */
    addTask(task, options = {}) {
        if (typeof task !== 'function') {
            throw new Error('request must be a function');
        }
        const { id = this._autoID(), priority = Priority.NORMAL } = options;

        let taskObj = this.cancelTask(id);

        if (taskObj) {
            taskObj.task = task;
            taskObj.priority = priority;
        } else {
            taskObj = {
                id,
                task,
                priority
            };
            taskObj.promise = new Promise((resolve, reject) => {
                taskObj.resolve = resolve;
                taskObj.reject = reject;
            });
        }

        this.queuedTasks.push(taskObj);
        if (!this._pausedCounter) {
            this._processTasks();
        }
        return taskObj.promise;
    }

    /**
     * Returns whether or not a task with the given ID is queued
     * @param {String} id
     * @return {Boolean}
     */
    taskIsQueued(id) {
        return this._taskIDIndex(id) >= 0;
    }

    /**
     * Cancels a task with the given ID if one is queued. Will not be able to cancel active tasks
     * Corresponding promise will not resolve
     * @param {String|number} id
     * @return {object}
     */
    cancelTask(id) {
        const taskIndex = this._taskIDIndex(id);
        if (taskIndex >= 0) {
            return this.queuedTasks.splice(taskIndex, 1)[0];
        }
    }

    /**
     * Returns the index of the task with the given ID, -1 if not present
     * @param {String|number} id
     * @return {Number}
     */
    _taskIDIndex(id) {
        return this.queuedTasks.findIndex(task => task.id === id);
    }

    /**
     * Runs queued tasks until there are no more queued or the number of active tasks equals the maxConcurrentTasks option.
     * Will prioritise tasks with a higher priority value
     */
    _processTasks() {
        const tasksToFetch = Math.min(
            this.options.maxConcurrentTasks - this.activeTasks.length,
            this.queuedTasks.length
        );
        if (tasksToFetch)
            trace(
                6,
                `active:${this.activeTasks.length}, queued: ${this.queuedTasks.length}, toRun: ${tasksToFetch}`
            );
        this.queuedTasks.sort((a, b) => b.priority - a.priority);
        for (let i = 0; i < tasksToFetch; ++i) {
            const nextTask = this.queuedTasks.shift();
            //  Function promises are a simple try / catch wrapper
            trace(9, `Starting task: ${nextTask.id}`);
            nextTask
                .task()
                .then(result => {
                    nextTask.resolve(result);
                    this.fire('task-complete', { id: nextTask.id, result });
                    return result;
                })
                .catch(error => {
                    nextTask.reject(error);
                    this.fire('task-incomplete', { id: nextTask.id, error });
                })
                .finally(() => {
                    this.activeTasks = this.activeTasks.filter(
                        activeTask => activeTask != nextTask
                    );
                    this._processTasks();
                });
            this.activeTasks.push(nextTask);
        }
        if (this.queuedTasks.length)
            trace(
                3,
                `Delaying execution of ${this.queuedTasks.length} tasks due to maxConcurrentTasks limit (${this.options.maxConcurrentTasks})`
            );
    }

    /**
     * Increments the pause counter
     */
    pause() {
        ++this._pausedCounter;
    }

    /**
     * Decrements the pause counter, ensuring it won't go below zero.
     * If the counter becomes zero, processes queued tasks
     */
    resume() {
        this._pausedCounter = Math.max(0, --this._pausedCounter);
        if (!this._pausedCounter) {
            this._processTasks();
        }
    }

    /**
     * Increments the auto ID variable and returns it. Used to auto-generate IDs for tasks
     */
    _autoID() {
        return ++this._autoIDVal;
    }
}
