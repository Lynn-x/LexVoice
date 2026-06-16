/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出的 prompt 常量（审核友好：缩小 main.ts 单文件 AST）。纯数据、零运行时依赖、零行为改动。
export const SHARED_DISCIPLINE = `## §3 写作纪律
- **信息密度门槛**：每条 bullet 必须含 [事实 / 判断 / 动作 / 风险] 之一。仅描述对话过程的句子（"双方就 X 进行了讨论"）一律删除。
- **直接引用**：每节最多 1–2 句加引号，其余转述。
- **第三人称客观叙述**：用角色名或职位，避免"你/我"（独白模式除外）。
- **时效标记拿不准就降级**（保守优于乐观）。
- **不出现**：值得注意的是 / 总的来说 / 综上所述 / 综合考虑 / 显而易见 / 不难发现 / 一方面…另一方面 / 破折号。

## §4 反幻觉与反遗漏（一体两面，都是底线）
- 对话中**没出现**的人名、公司名、时间、数字一律不写；依据不足时写「未提及」或「不确定」，不要用猜测填满字段。
- 转写质量差或语义不清的段落 → 写"**此段转写质量不足，信息略**"，不硬凑。
- **任何条件性章节**（共识 / 分歧 / 话术预演 等）对话里没真实出现 → **整块跳过**，不为结构完整性编造。
- **反向同样成立**：对话中确实出现的事实、数字、判断、立场、待办、风险一律保留，不得以"概括/精炼/结构化"为名删除——**漏写和编造一样都是失真**。

## §5 严禁
- ❌ 在转写空白处补"经讨论"等填充语
- ❌ 编造未出现的角色名 / 数字 / 引用
- ❌ 把 LLM 自己的总结当作受访者/参会者的观点写入

## §6 可视化元素（按需触发，仅在对话真实出现时使用）

- **对比表**：当对话比较 2+ 选项（方案 A vs B、人选 A vs B、新旧机制对比），用 Markdown 表格——**行=维度，列=选项**。

| 维度 | 选项 A | 选项 B |
|---|---|---|
| <要素> | … | … |

- **Mermaid 流程图**：当对话含条件/流程逻辑（"如果 X 则 Y 否则 Z"、按顺序触发的多步骤决策），用 \`mermaid\` 代码块嵌入：

\`\`\`mermaid
flowchart TD
  A[起点] -->|条件1| B[结果1]
  A -->|条件2| C[结果2]
\`\`\`

- **Mermaid 饼图**：当对话出现明确占比/分配数字（如 25/25/25/15、贡献率 30%、X 占 Y%），用 \`mermaid\` 代码块嵌入：

\`\`\`mermaid
pie title <名称>
  "A" : 25
  "B" : 25
\`\`\`

**不为美观硬塞**——对话里没有真实对比/流程/占比时，**不要编造图表**。`;

export const STRUCTURE_LEVEL_INSTRUCTIONS = {
  loose: `**结构化程度：宽松**
- 以散文段落叙述为主，每个自然话题写成一段连贯的叙述
- 仅在原文本身就在分点（"第一是… 第二是…"）时才用列表
- 列表层级最多 1 级，列表项保持简洁
- 关键判断或原话用 \`> \` blockquote 引用
- 适合：闲谈、个人独白、非正式访谈`,

  balanced: `**结构化程度：均衡（默认）**
- 每个自然话题以一句话主论点起头（短散文或加粗短语）
- 主要支撑信息用列表展开，**列表层级 1–2 级**
- 列表项先写成可扫读的短句；需要展开的事实、例子和判断单独成段散文，不因篇幅压缩删减关键信息
- 关键判断或原话用 \`> \` blockquote 引用
- 议题间存在归并关系时，用一句话 cross-reference
- **不是逐字转录**：合并相邻同主题碎片，去口头禅，但保留事实和判断
- 适合：常规会议、访谈、产品评审、工作复盘`,

  strict: `**结构化程度：严谨**
- 每个话题用主论点（一句话总结）开头，可加粗
- 用嵌套列表呈现完整逻辑层级：
  - 一级要点：核心子论点
    - 二级支撑：具体事实 / 案例 / 数据 / 异议
      - 三级细节：仅必要时使用，关键事实点
- **列表层级最多 3 级**，每级要点都简洁可扫读
- 关键判断或决议另起 \`> \` blockquote 引用
- 议题间的关联用一句话点明
- **强结构化提炼**：把口语化叙述转化为论点—支撑—证据的逻辑层级，不要逐字转录
- 适合：深度复盘、战略讨论、复杂决策会议`,
};
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */
