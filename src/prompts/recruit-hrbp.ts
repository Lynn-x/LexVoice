// 由 main.ts 抽出的 prompt 常量（审核友好：缩小 main.ts 单文件 AST）。纯数据、零运行时依赖、零行为改动。
export const JOBPORTRAIT_SYSTEM_PROMPT = `BLANKED`;

export const JOBPORTRAIT_FOLLOWUP_RULES = {
  years:                { fallback: "这个岗位希望几年经验起步？有没有硬性年限？", priority: 5 },
  education:            { fallback: "学历是硬门槛还是参考项？最低到哪一档？", priority: 5 },
  industry:             { fallback: "一定要同行业背景吗？哪些相邻行业也能接受？", priority: 5 },
  must_have:            { fallback: "有没有一两条「没有就直接不要」的硬经验？", priority: 5 },
  salary:               { fallback: "这个岗位的薪资区间大概多少？卡在哪个范围？", priority: 5 },
  business_sense:       { fallback: "能举一个你心目中「业务感强」的人具体做对了什么的例子吗？", priority: 4 },
  resilience:           { fallback: "去年有没有一个扛住压力 / 顶住挫折的具体场景，能描述下吗？", priority: 4 },
  learning:             { fallback: "你说的学习能力，体现在哪件事上？多久上手算达标？", priority: 4 },
  values:               { fallback: "什么样的价值观 / 做事风格是你绝对不能接受的？", priority: 4 },
  communication:        { fallback: "跨部门协作时，你期待他怎么处理分歧？有反例吗？", priority: 4 },
  job_hopping:          { fallback: "对跳槽频率有没有底线？几年一跳会让你犹豫？", priority: 3 },
  education_suspicious: { fallback: "学历背景上有没有需要重点核实的点？", priority: 3 },
  dept_style:           { fallback: "团队目前是什么节奏 / 风格？什么样的人会水土不服？", priority: 2 },
  supervisor_pref:      { fallback: "作为直属上级，你更希望他主动汇报还是给结果就行？", priority: 2 },
};
