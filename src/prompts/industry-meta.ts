/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出的 prompt 常量（审核友好：缩小 main.ts 单文件 AST）。纯数据、零运行时依赖、零行为改动。
export const INDUSTRY_META_PROMPT = `你是提示词优化专家。请基于用户的角色、工作任务和参考提示词，生成一份可直接用于 LexVoice 录音整理的自定义提示词。

【用户背景】
角色 / 行业：{{INDUSTRY}}
常见任务：
{{SCENARIOS}}
关注点：
{{FOCUS}}
输出偏好：
{{OUTPUT_PREFERENCE}}

【参考提示词】
{{MODE}}

参考提示词只用于确定大方向，不要照搬固定模板。请把 Prompt 写成适合用户真实工作的「自定义提示词」。

【生成目标】
- 只生成 1 份 Prompt，不要给多套方案。
- 这份 Prompt 会直接保存为一个可调用的提示词，用户会在录音、导入音频、重新整理时选择它。
- 输出应帮助大模型把转写内容整理成可读、可用、可复盘的 Markdown 笔记。
- 前面可以有结构化摘要、结论、待办或风险；待办 / 行动项必须使用 Markdown todo 任务语法 \`- [ ]\`，不要写成表格或普通项目符号；后面的展开部分应贴近讨论脉络，不要机械套框。
- 不要大量使用 Obsidian callout；除非非常必要，否则用普通标题、段落和列表。

【必须包含】
1. 角色定位：告诉模型它要扮演什么整理者。
2. 使用场景：说明什么录音适合用这份提示词。
3. 输出结构：给出稳定但不过度僵硬的 Markdown 结构。
4. 信息取舍：说明如何处理事实、判断、行动项、风险、引用和不确定内容；行动项必须要求输出为 \`- [ ]\` todo 任务。
5. 反幻觉要求：没有出现在转写里的内容不得编造；必要时标注不确定。
6. 语言要求：如果出现多语种内容，按用户偏好翻译或保留关键原词。
7. 最后一段必须包含原始转写占位符。

【最后一段必须原样保留】

原始转写：
{{TRANSCRIPT}}

【输出要求】
- 直接输出完整 Prompt 文本，不要代码块。
- 不要解释你为什么这样写。
- 必须保留 {{TRANSCRIPT}} 占位符。
- 不要输出“模式建议”“你可以切换到某模式”等给终端用户看的提示。`;
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */
