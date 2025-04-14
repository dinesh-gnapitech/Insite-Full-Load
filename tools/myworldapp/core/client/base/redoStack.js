// Copyright: IQGeo Limited 2010-2023
/**
 * Represents a stack for storing items and retrieving previous/next items
 * @constructor
 */
export class RedoStack {
    constructor() {
        this.stack = [];
        this.currentStackIndex = -1;
    }

    empty() {
        this.stack = [];
        this.currentStackIndex = -1;
    }
    current() {
        return this.stack[this.currentStackIndex];
    }
    previous() {
        return this.stack[this.currentStackIndex - 1];
    }
    unDo() {
        if (!this.hasUnDo()) return;
        this.currentStackIndex--;
        return this.stack[this.currentStackIndex];
    }
    reDo() {
        if (!this.hasReDo()) return;
        this.currentStackIndex++;
        return this.stack[this.currentStackIndex];
    }
    //push the item in the stack after altering the stack according to the current item being browsed.
    push(element) {
        if (this.stack.length - 1 != this.currentStackIndex) {
            this.stack = this.stack.splice(0, this.currentStackIndex + 1);
        }
        this.stack.push(element);
        this.currentStackIndex = this.stack.length - 1;
        return this.stack;
    }
    //discards elements starting from the 'currentStackIndex' up till the end of the stack
    pop() {
        this.stack = this.stack.splice(0, this.currentStackIndex);
        return this.stack;
    }
    hasReDo() {
        if (this.currentStackIndex + 1 === this.stack.length) {
            return false;
        } else {
            return true;
        }
    }

    hasUnDo() {
        return this.currentStackIndex > 0;
    }
}

export default RedoStack;
