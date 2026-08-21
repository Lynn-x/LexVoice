import { describe, expect, it } from "vitest";
import {
  inferSemanticCanvasSourcePath,
  parseSemanticCanvasSourcePath,
  resolveSemanticCanvasSourcePath,
} from "../src/canvas/source-note";

describe("语义图源纪要解析", () => {
  it("优先使用 Canvas 内嵌的源纪要路径", () => {
    expect(resolveSemanticCanvasSourcePath({
      lexvoiceSemantic: { sourcePath: "LexVoice\\转写纪要\\会议.md" },
    }, "错误 · 语义图.canvas")).toBe("LexVoice/转写纪要/会议.md");
  });

  it("旧语义图没有元数据时可从同名文件回退", () => {
    expect(inferSemanticCanvasSourcePath("LexVoice/转写纪要/会议 · 语义图.canvas"))
      .toBe("LexVoice/转写纪要/会议.md");
    expect(inferSemanticCanvasSourcePath("LexVoice/转写纪要/会议 · 语义图（紧凑预览）.canvas"))
      .toBe("LexVoice/转写纪要/会议.md");
  });

  it("损坏的 Canvas JSON 不会阻断回退解析", () => {
    expect(parseSemanticCanvasSourcePath("{bad json", "会议 · 语义图.canvas"))
      .toBe("会议.md");
  });
});
