import {
  ItemView,
  Menu,
  Modal,
  Notice,
  TFile,
  TFolder,
  WorkspaceLeaf,
  normalizePath,
  setIcon,
} from "obsidian";

export const VIEW_TYPE_MINUTES_KANBAN = "lexvoice-minutes-kanban-view";

export type MinutesKanbanItem = {
  file: TFile;
  title: string;
  mode: string;
  modeLabel: string;
  icon: string;
  folderPath: string;
  timeLabel: string;
  durationLabel: string;
  canvasFiles: TFile[];
};

type KanbanGroupMode = "folder" | "type";

type MinutesKanbanColumn = {
  key: string;
  path: string;
  label: string;
  items: MinutesKanbanItem[];
};

export type MinutesKanbanAdapter = {
  getRootPath: () => string;
  listItems: () => MinutesKanbanItem[];
  getModeOptions: () => Array<{ value: string; label: string }>;
  moveItem: (item: MinutesKanbanItem, folderPath: string) => Promise<void>;
  createFolder: (name: string) => Promise<string>;
};

class FolderNameModal extends Modal {
  private onSubmit: (name: string) => void;

  constructor(view: MinutesKanbanView, onSubmit: (name: string) => void) {
    super(view.app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("lexvoice-kanban-folder-modal");
    this.contentEl.createEl("h3", { text: "新建分组" });
    const input = this.contentEl.createEl("input", {
      cls: "lexvoice-kanban-folder-input",
      attr: { type: "text", placeholder: "文件夹名称" },
    });
    const actions = this.contentEl.createDiv({ cls: "lexvoice-kanban-folder-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.onclick = () => this.close();
    const submit = actions.createEl("button", { cls: "mod-cta", text: "创建" });
    const commit = () => {
      const name = input.value.trim();
      if (!name) return;
      this.close();
      this.onSubmit(name);
    };
    submit.onclick = commit;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") commit();
    });
    window.setTimeout(() => input.focus(), 0);
  }
}

export class MinutesKanbanView extends ItemView {
  private adapter: MinutesKanbanAdapter;
  private query = "";
  private groupMode: KanbanGroupMode = "folder";
  private showCanvas = false;
  private expandedGroups = new Set<string>();
  private refreshTimer = 0;

  constructor(leaf: WorkspaceLeaf, adapter: MinutesKanbanAdapter) {
    super(leaf);
    this.adapter = adapter;
  }

  getViewType(): string { return VIEW_TYPE_MINUTES_KANBAN; }
  getDisplayText(): string { return "纪要看板"; }
  getIcon(): string { return "columns-3"; }

  async onOpen(): Promise<void> {
    const refresh = () => this.queueRefresh();
    this.registerEvent(this.app.vault.on("create", refresh));
    this.registerEvent(this.app.vault.on("delete", refresh));
    this.registerEvent(this.app.vault.on("rename", refresh));
    this.registerEvent(this.app.metadataCache.on("changed", refresh));
    this.render();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
  }

  private queueRefresh(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = 0;
      this.render();
    }, 160);
  }

  private getFolderColumns(items: MinutesKanbanItem[]): MinutesKanbanColumn[] {
    const root = normalizePath(this.adapter.getRootPath() || "");
    const byPath = new Map<string, MinutesKanbanColumn>();
    const add = (pathValue: string) => {
      const path = normalizePath(pathValue || "");
      if (byPath.has(path)) return;
      const relative = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
      byPath.set(path, { key: `folder:${path}`, path, label: path === root ? "未分类" : (relative || "未分类"), items: [] });
    };
    add(root);
    for (const file of this.app.vault.getAllLoadedFiles()) {
      if (!(file instanceof TFolder)) continue;
      const path = normalizePath(file.path);
      if (path && root && path.startsWith(`${root}/`) && !path.slice(root.length + 1).includes("/")) add(path);
    }
    for (const item of items) {
      add(item.folderPath || root);
      byPath.get(normalizePath(item.folderPath || root))?.items.push(item);
    }
    return Array.from(byPath.values()).sort((left, right) => {
      if (left.path === root) return -1;
      if (right.path === root) return 1;
      return left.label.localeCompare(right.label, "zh-CN");
    });
  }

  private getTypeColumns(items: MinutesKanbanItem[]): MinutesKanbanColumn[] {
    const labels = new Map(this.adapter.getModeOptions().map((option) => [option.value, option.label]));
    const byMode = new Map<string, MinutesKanbanColumn>();
    for (const item of items) {
      const mode = item.mode || "off";
      if (!byMode.has(mode)) {
        byMode.set(mode, {
          key: `type:${mode}`,
          path: "",
          label: item.modeLabel || labels.get(mode) || "其他纪要",
          items: [],
        });
      }
      byMode.get(mode)?.items.push(item);
    }
    return Array.from(byMode.values()).sort((left, right) => right.items.length - left.items.length
      || left.label.localeCompare(right.label, "zh-CN"));
  }

  private getColumns(items: MinutesKanbanItem[]): MinutesKanbanColumn[] {
    return this.groupMode === "type" ? this.getTypeColumns(items) : this.getFolderColumns(items);
  }

  private matches(item: MinutesKanbanItem): boolean {
    const query = this.query.trim().toLocaleLowerCase();
    return !query || item.title.toLocaleLowerCase().includes(query) || item.file.path.toLocaleLowerCase().includes(query);
  }

  private renderToolbar(root: HTMLElement, total: number, groupCount: number): void {
    const header = root.createDiv({ cls: "lexvoice-kanban-header" });
    const title = header.createDiv({ cls: "lexvoice-kanban-heading" });
    title.createEl("h2", { text: "纪要看板" });
    title.createSpan({ text: `${total} 篇 · ${groupCount} 个分组` });
    const actions = header.createDiv({ cls: "lexvoice-kanban-header-actions" });
    const addFolder = actions.createEl("button", {
      cls: "lexvoice-kanban-new-group",
      attr: { type: "button", title: "新建分组", "aria-label": "新建分组" },
    });
    setIcon(addFolder.createSpan(), "folder-plus");
    addFolder.createSpan({ text: "新建分组" });
    addFolder.onclick = () => new FolderNameModal(this, (name) => {
      void this.adapter.createFolder(name)
        .then(() => this.render())
        .catch((error) => new Notice(`创建失败：${error instanceof Error ? error.message : String(error)}`));
    }).open();

    const filters = root.createDiv({ cls: "lexvoice-kanban-filters" });
    const searchWrap = filters.createDiv({ cls: "lexvoice-kanban-search" });
    setIcon(searchWrap.createSpan(), "search");
    const search = searchWrap.createEl("input", { attr: { type: "search", placeholder: "搜索纪要" } });
    search.value = this.query;
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderBoard(root);
    });
    const grouping = filters.createDiv({ cls: "lexvoice-kanban-grouping", attr: { "aria-label": "分组方式" } });
    grouping.createSpan({ cls: "lexvoice-kanban-grouping-label", text: "分组" });
    for (const option of [
      { value: "folder" as const, label: "文件夹" },
      { value: "type" as const, label: "类型" },
    ]) {
      const button = grouping.createEl("button", {
        cls: `lexvoice-kanban-grouping-option${this.groupMode === option.value ? " is-active" : ""}`,
        text: option.label,
        attr: { type: "button", "aria-pressed": String(this.groupMode === option.value) },
      });
      button.onclick = () => {
        if (this.groupMode === option.value) return;
        this.groupMode = option.value;
        this.render();
      };
    }
    const canvasToggle = filters.createEl("button", {
      cls: `lexvoice-kanban-toggle${this.showCanvas ? " is-active" : ""}`,
      attr: { type: "button", role: "switch", "aria-checked": String(this.showCanvas) },
    });
    canvasToggle.createSpan({ text: "语义图" });
    const toggleTrack = canvasToggle.createSpan({ cls: "lexvoice-kanban-toggle-track" });
    toggleTrack.createSpan({ cls: "lexvoice-kanban-toggle-knob" });
    canvasToggle.onclick = () => { this.showCanvas = !this.showCanvas; this.render(); };
    filters.createSpan({
      cls: "lexvoice-kanban-hint",
      text: this.groupMode === "folder" ? "拖动卡片可换分组" : "按模板类型归类",
    });
  }

  private renderCard(parent: HTMLElement, item: MinutesKanbanItem): void {
    const card = parent.createDiv({ cls: "lexvoice-kanban-card", attr: { draggable: "true", title: item.file.path } });
    const icon = card.createSpan({ cls: "lexvoice-kanban-card-icon" });
    setIcon(icon, item.icon || "file-text");
    const content = card.createSpan({ cls: "lexvoice-kanban-card-content" });
    content.createSpan({ cls: "lexvoice-kanban-card-title", text: item.title || item.file.basename });
    content.createSpan({
      cls: "lexvoice-kanban-card-meta",
      text: this.groupMode === "type"
        ? [item.timeLabel, this.getFolderLabel(item), item.durationLabel].filter(Boolean).join(" · ")
        : [item.timeLabel, item.modeLabel, item.durationLabel].filter(Boolean).join(" · "),
    });
    card.addEventListener("click", () => { void this.app.workspace.getLeaf(false).openFile(item.file); });
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/x-lexvoice-note", item.file.path);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      card.addClass("is-dragging");
    });
    card.addEventListener("dragend", () => card.removeClass("is-dragging"));
    if (!this.showCanvas) return;
    for (const canvasFile of item.canvasFiles) {
      const canvasCard = parent.createDiv({ cls: "lexvoice-kanban-card is-canvas", attr: { title: canvasFile.path } });
      const canvasIcon = canvasCard.createSpan({ cls: "lexvoice-kanban-card-icon" });
      setIcon(canvasIcon, "layout-dashboard");
      const canvasContent = canvasCard.createSpan({ cls: "lexvoice-kanban-card-content" });
      canvasContent.createSpan({ cls: "lexvoice-kanban-card-title", text: item.title || canvasFile.basename });
      canvasContent.createSpan({ cls: "lexvoice-kanban-card-meta", text: "语义图" });
      canvasCard.addEventListener("click", () => { void this.app.workspace.getLeaf(false).openFile(canvasFile); });
    }
  }

  private getFolderLabel(item: MinutesKanbanItem): string {
    const root = normalizePath(this.adapter.getRootPath() || "");
    const path = normalizePath(item.folderPath || root);
    if (!path || path === root) return "未分类";
    return root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
  }

  private renderBoard(container: HTMLElement): void {
    const existing = container.querySelector(".lexvoice-kanban-board");
    if (existing) existing.remove();
    const items = this.adapter.listItems();
    const itemByPath = new Map(items.map((item) => [normalizePath(item.file.path), item]));
    const board = container.createDiv({ cls: "lexvoice-kanban-board" });
    for (const column of this.getColumns(items)) {
      const visible = column.items.filter((item) => this.matches(item));
      if (this.groupMode === "type" && !visible.length) continue;
      const columnEl = board.createDiv({ cls: "lexvoice-kanban-column", attr: { "data-folder": column.path } });
      const head = columnEl.createDiv({ cls: "lexvoice-kanban-column-head" });
      const label = head.createDiv({ cls: "lexvoice-kanban-column-label" });
      label.createSpan({ text: column.label });
      head.createSpan({ cls: "lexvoice-kanban-column-count", text: String(visible.length) });
      const menu = head.createEl("button", {
        cls: "clickable-icon lexvoice-kanban-column-menu",
        attr: { type: "button", title: "分组菜单", "aria-label": `${column.label}分组菜单` },
      });
      setIcon(menu, "more-horizontal");
      menu.onclick = (event) => {
        event.stopPropagation();
        const contextMenu = new Menu();
        if (this.expandedGroups.has(column.key)) {
          contextMenu.addItem((item) => item
            .setTitle("收起分组")
            .setIcon("list-collapse")
            .onClick(() => {
              this.expandedGroups.delete(column.key);
              this.renderBoard(container);
            }));
        } else {
          contextMenu.addItem((item) => item
            .setTitle("展开全部")
            .setIcon("list-tree")
            .setDisabled(visible.length <= 6)
            .onClick(() => {
              this.expandedGroups.add(column.key);
              this.renderBoard(container);
            }));
        }
        contextMenu.showAtMouseEvent(event);
      };
      const cards = columnEl.createDiv({ cls: "lexvoice-kanban-cards" });
      const isExpanded = this.expandedGroups.has(column.key);
      const shown = isExpanded ? visible : visible.slice(0, 6);
      for (const item of shown) this.renderCard(cards, item);
      if (visible.length > shown.length) {
        const more = cards.createEl("button", {
          cls: "lexvoice-kanban-more",
          attr: { type: "button" },
        });
        more.createSpan({ text: `还有 ${visible.length - shown.length} 篇` });
        setIcon(more.createSpan(), "chevron-down");
        more.onclick = () => {
          this.expandedGroups.add(column.key);
          this.renderBoard(container);
        };
      } else if (isExpanded && visible.length > 6) {
        const less = cards.createEl("button", {
          cls: "lexvoice-kanban-more",
          attr: { type: "button" },
        });
        less.createSpan({ text: "收起" });
        setIcon(less.createSpan(), "chevron-up");
        less.onclick = () => {
          this.expandedGroups.delete(column.key);
          this.renderBoard(container);
        };
      }
      if (!visible.length) cards.createDiv({ cls: "lexvoice-kanban-empty", text: "拖入纪要" });
      columnEl.addEventListener("dragover", (event) => {
        if (this.groupMode !== "folder") return;
        if (!event.dataTransfer?.types.includes("text/x-lexvoice-note")) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        columnEl.addClass("is-drop-target");
      });
      columnEl.addEventListener("dragleave", (event) => {
        if (!columnEl.contains(event.relatedTarget as Node | null)) columnEl.removeClass("is-drop-target");
      });
      columnEl.addEventListener("drop", (event) => {
        if (this.groupMode !== "folder") return;
        event.preventDefault();
        columnEl.removeClass("is-drop-target");
        const path = normalizePath(event.dataTransfer?.getData("text/x-lexvoice-note") || "");
        const item = itemByPath.get(path);
        if (!item) return;
        void this.adapter.moveItem(item, column.path)
          .then(() => this.render())
          .catch((error) => new Notice(`移动失败：${error instanceof Error ? error.message : String(error)}`));
      });
    }
  }

  private render(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    if (!root) return;
    root.empty();
    root.addClass("lexvoice-kanban-view");
    const items = this.adapter.listItems();
    this.renderToolbar(root, items.length, this.getColumns(items).length);
    this.renderBoard(root);
  }
}
