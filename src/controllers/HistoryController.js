/**
 * 历史记录控制器
 * 管理撤销/重做操作
 */
export class HistoryController {
  constructor(project, maxHistory = 50) {
    this.project = project;
    this.maxHistory = maxHistory;
    this.undoStack = [];
    this.redoStack = [];
  }

  execute(action) {
    if (action.redo) {
      action.redo();
    }
    this.undoStack.push(action);
    this.redoStack = [];
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    const action = this.undoStack.pop();
    if (action.undo) {
      action.undo();
    }
    this.redoStack.push(action);
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const action = this.redoStack.pop();
    if (action.redo) {
      action.redo();
    }
    this.undoStack.push(action);
    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }
}