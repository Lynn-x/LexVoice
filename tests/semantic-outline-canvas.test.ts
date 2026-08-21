import { describe, expect, it } from "vitest";
import type { RealtimeOutlineNode } from "../src/outline-text";
import {
  buildSemanticCanvasDocument,
  buildSemanticBranchExpansionPrompt,
  buildSemanticOutlinePrompt,
  extractSemanticSourceSections,
  getSemanticCanvasPath,
  getSemanticGenerationPolicy,
  normalizeJsonCanvasDocument,
  parseSemanticBranchExpansion,
  parseSemanticOutlineGraph,
  replaceSemanticBranch,
  stabilizeSemanticGraphKeys,
  type JsonCanvasDocument,
} from "../src/canvas/semantic-outline-canvas";

const outline: RealtimeOutlineNode[] = [
  {
    id: "rt-a",
    anchor: "[[meeting.webm|01:00]]",
    time: "01:00",
    title: "数据治理现状",
    children: ["不同部门口径不一致", "权限与标签缺少统一规则"],
  },
  {
    id: "rt-b",
    anchor: "[[meeting.webm|09:00]]",
    time: "09:00",
    title: "建设统一能力层",
    children: ["先统一数据基座", "再支持 AI 应用"],
  },
  {
    id: "rt-c",
    anchor: "[[meeting.webm|18:00]]",
    time: "18:00",
    title: "落地风险与协作安排",
    children: ["避免重复建设", "先用小范围项目验证"],
  },
];

const rawGraph = {
  core: {
    title: "从分散探索转向统一的数据与 AI 能力层",
    summary: "会议聚焦如何建立可复用的底层能力，并通过小范围验证控制风险。",
  },
  branches: [
    {
      key: "governance",
      title: "数据治理为何反复返工",
      summary: "不同部门缺少统一口径、权限和标签。",
      relation: "hierarchy",
      kind: "risk",
      importance: 3,
      sourceSections: ["sec-1"],
      evidence: ["rt-a"],
      children: [{
        key: "fragmentation-risk",
        title: "各团队独立维护形成数据孤岛",
        summary: "同一对象被多套规则重复描述，协作成本持续增加。",
        relation: "causal",
        kind: "risk",
        importance: 2,
        sourceSections: ["sec-1"],
        evidence: ["rt-a", "rt-c"],
        children: [{
          key: "overseas-pm-case",
          title: "海外 PM 招聘项目曾因上下文割裂返工",
          summary: "项目交接时没有共用候选人信息和评估口径。",
          relation: "hierarchy",
          kind: "example",
          importance: 2,
          sourceSections: ["sec-1"],
          evidence: ["rt-c"],
          children: [],
        }],
      }],
    },
    {
      key: "capability-layer",
      title: "统一能力层如何落地",
      summary: "先统一数据基座，再让 AI 应用复用同一上下文。",
      relation: "parallel",
      kind: "method",
      importance: 3,
      groupLabel: "验证机制",
      sourceSections: ["sec-2"],
      evidence: ["rt-b"],
      children: [
        {
          key: "pilot-first",
          title: "先用一个招聘项目做可逆验证",
          summary: "缩小范围后验证能力层是否真的改善交付。",
          relation: "hierarchy",
          kind: "action",
          importance: 3,
          sourceSections: ["sec-2"],
          evidence: ["rt-c"],
          children: [],
        },
        {
          key: "pilot-review",
          title: "两周后按准确率和使用反馈复盘",
          summary: "结果不达标就停止扩展，而不是继续堆功能。",
          relation: "hierarchy",
          kind: "action",
          importance: 2,
          sourceSections: ["sec-2"],
          evidence: ["rt-c"],
          children: [],
        },
        {
          key: "shared-context",
          title: "统一候选人信息与评估口径",
          summary: "试点需要让参与者使用同一份上下文，避免再次产生数据孤岛。",
          relation: "hierarchy",
          kind: "method",
          importance: 2,
          sourceSections: ["sec-2"],
          evidence: ["rt-b"],
          children: [],
        },
      ],
    },
  ],
};

const sourceSections = [
  { id: "sec-1", heading: "问题意识", level: 2, content: "各团队独立维护口径，已经形成重复建设。" },
  { id: "sec-2", heading: "小范围验证", level: 3, content: "先选择一个招聘项目进行两周验证。" },
];

describe("semantic outline graph protocol", () => {
  it("asks the model to raise the outline one semantic level instead of copying chronology", () => {
    const prompt = buildSemanticOutlinePrompt("测试会议", outline, sourceSections);
    expect(prompt.system).toContain("不是复述时间线");
    expect(prompt.system).toContain("可逐层定位内容的语义地图");
    expect(prompt.system).toContain("树不需要对称");
    expect(prompt.user).toContain("末级节点必须可以独立阅读");
    expect(prompt.user).toContain("目标约 3 条");
    expect(prompt.user).toContain("跨章节");
    expect(prompt.user).toContain("[sec-1] ## 问题意识");
    expect(prompt.user).toContain("完整纪要章节：主要内容来源");
    expect(prompt.user).toContain("[rt-a] 01:00 数据治理现状");
    expect(prompt.user).toContain("relation 描述当前节点");
    expect(prompt.system).toContain("不决定画布布局");
  });

  it("scales semantic depth and node budgets with source size", () => {
    const small = getSemanticGenerationPolicy(sourceSections);
    const large = getSemanticGenerationPolicy(Array.from({ length: 24 }, (_, index) => ({
      id: `sec-${index + 1}`,
      heading: `章节 ${index + 1}`,
      level: 2,
      content: "长会议细节".repeat(1200),
    })));
    expect(small.maxNodes).toBeLessThan(large.maxNodes);
    expect(small.maxDepth).toBeLessThan(large.maxDepth);
    expect(large.expandBranches).toBe(true);
  });

  it("parses fenced JSON and drops invalid source references recursively", () => {
    const source = {
      ...rawGraph,
      branches: [
        { ...rawGraph.branches[0], evidence: ["rt-a", "missing"], sourceSections: ["sec-1", "missing"] },
        rawGraph.branches[1],
      ],
    };
    const graph = parseSemanticOutlineGraph(`\`\`\`json\n${JSON.stringify(source)}\n\`\`\``, outline, sourceSections);
    expect(graph).not.toBeNull();
    expect(graph?.branches[0].evidence).toEqual(["rt-a"]);
    expect(graph?.branches[0].sourceSections).toEqual(["sec-1"]);
    expect(graph?.branches[0].children[0].children[0].title).toContain("海外 PM");
    expect(graph?.branches[0].kind).toBe("risk");
    expect(graph?.branches[1].relation).toBe("parallel");
  });

  it("expands and replaces one semantic branch without changing the others", () => {
    const graph = parseSemanticOutlineGraph(JSON.stringify(rawGraph), outline, sourceSections)!;
    const policy = getSemanticGenerationPolicy(sourceSections);
    const prompt = buildSemanticBranchExpansionPrompt("测试会议", graph.branches[0], sourceSections, outline, policy, true);
    expect(prompt.user).toContain("继续下钻一层");
    expect(prompt.user).toContain("当前结构");
    const expandedRaw = {
      branch: {
        ...rawGraph.branches[0],
        children: [{
          key: "new-detail",
          title: "补充的具体事实",
          summary: "补充说明。",
          relation: "hierarchy",
          kind: "evidence",
          importance: 2,
          sourceSections: ["sec-1"],
          evidence: ["rt-a"],
          children: [],
        }],
      },
    };
    const expanded = parseSemanticBranchExpansion(JSON.stringify(expandedRaw), graph.branches[0], outline, sourceSections, policy)!;
    const updated = replaceSemanticBranch(graph, graph.branches[0].key, expanded);
    expect(updated.branches[0].children[0].title).toBe("补充的具体事实");
    expect(updated.branches[1]).toEqual(graph.branches[1]);
  });

  it("rejects output without a center proposition or branches", () => {
    expect(parseSemanticOutlineGraph(JSON.stringify({ core: {}, branches: [] }), outline)).toBeNull();
  });

  it("repairs duplicate or non-English model keys without losing hierarchy", () => {
    const source = {
      core: rawGraph.core,
      branches: [{
        key: "数据治理",
        title: "数据治理",
        summary: "统一口径。",
        sourceSections: [],
        evidence: ["rt-a"],
        children: [{ key: "数据治理", title: "口径分散", summary: "需要先统一规则。", children: [] }],
      }],
    };
    const graph = parseSemanticOutlineGraph(JSON.stringify(source), outline, sourceSections);
    expect(graph?.branches).toHaveLength(1);
    expect(graph?.branches[0].children).toHaveLength(1);
    expect(graph?.branches[0].key).not.toBe(graph?.branches[0].children[0].key);
  });

  it("keeps top-level titles compact while allowing rich leaf summaries", () => {
    const richSummary = "这部分交代了讨论背景、实际案例、关键数字、双方分歧以及最后形成的行动安排。".repeat(20);
    const source = {
      core: { title: "这是一个同时塞入多个并列议题而且明显没有收束的超长中心命题标题", summary: "概览" },
      branches: [{
        key: "long-branch",
        title: "这是一个同样过长并且没有收束的一级主线标题需要被程序限制",
        summary: "概括",
        children: [{ key: "rich-leaf", title: "具体讨论", summary: richSummary, children: [] }],
      }],
    };
    const graph = parseSemanticOutlineGraph(JSON.stringify(source), outline, sourceSections);
    expect(graph?.core.title.length).toBeLessThanOrEqual(24);
    expect(graph?.branches[0].title.length).toBeLessThanOrEqual(28);
    expect(graph?.branches[0].children[0].summary.length).toBeGreaterThan(700);
  });

  it("extracts meaningful briefing sections while excluding the raw transcript", () => {
    const markdown = [
      "---",
      "mode: synthesis",
      "---",
      "<!-- lexvoice-active-version-start -->",
      "## 问题意识",
      "不同团队正在重复建设。",
      "### 关键案例",
      "海外 PM 招聘项目发生过返工。",
      "<details>",
      "<summary>原始转写</summary>",
      "## 不应进入语义图",
      "逐字内容",
      "</details>",
      "<!-- lexvoice-active-version-end -->",
    ].join("\n");
    const sections = extractSemanticSourceSections(markdown);
    expect(sections.map((section) => section.heading)).toEqual(["问题意识", "关键案例"]);
    expect(JSON.stringify(sections)).not.toContain("逐字内容");
  });
});

describe("semantic canvas generation", () => {
  it("writes a variable-depth semantic tree and evidence without hardcoded colors", () => {
    const graph = parseSemanticOutlineGraph(JSON.stringify(rawGraph), outline, sourceSections);
    expect(graph).not.toBeNull();
    const canvas = buildSemanticCanvasDocument(graph!, {
      sourcePath: "LexVoice/转写纪要/测试会议.md",
      sourceTitle: "测试会议",
      sourceSections,
    });
    const serialized = JSON.stringify(canvas);
    expect(canvas.nodes.length).toBe(9);
    expect(canvas.edges.length).toBe(5);
    expect(canvas.edges.filter((edge) => edge.label).map((edge) => edge.label)).toEqual(["导致"]);
    expect(serialized).toContain("打开原纪要");
    expect(serialized).toContain("海外 PM 招聘项目曾因上下文割裂返工");
    expect(serialized).toContain("两周后按准确率和使用反馈复盘");
    expect(serialized).not.toContain("深入阅读");
    expect(serialized).not.toContain("依据：");
    expect(serialized).not.toContain("[[meeting.webm|");
    expect(serialized).not.toContain("事实与材料");
    expect(serialized).toContain('"type":"group"');
    expect(serialized).toContain('"label":"验证机制"');
    expect(serialized).toContain('"color":"');
    const xLevels = new Set(canvas.nodes.map((node) => Number((node as { x?: number }).x)));
    expect(xLevels.size).toBeGreaterThanOrEqual(4);
    const group = canvas.nodes.find((node) => (node as { type?: string }).type === "group") as {
      x: number; y: number; width: number; height: number;
    };
    const groupedCards = canvas.nodes.filter((node) => {
      const card = node as { type?: string; x?: number; y?: number; width?: number; height?: number };
      return card.type === "text"
        && Number(card.x) >= group.x
        && Number(card.y) >= group.y
        && Number(card.x) + Number(card.width) <= group.x + group.width
        && Number(card.y) + Number(card.height) <= group.y + group.height;
    });
    expect(groupedCards).toHaveLength(3);
    expect(canvas.lexvoiceSemantic?.graph.branches).toHaveLength(2);
    expect(serialized).toContain('"sourceSections":["sec-1"]');
  });

  it("lays out generated cards without rectangle overlap", () => {
    const graph = parseSemanticOutlineGraph(JSON.stringify(rawGraph), outline, sourceSections)!;
    const canvas = buildSemanticCanvasDocument(graph, {
      sourcePath: "LexVoice/转写纪要/测试会议.md",
      sourceTitle: "测试会议",
      sourceSections,
    });
    const nodes = canvas.nodes.filter((node) => (node as { type?: string }).type === "text") as Array<{ id: string; x: number; y: number; width: number; height: number }>;
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        const overlaps = left.x < right.x + right.width
          && left.x + left.width > right.x
          && left.y < right.y + right.height
          && left.y + left.height > right.y;
        expect(overlaps, `${left.id} overlaps ${right.id}`).toBe(false);
      }
    }
  });

  it("preserves user nodes and manual positions when updating", () => {
    const graph = parseSemanticOutlineGraph(JSON.stringify(rawGraph), outline, sourceSections)!;
    const first = buildSemanticCanvasDocument(graph, {
      sourcePath: "LexVoice/转写纪要/测试会议.md",
      sourceTitle: "测试会议",
      sourceSections,
    });
    const managed = first.nodes.find((node) => String((node as { id?: string }).id).startsWith("lexvoice-semantic-node-")) as Record<string, unknown>;
    managed.x = 4321;
    managed.y = 1234;
    const userNode = { id: "user-note", type: "text", x: 50, y: 60, width: 200, height: 100, text: "我的补充" };
    const userEdge = { id: "user-edge", fromNode: "user-note", toNode: String(managed.id), label: "补充" };
    const existing: JsonCanvasDocument = {
      nodes: [...first.nodes, userNode],
      edges: [...first.edges, userEdge],
    };
    const updated = buildSemanticCanvasDocument(graph, {
      sourcePath: "LexVoice/转写纪要/测试会议.md",
      sourceTitle: "测试会议",
      sourceSections,
      existing,
    });
    const sameNode = updated.nodes.find((node) => (node as { id?: string }).id === managed.id) as Record<string, unknown>;
    expect(sameNode.x).toBe(4321);
    expect(sameNode.y).toBe(1234);
    expect(updated.nodes).toContainEqual(userNode);
    expect(updated.edges).toContainEqual(userEdge);
  });

  it("centers the core topic and balances top-level branches across both sides", () => {
    const graph = parseSemanticOutlineGraph(JSON.stringify(rawGraph), outline, sourceSections)!;
    const canvas = buildSemanticCanvasDocument(graph, {
      sourcePath: "LexVoice/转写纪要/测试会议.md",
      sourceTitle: "测试会议",
      sourceSections,
    });
    const semanticNodes = canvas.nodes.filter((node) => (node as { type?: string }).type === "text") as Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      lexvoiceSemantic?: { semanticKey?: string; layoutVersion?: number };
    }>;
    const core = semanticNodes.find((node) => node.lexvoiceSemantic?.semanticKey === "core")!;
    const branches = graph.branches.map((branch) => semanticNodes.find((node) => node.lexvoiceSemantic?.semanticKey === branch.key)!);
    expect(core.x + core.width / 2).toBe(0);
    expect(core.lexvoiceSemantic?.layoutVersion).toBe(9);
    expect(branches.some((branch) => branch.x + branch.width < core.x)).toBe(true);
    expect(branches.some((branch) => branch.x > core.x + core.width)).toBe(true);
    for (const branch of branches) {
      const edge = canvas.edges.find((candidate) => candidate.fromNode === core.id && candidate.toNode === branch.id)!;
      if (branch.x < core.x) {
        expect(edge.fromSide).toBe("left");
        expect(edge.toSide).toBe("right");
      } else {
        expect(edge.fromSide).toBe("right");
        expect(edge.toSide).toBe("left");
      }
    }
    const groupedBranch = branches.find((branch) => branch.lexvoiceSemantic?.semanticKey === "capability-layer")!;
    const group = canvas.nodes.find((node) => (node as {
      lexvoiceSemantic?: { semanticKey?: string };
    }).lexvoiceSemantic?.semanticKey === "group:capability-layer") as { x: number; width: number };
    expect(group.x + group.width).toBeLessThan(groupedBranch.x);
  });

  it("keeps compact maps directional but allows an explicit bilateral relayout", () => {
    const compactGraph = parseSemanticOutlineGraph(JSON.stringify({
      core: { title: "轻量讨论", summary: "围绕两个简单议题形成共识。" },
      branches: [
        { key: "context", title: "背景", summary: "说明现状。", children: [] },
        { key: "action", title: "行动", summary: "确认下一步。", children: [] },
      ],
    }), outline, sourceSections)!;
    const adaptive = buildSemanticCanvasDocument(compactGraph, {
      sourcePath: "LexVoice/转写纪要/轻量会议.md",
      sourceTitle: "轻量会议",
      sourceSections,
    });
    const core = adaptive.nodes.find((node) => (node as {
      lexvoiceSemantic?: { semanticKey?: string };
    }).lexvoiceSemantic?.semanticKey === "core") as { x: number; width: number };
    const branches = adaptive.nodes.filter((node) => ["context", "action"].includes(String((node as {
      lexvoiceSemantic?: { semanticKey?: string };
    }).lexvoiceSemantic?.semanticKey))) as Array<{ x: number }>;
    expect(branches.every((branch) => branch.x > core.x + core.width)).toBe(true);
    expect(adaptive.lexvoiceSemantic?.layoutMode).toBe("adaptive");

    const bilateral = buildSemanticCanvasDocument(compactGraph, {
      sourcePath: "LexVoice/转写纪要/轻量会议.md",
      sourceTitle: "轻量会议",
      sourceSections,
      layoutMode: "bilateral",
      forceRelayout: true,
    });
    const bilateralCore = bilateral.nodes.find((node) => (node as {
      lexvoiceSemantic?: { semanticKey?: string };
    }).lexvoiceSemantic?.semanticKey === "core") as { x: number; width: number };
    const bilateralBranches = bilateral.nodes.filter((node) => ["context", "action"].includes(String((node as {
      lexvoiceSemantic?: { semanticKey?: string };
    }).lexvoiceSemantic?.semanticKey))) as Array<{ x: number; width: number }>;
    expect(bilateralBranches.some((branch) => branch.x + branch.width < bilateralCore.x)).toBe(true);
    expect(bilateralBranches.some((branch) => branch.x > bilateralCore.x + bilateralCore.width)).toBe(true);
    expect(bilateral.lexvoiceSemantic?.layoutMode).toBe("bilateral");
  });

  it("packs three or more leaf siblings into a compact grid even for hierarchy relations", () => {
    const graph = parseSemanticOutlineGraph(JSON.stringify({
      core: { title: "平台能力讨论", summary: "围绕平台能力形成多项具体判断。" },
      branches: [{
        key: "platform",
        title: "平台能力",
        summary: "拆解具体能力。",
        relation: "hierarchy",
        kind: "topic",
        importance: 3,
        children: Array.from({ length: 5 }, (_, index) => ({
          key: `capability-${index + 1}`,
          title: `能力 ${index + 1}`,
          summary: "说明该能力的具体用途、适用场景和边界。",
          relation: "hierarchy",
          kind: "method",
          importance: 2,
          children: [],
        })),
      }],
    }), outline, sourceSections)!;
    const canvas = buildSemanticCanvasDocument(graph, {
      sourcePath: "LexVoice/转写纪要/能力讨论.md",
      sourceTitle: "能力讨论",
      sourceSections,
    });
    const group = canvas.nodes.find((node) => (node as {
      lexvoiceSemantic?: { semanticKey?: string };
    }).lexvoiceSemantic?.semanticKey === "group:platform") as { width: number; height: number };
    expect(group).toBeTruthy();
    expect(group.width).toBeGreaterThan(group.height);
  });

  it("keeps a meeting-sized semantic map within a readable compact footprint", () => {
    const leaf = (branchIndex: number, childIndex: number) => ({
      key: `leaf-${branchIndex}-${childIndex}`,
      title: `具体判断 ${branchIndex}-${childIndex}`,
      summary: "交代背景、关键观点、具体案例与最后形成的结论。",
      evidence: [],
      sourceSections: [],
      relation: "hierarchy" as const,
      kind: "evidence" as const,
      importance: 2 as const,
      groupLabel: "",
      children: [],
    });
    const graph = {
      core: { title: "长会议的中心命题", summary: "多条主线围绕同一命题展开。" },
      branches: Array.from({ length: 7 }, (_, branchIndex) => ({
        key: `branch-${branchIndex}`,
        title: `主线 ${branchIndex + 1}`,
        summary: "概括本条主线的核心内容。",
        evidence: [],
        sourceSections: [],
        relation: "hierarchy" as const,
        kind: "topic" as const,
        importance: 3 as const,
        groupLabel: "",
        children: Array.from({ length: 4 }, (_, childIndex) => ({
          key: `section-${branchIndex}-${childIndex}`,
          title: `分支 ${branchIndex + 1}-${childIndex + 1}`,
          summary: "这一层继续拆解讨论内容。",
          evidence: [],
          sourceSections: [],
          relation: "hierarchy" as const,
          kind: "topic" as const,
          importance: 2 as const,
          groupLabel: "",
          children: [leaf(branchIndex, childIndex)],
        })),
      })),
    };
    const canvas = buildSemanticCanvasDocument(graph, {
      sourcePath: "LexVoice/转写纪要/长会议.md",
      sourceTitle: "长会议",
      sourceSections,
    });
    const nodes = canvas.nodes.filter((node) => (node as { type?: string }).type !== "group") as Array<{
      x: number; y: number; width: number; height: number;
    }>;
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxX = Math.max(...nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...nodes.map((node) => node.y + node.height));
    const occupiedArea = nodes.reduce((sum, node) => sum + node.width * node.height, 0);
    const boundingArea = (maxX - minX) * (maxY - minY);
    expect(maxX - minX).toBeLessThan(3200);
    expect(maxY - minY).toBeLessThan(4300);
    expect(occupiedArea / boundingArea).toBeGreaterThan(0.16);
  });

  it("preserves user-edited generated card text while updating generated content", () => {
    const graph = parseSemanticOutlineGraph(JSON.stringify(rawGraph), outline, sourceSections)!;
    const first = buildSemanticCanvasDocument(graph, {
      sourcePath: "LexVoice/转写纪要/测试会议.md",
      sourceTitle: "测试会议",
      sourceSections,
    });
    const edited = first.nodes.find((node) => (node as { lexvoiceSemantic?: { semanticKey?: string } }).lexvoiceSemantic?.semanticKey === "governance") as { text: string };
    edited.text = `${edited.text}\n\n我的人工补充`;
    const changedGraph = {
      ...graph,
      branches: graph.branches.map((branch) => branch.key === "governance"
        ? { ...branch, summary: "模型生成的新摘要。" }
        : branch),
    };
    const updated = buildSemanticCanvasDocument(changedGraph, {
      sourcePath: "LexVoice/转写纪要/测试会议.md",
      sourceTitle: "测试会议",
      sourceSections,
      existing: first,
    });
    const same = updated.nodes.find((node) => (node as { lexvoiceSemantic?: { semanticKey?: string } }).lexvoiceSemantic?.semanticKey === "governance") as { text: string; lexvoiceSemantic?: { userEdited?: boolean } };
    expect(same.text).toContain("我的人工补充");
    expect(same.text).not.toContain("模型生成的新摘要");
    expect(same.lexvoiceSemantic?.userEdited).toBe(true);
  });

  it("reuses stable keys when the model slightly renames a branch", () => {
    const graph = parseSemanticOutlineGraph(JSON.stringify(rawGraph), outline, sourceSections)!;
    const renamed = {
      ...graph,
      branches: graph.branches.map((branch, index) => index === 0
        ? { ...branch, key: "new-random-key", title: "数据治理反复返工的原因" }
        : branch),
    };
    const stabilized = stabilizeSemanticGraphKeys(renamed, graph);
    expect(stabilized.branches[0].key).toBe(graph.branches[0].key);
  });

  it("reflows canvases created by an earlier layout version", () => {
    const graph = parseSemanticOutlineGraph(JSON.stringify(rawGraph), outline, sourceSections)!;
    const first = buildSemanticCanvasDocument(graph, {
      sourcePath: "LexVoice/转写纪要/测试会议.md",
      sourceTitle: "测试会议",
      sourceSections,
    });
    const legacyNode = first.nodes[0] as { x: number; text?: string };
    legacyNode.x = 4321;
    legacyNode.text = String(legacyNode.text || "").replace("lexvoice-semantic-layout:9", "lexvoice-semantic-layout:8");
    const updated = buildSemanticCanvasDocument(graph, {
      sourcePath: "LexVoice/转写纪要/测试会议.md",
      sourceTitle: "测试会议",
      sourceSections,
      existing: first,
    });
    expect((updated.nodes[0] as { x: number }).x).not.toBe(4321);
  });

  it("normalizes existing canvas documents and uses a sibling canvas path", () => {
    expect(normalizeJsonCanvasDocument({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
    expect(normalizeJsonCanvasDocument({ nodes: [] })).toBeNull();
    expect(getSemanticCanvasPath("LexVoice/转写纪要/会议.md"))
      .toBe("LexVoice/转写纪要/会议 · 语义图.canvas");
  });
});
