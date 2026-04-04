import { describe, it, expect } from "vitest";
import { buildTree, flattenTreeWithDepth } from "@/lib/reclassification-utils";

describe("reclassification-utils - buildTree", () => {
  it("builds tree from flat nodes", () => {
    const nodes = [
      { id: "1", template_id: "t1", parent_id: null, code: "A", full_code: "A", name: "Root", sign: "positive" as const, order_index: 0, is_total: false, formula: null, description: null, created_at: "", updated_at: "" },
      { id: "2", template_id: "t1", parent_id: "1", code: "1", full_code: "A.1", name: "Child", sign: "positive" as const, order_index: 0, is_total: false, formula: null, description: null, created_at: "", updated_at: "" },
    ];
    const tree = buildTree(nodes);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe("2");
  });

  it("returns empty array for empty input", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("handles multiple roots", () => {
    const nodes = [
      { id: "1", template_id: "t1", parent_id: null, code: "A", full_code: "A", name: "Root A", sign: "positive" as const, order_index: 0, is_total: false, formula: null, description: null, created_at: "", updated_at: "" },
      { id: "2", template_id: "t1", parent_id: null, code: "B", full_code: "B", name: "Root B", sign: "negative" as const, order_index: 1, is_total: false, formula: null, description: null, created_at: "", updated_at: "" },
    ];
    const tree = buildTree(nodes);
    expect(tree).toHaveLength(2);
    expect(tree[0].id).toBe("1");
    expect(tree[1].id).toBe("2");
  });

  it("sorts children by order_index", () => {
    const nodes = [
      { id: "1", template_id: "t1", parent_id: null, code: "A", full_code: "A", name: "Root", sign: "positive" as const, order_index: 0, is_total: false, formula: null, description: null, created_at: "", updated_at: "" },
      { id: "3", template_id: "t1", parent_id: "1", code: "2", full_code: "A.2", name: "Second", sign: "positive" as const, order_index: 1, is_total: false, formula: null, description: null, created_at: "", updated_at: "" },
      { id: "2", template_id: "t1", parent_id: "1", code: "1", full_code: "A.1", name: "First", sign: "positive" as const, order_index: 0, is_total: false, formula: null, description: null, created_at: "", updated_at: "" },
    ];
    const tree = buildTree(nodes);
    expect(tree[0].children[0].name).toBe("First");
    expect(tree[0].children[1].name).toBe("Second");
  });
});

describe("reclassification-utils - flattenTreeWithDepth", () => {
  it("flattens tree with correct depth", () => {
    const nodes = [
      { id: "1", template_id: "t1", parent_id: null, code: "A", full_code: "A", name: "Root", sign: "positive" as const, order_index: 0, is_total: false, formula: null, description: null, created_at: "", updated_at: "" },
      { id: "2", template_id: "t1", parent_id: "1", code: "1", full_code: "A.1", name: "Child", sign: "positive" as const, order_index: 0, is_total: false, formula: null, description: null, created_at: "", updated_at: "" },
    ];
    const tree = buildTree(nodes);
    const expandedIds = new Set(nodes.map((n) => n.id));
    const flat = flattenTreeWithDepth(tree, expandedIds);
    expect(flat).toHaveLength(2);
    expect(flat[0].depth).toBe(0);
    expect(flat[1].depth).toBe(1);
  });
});
