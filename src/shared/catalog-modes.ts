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
  learning: `BLANKED`,
  interview: `BLANKED`,
  meeting: `BLANKED`,
  seminar: `BLANKED`,
  huddle: `BLANKED`,
  monologue: `主题: <一句话主题>`,
  recruit: `BLANKED`,
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
