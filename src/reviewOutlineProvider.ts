import * as vscode from "vscode";

/** A single review finding produced by the LLM. */
export type ReviewItem = {
  viewpoint: string;
  level: string;
  content: string;
  targetText: string;
  replacementText: string;
  line: number;
};

/** A tree node representing either a viewpoint group or an individual review item. */
class ReviewTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly reviewItem?: ReviewItem,
  ) {
    super(label, collapsibleState);

    if (reviewItem) {
      // Leaf node: individual review item
      this.tooltip = reviewItem.content;
      this.description = reviewItem.targetText ? `「${reviewItem.targetText}」` : undefined;
      this.iconPath = new vscode.ThemeIcon(
        reviewItem.level === "error" ? "error" : reviewItem.level === "suggestion" ? "warning" : "info",
      );
      this.command = {
        command: "vscode-jp-proofreader.focusFromTree",
        title: "該当箇所にフォーカス",
        arguments: [reviewItem.line, reviewItem.targetText],
      };
    } else {
      // Parent node: viewpoint group
      this.iconPath = new vscode.ThemeIcon("list-tree");
    }
  }
}

/**
 * TreeDataProvider that displays review results grouped by viewpoint in the sidebar.
 */
export class ReviewOutlineProvider implements vscode.TreeDataProvider<ReviewTreeItem> {
  private _items: ReviewItem[] = [];
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ReviewTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ReviewTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  /** Replace the current review items and re-render the tree. */
  refresh(items: ReviewItem[]): void {
    this._items = items;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ReviewTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewTreeItem): ReviewTreeItem[] {
    if (!element) {
      // Root level: return one node per unique viewpoint
      const viewpoints = [...new Set(this._items.map((item) => item.viewpoint))];
      return viewpoints.map((vp) => new ReviewTreeItem(vp, vscode.TreeItemCollapsibleState.Expanded));
    }

    // Child level: return items belonging to this viewpoint
    const children = this._items.filter((item) => item.viewpoint === element.label);
    return children.map((item) => new ReviewTreeItem(item.content, vscode.TreeItemCollapsibleState.None, item));
  }
}
