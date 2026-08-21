import { describe, expect, it } from "vitest";
import {
  BriefingPipelineIncompleteError,
  assembleBriefingParts,
  createBriefingCheckpoint,
  createBriefingJobId,
  assessBriefingPartFidelity,
  assessBriefingPartGrounding,
  expandOversizedBriefingSegments,
  extractBriefingPartEnvelope,
  getBriefingFidelityPolicy,
  getBriefingPartTargetChars,
  normalizeBriefingPartBody,
  planBriefingParts,
  reconcileBriefingCheckpoint,
} from "../src/briefing/pipeline";
import { BriefingCheckpointStore } from "../src/briefing/checkpoint-store";

function segment(index: number, chars: number) {
  return {
    index,
    startOffsetMs: index * 60_000,
    endOffsetMs: (index + 1) * 60_000,
    text: String(index % 10).repeat(chars),
  };
}

describe("纪要整理流水线", () => {
  it("详略偏好同时控制分部体量，详细模式用更小分部保护细节", () => {
    expect(getBriefingPartTargetChars({ detailLevel: "detailed" })).toBe(14_000);
    expect(getBriefingPartTargetChars({ structureLevel: "balanced" })).toBe(20_000);
    expect(getBriefingPartTargetChars({ detailLevel: "concise" })).toBe(28_000);

    const medium = [segment(0, 14_000), segment(1, 14_000), segment(2, 14_000)];
    expect(planBriefingParts(medium, getBriefingPartTargetChars({ detailLevel: "detailed" }))).toHaveLength(3);
    expect(planBriefingParts(medium, getBriefingPartTargetChars({ detailLevel: "concise" }))).toHaveLength(2);
  });

  it("详细模式正文下限随原始转写增长，明显摘要化时要求补充", () => {
    const policy = getBriefingFidelityPolicy({ detailLevel: "detailed" });
    expect(policy.minimumOutputRatio).toBe(0.48);

    const shortDraft = assessBriefingPartFidelity(12_000, "纪要".repeat(1_500), { detailLevel: "detailed" });
    expect(shortDraft.minimumOutputChars).toBe(5_760);
    expect(shortDraft.targetOutputChars).toBe(7_440);
    expect(shortDraft.needsExpansion).toBe(true);

    const completeDraft = assessBriefingPartFidelity(12_000, "纪要".repeat(3_000), { detailLevel: "detailed" });
    expect(completeDraft.needsExpansion).toBe(false);
  });

  it("分部计划按总体量均衡，避免最后只剩很小一段", () => {
    const parts = planBriefingParts([
      segment(0, 4_000), segment(1, 4_000), segment(2, 4_000),
      segment(3, 4_000), segment(4, 4_000), segment(5, 4_000), segment(6, 2_000),
    ], 14_000);
    expect(parts).toHaveLength(2);
    expect(parts.map((part) => part.chars)).toEqual([12_000, 14_000]);
  });

  it("七十分钟约 2.6 万字的详细纪要至少保留约一半有效正文", () => {
    const source = Array.from({ length: 13 }, (_, index) => segment(index, 2_000));
    const parts = planBriefingParts(source, getBriefingPartTargetChars({ detailLevel: "detailed" }));
    const minimumTotal = parts.reduce((sum, part) => (
      sum + assessBriefingPartFidelity(part.chars, "", { detailLevel: "detailed" }).minimumOutputChars
    ), 0);
    const targetTotal = parts.reduce((sum, part) => (
      sum + assessBriefingPartFidelity(part.chars, "", { detailLevel: "detailed" }).targetOutputChars
    ), 0);

    expect(parts).toHaveLength(2);
    expect(minimumTotal).toBe(12_480);
    expect(targetTotal).toBe(16_120);
  });

  it("短会沿用原段落，普通长会按段落形成内部窗口", () => {
    const short = planBriefingParts([segment(0, 1200)], 8000);
    expect(short).toHaveLength(1);
    expect(short[0].segmentStart).toBe(0);

    const long = planBriefingParts([segment(0, 2600), segment(1, 2600), segment(2, 2600)], 5000);
    expect(long).toHaveLength(2);
    expect(long.map((part) => part.segmentStart)).toEqual([0, 1]);
    expect(long.map((part) => part.segmentEnd)).toEqual([0, 2]);
  });

  it("对数字、产品名和关键原话做确定性落地检查，防止弱模型写够长度但内容漂移", () => {
    const source = "项目使用 Quick BI，预算 120 万，覆盖 8 个部门。负责人强调“先启动后校验”，计划 3 周完成。";
    const drifted = assessBriefingPartGrounding(source, "会议讨论了平台建设、协作机制和后续安排。内容比较充分。".repeat(8));
    expect(drifted.anchors.length).toBeGreaterThanOrEqual(4);
    expect(drifted.needsRepair).toBe(true);
    expect(drifted.missingAnchors).toContain("Quick");

    const grounded = assessBriefingPartGrounding(source, "Quick BI 预算为 120 万，覆盖 8 个部门，采用先启动后校验，预计 3 周完成。");
    expect(grounded.needsRepair).toBe(false);
  });

  it("整段长音频转写会在语义边界拆成内部窗口，不把数小时文本一次塞给模型", () => {
    const text = Array.from({ length: 80 }, (_, index) => `第${index + 1}项讨论包含背景、例子和结论。`).join("\n\n");
    const expanded = expandOversizedBriefingSegments([{
      index: 0,
      startOffsetMs: 0,
      endOffsetMs: 3 * 60 * 60 * 1000,
      text: text.repeat(20),
    }], 8_000);

    expect(expanded.length).toBeGreaterThan(1);
    expect(expanded.every((item) => String(item.text).length <= 8_100)).toBe(true);
    expect(expanded[0].startOffsetMs).toBe(0);
    expect(expanded.at(-1)?.endOffsetMs).toBeLessThanOrEqual(3 * 60 * 60 * 1000);
    expect(expanded.map((item) => item.text).join("")).toContain("第80项讨论");
    expect(planBriefingParts([{
      index: 0,
      startOffsetMs: 0,
      endOffsetMs: 3 * 60 * 60 * 1000,
      text: text.repeat(20),
    }], 8_000).length).toBeGreaterThan(1);
  });

  it("同一来源和偏好生成稳定任务 ID，偏好变化会隔离旧检查点", () => {
    const segments = [segment(0, 100)];
    const first = createBriefingJobId({ segments, mode: "meeting", model: "model-a", optionsKey: "balanced" });
    const same = createBriefingJobId({ segments, mode: "meeting", model: "model-a", optionsKey: "balanced" });
    const changed = createBriefingJobId({ segments, mode: "meeting", model: "model-a", optionsKey: "detailed" });
    expect(same).toEqual(first);
    expect(changed.id).not.toBe(first.id);
  });

  it("恢复时保留已完成分部，并把中断中的分部恢复为待处理", () => {
    const segments = [segment(0, 2600), segment(1, 2600)];
    const parts = planBriefingParts(segments, 4000);
    const identity = createBriefingJobId({ segments, mode: "meeting", model: "model-a", optionsKey: "balanced" });
    const input = { ...identity, mode: "meeting", model: "model-a", parts };
    const checkpoint = createBriefingCheckpoint(input);
    checkpoint.parts[0].status = "complete";
    checkpoint.parts[0].text = "第一部分正文";
    checkpoint.parts[1].status = "running";

    const restored = reconcileBriefingCheckpoint(checkpoint, input);
    expect(restored.parts[0]).toMatchObject({ status: "complete", text: "第一部分正文" });
    expect(restored.parts[1]).toMatchObject({ status: "pending", error: "上次运行中断，等待恢复" });
  });

  it("未完成分部不能被拼装成成功纪要", () => {
    const segments = [segment(0, 2600), segment(1, 2600)];
    const parts = planBriefingParts(segments, 4000);
    const identity = createBriefingJobId({ segments, mode: "meeting", model: "model-a", optionsKey: "balanced" });
    const checkpoint = createBriefingCheckpoint({ ...identity, mode: "meeting", model: "model-a", parts });
    checkpoint.parts[0].status = "complete";
    checkpoint.parts[0].text = "第一部分正文";
    checkpoint.parts[1].status = "partial";
    checkpoint.parts[1].text = "被截断的正文";

    expect(() => assembleBriefingParts(checkpoint.parts)).toThrow(BriefingPipelineIncompleteError);
  });

  it("所有分部完成后只按时间顺序做确定性拼装", () => {
    const segments = [segment(0, 2600), segment(1, 2600)];
    const parts = planBriefingParts(segments, 4000);
    const identity = createBriefingJobId({ segments, mode: "meeting", model: "model-a", optionsKey: "balanced" });
    const checkpoint = createBriefingCheckpoint({ ...identity, mode: "meeting", model: "model-a", parts });
    checkpoint.parts[1].status = "complete";
    checkpoint.parts[1].text = "第二部分正文";
    checkpoint.parts[0].status = "complete";
    checkpoint.parts[0].text = "第一部分正文";

    expect(assembleBriefingParts(checkpoint.parts)).toBe("第一部分正文\n\n第二部分正文");
  });

  it("内部切片标题不会泄漏到最终纪要", () => {
    expect(normalizeBriefingPartBody("## 第 1 部分 · 00:00–42:00\n\n## 产品目标\n正文"))
      .toBe("## 产品目标\n正文");
    expect(normalizeBriefingPartBody("### 时间窗口 2：42:00–84:00\n\n延续讨论"))
      .toBe("延续讨论");
  });

  it("弱模型输出的裸机器标记不会进入可见纪要", () => {
    const parsed = extractBriefingPartEnvelope(`> [!abstract] 一分钟速览
> 本段讨论团队协作。
>
> lexvoice-people
> lexvoice-tags
> lexvoice-part-summary
>
> 团队确认先建立共同目标。

## 一、协作问题
正文`);

    expect(parsed.summary).toBe("团队确认先建立共同目标。");
    expect(parsed.body).not.toContain("lexvoice-");
  });

  it("多部分组装移除各自摘要与重启编号，只保留连续议题正文", () => {
    const segments = [segment(0, 2600), segment(1, 2600)];
    const parts = planBriefingParts(segments, 4000);
    const identity = createBriefingJobId({ segments, mode: "meeting", model: "model-a", optionsKey: "balanced" });
    const checkpoint = createBriefingCheckpoint({ ...identity, mode: "meeting", model: "model-a", parts });
    checkpoint.parts[0].status = "complete";
    checkpoint.parts[0].text = "> [!abstract] 一分钟速览\n> 第一段摘要\n\n## 一、产品目标\n前半段讨论\n\n> [!success] 行动\n> - [ ] 保留这项行动\n\nlexvoice-part-summary";
    checkpoint.parts[1].status = "complete";
    checkpoint.parts[1].text = "> [!abstract] 摘要\n> 第二段摘要\n\n## 一、落地路径\n后半段讨论\n\nlexvoice-tags";

    const assembled = assembleBriefingParts(checkpoint.parts);
    expect(assembled).toBe("## 产品目标\n前半段讨论\n\n> [!success] 行动\n> - [ ] 保留这项行动\n\n## 落地路径\n后半段讨论");
    expect(assembled).not.toMatch(/\[!abstract\]|lexvoice-|## 一、/);
  });

  it("协议正文与机器信息严格分离", () => {
    const parsed = extractBriefingPartEnvelope(`<!-- lexvoice-part-body-start -->
## 议题
完整正文
<!-- lexvoice-part-body-end -->
<!-- lexvoice-people: 张三 -->
<!-- lexvoice-tags: 项目/推进 -->
<!-- lexvoice-part-summary: 已明确推进路径 -->`);

    expect(parsed.body).toBe("## 议题\n完整正文");
    expect(parsed.summary).toBe("已明确推进路径");
  });

  it("长会议分段拼装后仍是一篇连续纪要", () => {
    const segments = [segment(0, 2600), segment(1, 2600)];
    const parts = planBriefingParts(segments, 4000);
    const identity = createBriefingJobId({ segments, mode: "meeting", model: "model-a", optionsKey: "balanced" });
    const checkpoint = createBriefingCheckpoint({ ...identity, mode: "meeting", model: "model-a", parts });
    checkpoint.parts[0].status = "complete";
    checkpoint.parts[0].text = "## 第 1 部分 · 00:00–01:00\n\n## 产品定位\n前半段讨论";
    checkpoint.parts[1].status = "complete";
    checkpoint.parts[1].text = "## 第 2 部分 · 01:00–02:00\n\n## 落地路径\n后半段讨论";

    const assembled = assembleBriefingParts(checkpoint.parts);
    expect(assembled).toBe("## 产品定位\n前半段讨论\n\n## 落地路径\n后半段讨论");
    expect(assembled).not.toMatch(/第\s*[12]\s*部分/);
  });

  it("检查点写入插件私有目录，并可在重启后恢复", async () => {
    const files = new Map<string, string>();
    const folders = new Set<string>([".obsidian/plugins/lexvoice"]);
    const adapter = {
      exists: async (path: string) => files.has(path) || folders.has(path),
      mkdir: async (path: string) => { folders.add(path); },
      write: async (path: string, data: string) => { files.set(path, data); },
      read: async (path: string) => {
        const value = files.get(path);
        if (value === undefined) throw new Error("missing");
        return value;
      },
      remove: async (path: string) => { files.delete(path); },
      rename: async (from: string, to: string) => {
        const value = files.get(from);
        if (value === undefined) throw new Error("missing");
        files.set(to, value);
        files.delete(from);
      },
    };
    const segments = [segment(0, 100)];
    const parts = planBriefingParts(segments, 4000);
    const identity = createBriefingJobId({ segments, mode: "meeting", model: "model-a", optionsKey: "balanced" });
    const checkpoint = createBriefingCheckpoint({ ...identity, mode: "meeting", model: "model-a", parts });
    checkpoint.parts[0].status = "complete";
    checkpoint.parts[0].text = "已付费生成的正文";
    const store = new BriefingCheckpointStore(adapter as never, ".obsidian", "lexvoice");

    await store.save(checkpoint);
    const restored = await store.load(checkpoint.id);
    expect(restored?.parts[0]).toMatchObject({ status: "complete", text: "已付费生成的正文" });

    await store.remove(checkpoint.id);
    expect(await store.load(checkpoint.id)).toBeNull();
  });
});
