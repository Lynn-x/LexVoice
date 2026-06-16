/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export const MODE_META = {
  meeting:   { prefix: "工作纪要", emoji: "📝", icon: "briefcase", label: "工作纪要", goal: "适合各种规模的工作会议：决议、待办、风险、同步同事进展。" },
  interview: { prefix: "访谈", emoji: "🎙", icon: "message-square", label: "访谈", goal: "适合外部访谈、用户调研、专家访谈，把问答转成洞察。" },
  monologue: { prefix: "个人笔记", emoji: "💭", icon: "notebook", label: "个人笔记", goal: "适合个人口述、灵感、复盘，把碎片表达整理成可用笔记。" },
  learning:  { prefix: "学习笔记", emoji: "📚", icon: "book-open", label: "学习笔记", goal: "适合 B 站、YouTube、课程、讲座、播客等高信息密度内容。" },
  seminar:   { prefix: "研讨会", emoji: "🧠", icon: "landmark", label: "研讨会", goal: "适合学术研讨、主题沙龙、圆桌论坛，把观点、争议、证据和后续问题整理清楚。" },
  recruit:   { prefix: "招聘评估", emoji: "👔", icon: "user-check", label: "招聘评估" },
  "recruit-needs": { prefix: "招聘需求挖掘", emoji: "", icon: "user-search", label: "招聘需求挖掘", goal: "HRBP 与业务方的招聘需求沟通会：会中按画像字段树辅助挖深，会后自动产出结构化岗位画像。" },
  huddle:    { prefix: "圆桌讨论", emoji: "🤝", icon: "users", label: "圆桌讨论", goal: "保留以兼容旧笔记，新建录音请改用「工作纪要」。", legacy: true },
  off:       { prefix: "录音", emoji: "🎙", icon: "mic", label: "关闭（仅转写）" },
};

export const FRONTMATTER_SCHEMA = {
  learning: `主题: <一句话主题>
来源: <B站 / YouTube / 播客 / 课程 / 讲座 / 未提及>
语言: <中文 / 英文 / 日文 / 多语种 / 未提及>`,
  interview: `主题: <一句话主题>
受访者:
  - <受访者姓名；推断不确定时写代号如 "受访者A（推断）">
访问者: <访问者姓名；未提及写 "未提及">`,
  meeting: `主题: <一句话主题>
参会人:
  - <姓名 1；不确定时用中性角色如 "业务需求方" 或写 "未提及">
  - <姓名 2>`,
  seminar: `主题: <一句话主题>
研讨对象: <理论 / 议题 / 案例 / 文本 / 项目；未提及写 "未提及">
参与者:
  - <姓名或角色；不确定时用 "发言人A（推断）" 或写 "未提及">`,
  huddle: `主题: <一句话主题>
当事人: <决策当事人；未点明写 "未提及"，不要凭一两句假设句指认>
参谋:
  - <参谋姓名或角色；不确定写 "未提及">`,
  monologue: `主题: <一句话主题>`,
  recruit: `主题: <一句话主题>
候选人: <候选人姓名；未提及写 "未提及">
联系方式: <手机号 / 邮箱 / 微信等联系方式；未提及写 "未提及">
应聘岗位: <应聘岗位；未提及写 "未提及">
轮次: <初面 / 二面 / 终面 / 复试；未提及写 "未提及">
录用建议: <强烈推荐 / 推荐 / 倾向推荐 / 倾向不推荐 / 不推荐>
一句话评价: <40 字内定调句，含 录用倾向 + 最大亮点 + 最大顾虑 三要素；即 §0.6 第五步「X，Y，尤其是 Z」定调句的压缩版>
待澄清:
  - <本场未问到 / 未覆盖、offer 前需问清的点，一条一项；没有就写空数组 []>`,
};

export const MODE_PREFIX_TO_KEY = {
  // 旧 prefix
  "访谈": "interview",
  "会议": "meeting",
  "研讨会": "seminar",
  "研讨": "seminar",
  "沙龙": "seminar",
  "小会": "huddle",
  "手记": "monologue",
  "学习": "learning",
  "面试": "recruit",
  "讨论": "huddle",
  // 新 prefix
  "工作纪要": "meeting",
  "学术研讨": "seminar",
  "主题沙龙": "seminar",
  "访谈调研": "interview",
  "个人笔记": "monologue",
  "学习记录": "learning",
  "招聘评估": "recruit",
  "圆桌讨论": "huddle",
};
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */
