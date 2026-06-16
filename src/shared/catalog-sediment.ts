/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- LexVoice's settings/data layer is intentionally dynamically typed (files use @ts-nocheck and read untyped JSON from loadData); these type-only rules yield no actionable findings here and are tracked for incremental typing */
// 由 main.ts 抽出（模块化拆解，提升工程稳定性；纯搬迁、零行为改动）。

export const SEDIMENT_GROUP_CONFIG = {
  person: {
    label: "人员",
    unit: "位",
    dest: "人员库",
    model: "judge",
    decisionModel: "judge",
    lead: "人",
    primaryButtonText: (n) => `加入人员库（${n}）`,
    secondaryButtonText: "全部忽略",
  },
  todo: {
    label: "待办",
    unit: "条",
    dest: "待办",
    model: "checkbox",
    decisionModel: "checkbox",
    defaultAllSelected: true,
    lead: "事",
    primaryButtonText: (n) => `加入待办（${n}）`,
    secondaryButtonText: "忽略未选",
  },
  card: {
    label: "学习",
    unit: "张",
    dest: "卡片库",
    model: "checkbox",
    decisionModel: "checkbox",
    defaultAllSelected: true,
    lead: "知",
    primaryButtonText: (n) => `加入卡片库（${n}）`,
    secondaryButtonText: "忽略未选",
  },
  hotword: {
    label: "热词",
    unit: "个",
    dest: "热词库",
    model: "checkbox",
    decisionModel: "checkbox",
    defaultAllSelected: true,
    lead: "词",
    primaryButtonText: (n) => `加入热词库（${n}）`,
    secondaryButtonText: "忽略未选",
  },
};

export const SEDIMENT_GROUP_ORDER = ["person", "todo", "card", "hotword"];

export const SEDIMENT_GROUP_STATUS_LABELS = {
  person: "人员建议",
  todo: "待办候选",
  card: "学习卡片",
  hotword: "转写热词",
};

export const VOCABULARY_SECTIONS = [
  { key: "people", title: "人名", desc: "仅放你明确愿意作为 ASR 提示发送的姓名或称呼；敏感人员关系请放到人员资料。", placeholder: "例如：某负责人、某专家、某候选人" },
  { key: "brands", title: "品牌/机构", desc: "公司、学校、团队、客户、供应商、社区、品牌名。", placeholder: "例如：OpenAI、阿里云百炼、硅基流动" },
  { key: "projects", title: "项目/产品", desc: "项目代号、产品名、模型名、系统名、插件名。", placeholder: "例如：LexVoice、SenseVoiceSmall、Paraformer" },
  { key: "terms", title: "行业术语", desc: "专业概念、流程、缩写、技术词、业务词。", placeholder: "例如：ASR、履约保证金、灰度发布" },
  { key: "corrections", title: "易错写法", desc: "明确写出 ASR 常见误写与标准写法。转写返回后，LexVoice 只会按这些显式规则做轻量替换。", placeholder: "例如：森斯 Voice Small => SenseVoiceSmall" },
  { key: "other", title: "其他专有名词", desc: "暂时不好归类但希望 ASR 优先识别准确的词。", placeholder: "例如：会议室名、活动名、内部简称" },
];

export const PEOPLE_DIRECTORY_TAG = "lexvoice/person";
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- end of LexVoice dynamic-typing region */
