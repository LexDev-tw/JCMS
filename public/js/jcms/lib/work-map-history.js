/** 工作地圖 undo / redo 快照堆疊 */

export function createWorkMapHistory(maxDepth = 48) {
    const undoStack = [];
    const redoStack = [];

    function push(snapshot) {
        undoStack.push(snapshot);
        redoStack.length = 0;
        if (undoStack.length > maxDepth) undoStack.shift();
    }

    function undo(current) {
        if (!undoStack.length) return null;
        redoStack.push(current);
        return undoStack.pop();
    }

    function redo(current) {
        if (!redoStack.length) return null;
        undoStack.push(current);
        return redoStack.pop();
    }

    function clear() {
        undoStack.length = 0;
        redoStack.length = 0;
    }

    return {
        push,
        undo,
        redo,
        clear,
        canUndo: () => undoStack.length > 0,
        canRedo: () => redoStack.length > 0,
    };
}

export function cloneWorkMapDoc(doc) {
    return JSON.parse(JSON.stringify(doc));
}
