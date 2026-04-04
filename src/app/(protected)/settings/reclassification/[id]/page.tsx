"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, Plus, ChevronsDownUp, Download, Upload, Lock } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { NodeTree } from "@/components/settings/reclassification/node-tree";
import { NodeDetailForm } from "@/components/settings/reclassification/node-detail-form";
import { buildTree, flattenTreeWithDepth } from "@/lib/reclassification-utils";
import { exportToExcel, exportToJson } from "@/lib/reclassification-export";
import {
  updateTemplateAction,
  createNodeAction,
  reorderNodesAction,
  moveNodeAction,
} from "@/app/actions/reclassification";
import type {
  ReclassificationTemplate,
  ReclassificationNode,
  ReclassificationNodeWithChildren,
  ReclassificationNodeSign,
  ReclassificationNodeRef,
} from "@/types/supabase";

export default function TemplateEditorPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const templateId = params.id as string;

  const [authorized, setAuthorized] = useState(false);
  const [isAccountant, setIsAccountant] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [template, setTemplate] = useState<ReclassificationTemplate | null>(null);
  const [nodes, setNodes] = useState<ReclassificationNode[]>([]);
  const [baseNodes, setBaseNodes] = useState<ReclassificationNode[]>([]);
  const [nodeRefs, setNodeRefs] = useState<ReclassificationNodeRef[]>([]);
  const [tree, setTree] = useState<ReclassificationNodeWithChildren[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Template edit state
  const [editingName, setEditingName] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // New node dialog state
  const [newNodeOpen, setNewNodeOpen] = useState(false);
  const [newNodeParentId, setNewNodeParentId] = useState<string | null>(null);
  const [newNodeCode, setNewNodeCode] = useState("");
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeSign, setNewNodeSign] = useState<ReclassificationNodeSign>("positive");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mobile sheet for node detail
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Check if mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Auth check
  useEffect(() => {
    async function init() {
      const res = await fetch("/api/user-info");
      const data = await res.json();
      const roles: string[] = data.roles ?? [];

      if (
        !roles.includes("accountant") &&
        !roles.includes("user_manager") &&
        !roles.includes("superadmin")
      ) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
      setIsAccountant(roles.includes("accountant"));
      setIsSuperadmin(roles.includes("superadmin"));
      setOrgId(data.profile?.organization_id ?? null);
    }
    init();
  }, [router]);

  // Load template and nodes
  const loadData = useCallback(async () => {
    if (!orgId && !isSuperadmin) return;

    const templateParams = new URLSearchParams();
    if (orgId) templateParams.set("orgId", orgId);
    if (isSuperadmin) templateParams.set("includeSystem", "true");

    const [templatesRes, nodesRes, refsRes] = await Promise.all([
      fetch(`/api/reclassification-templates?${templateParams}`),
      fetch(`/api/reclassification-nodes?templateId=${templateId}`),
      fetch(`/api/reclassification-node-refs?templateId=${templateId}`),
    ]);

    const templatesData = await templatesRes.json();
    const nodesData = await nodesRes.json();
    const refsData = await refsRes.json();
    setNodeRefs(refsData.refs ?? []);

    const tmpl = (templatesData.templates ?? []).find(
      (t: ReclassificationTemplate) => t.id === templateId
    );

    if (!tmpl) {
      router.push("/settings/reclassification");
      return;
    }

    setTemplate(tmpl);
    setTemplateName(tmpl.name);

    const nodeList: ReclassificationNode[] = nodesData.nodes ?? [];
    setNodes(nodeList);

    // If this is NOT the base schema, also fetch nodes from the base schema
    if (!tmpl.is_base && !tmpl.is_template) {
      const baseTemplate = (templatesData.templates ?? []).find(
        (t: ReclassificationTemplate) => t.is_base && !t.is_template
      );
      if (baseTemplate) {
        const baseNodesRes = await fetch(`/api/reclassification-nodes?templateId=${baseTemplate.id}`);
        const baseNodesData = await baseNodesRes.json();
        setBaseNodes(baseNodesData.nodes ?? []);
      } else {
        setBaseNodes([]);
      }
    } else {
      setBaseNodes([]);
    }

    const treeData = buildTree(nodeList);
    setTree(treeData);

    // Expand all nodes by default on first load
    if (expandedIds.size === 0 && nodeList.length > 0) {
      setExpandedIds(new Set(nodeList.map((n) => n.id)));
    }

    setLoading(false);
  }, [orgId, isSuperadmin, templateId, router]);

  useEffect(() => {
    if (orgId || isSuperadmin) loadData();
  }, [orgId, isSuperadmin, loadData]);

  // Tree search
  const [treeSearch, setTreeSearch] = useState("");

  // Handlers
  function handleExpandAll() {
    setExpandedIds(new Set(nodes.map((n) => n.id)));
  }

  function handleCollapseAll() {
    setExpandedIds(new Set());
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only when tree panel is focused (not in input/textarea)
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const visibleNodes = flattenTreeWithDepth(tree, expandedIds);
      if (visibleNodes.length === 0) return;

      const currentIndex = selectedNodeId
        ? visibleNodes.findIndex((n) => n.id === selectedNodeId)
        : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(currentIndex + 1, visibleNodes.length - 1);
        setSelectedNodeId(visibleNodes[next].id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(currentIndex - 1, 0);
        setSelectedNodeId(visibleNodes[prev].id);
      } else if (e.key === "ArrowRight" && selectedNodeId) {
        e.preventDefault();
        setExpandedIds((prev) => new Set([...prev, selectedNodeId]));
      } else if (e.key === "ArrowLeft" && selectedNodeId) {
        e.preventDefault();
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.delete(selectedNodeId);
          return next;
        });
      } else if (e.key === "Escape") {
        setSelectedNodeId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tree, expandedIds, selectedNodeId]);

  function handleExportExcel() {
    if (!template) return;
    exportToExcel(template.name, nodes, nodeRefs);
  }

  function handleExportJson() {
    if (!template) return;
    exportToJson(template.name, nodes, nodeRefs);
  }

  function handleToggleExpand(nodeId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  function handleSelectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    if (isMobile) setMobileSheetOpen(true);
  }

  async function handleReorder(parentId: string | null, orderedIds: string[]) {
    const result = await reorderNodesAction(orderedIds);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("reclassification.node.reordered"));
    loadData();
  }

  async function handleMoveNode(nodeId: string, newParentId: string | null) {
    const result = await moveNodeAction(nodeId, newParentId);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("reclassification.node.moved"));
    // Expand the new parent so moved node is visible
    if (newParentId) {
      setExpandedIds((prev) => new Set([...prev, newParentId]));
    }
    loadData();
  }

  function handleAddChild(parentId: string | null) {
    setNewNodeParentId(parentId);
    setNewNodeSign("positive");
    setNewNodeCode("");
    setNewNodeName("");
    setNewNodeOpen(true);
  }

  async function handleCreateNode() {
    setIsSubmitting(true);
    const isNonBase = template && !template.is_base && !template.is_template;
    const result = await createNodeAction({
      templateId,
      parentId: newNodeParentId,
      code: newNodeCode,
      name: newNodeName,
      sign: newNodeSign,
      isTotal: isNonBase ? true : undefined,
    });
    setIsSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success(t("reclassification.node.created"));
    setNewNodeOpen(false);

    // Expand parent so new node is visible
    if (newNodeParentId) {
      setExpandedIds((prev) => new Set([...prev, newNodeParentId!]));
    }

    loadData();

    // Select the new node
    if (result.node) {
      setSelectedNodeId(result.node.id);
    }
  }

  async function handleSaveTemplateName() {
    if (!template || templateName === template.name) {
      setEditingName(false);
      return;
    }
    const result = await updateTemplateAction(template.id, { name: templateName });
    if ("error" in result) {
      toast.error(result.error);
      setTemplateName(template.name);
    } else {
      toast.success(t("reclassification.updated"));
      setTemplate({ ...template, name: templateName });
    }
    setEditingName(false);
  }

  function handleNodeUpdated() {
    loadData();
  }

  function handleNodeDeleted() {
    setSelectedNodeId(null);
    setMobileSheetOpen(false);
    loadData();
  }

  if (!authorized || (!orgId && !isSuperadmin) || loading) return null;
  if (!template) return null;

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  // Superadmin can edit system templates; for others, system templates are read-only
  const isReadOnly = (template.is_template && !isSuperadmin) || template.is_locked;
  const canEdit = (isAccountant || isSuperadmin) && !isReadOnly;
  // Non-base schemas can only have total nodes (no hierarchy)
  const isNonBaseSchema = !template.is_base && !template.is_template;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/settings/reclassification"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileSpreadsheet className="h-5 w-5 shrink-0" />
          {editingName && canEdit ? (
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onBlur={handleSaveTemplateName}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTemplateName();
                if (e.key === "Escape") {
                  setTemplateName(template.name);
                  setEditingName(false);
                }
              }}
              className="text-xl font-bold h-auto py-0 border-none focus-visible:ring-1"
              autoFocus
            />
          ) : (
            <h1
              className={`text-xl font-bold truncate ${
                canEdit ? "cursor-pointer hover:text-muted-foreground" : ""
              }`}
              onClick={() => {
                if (canEdit) setEditingName(true);
              }}
            >
              {template.name}
            </h1>
          )}
          {template.is_locked && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 ml-2 shrink-0">
              <Lock className="h-3 w-3 mr-1" />
              {t("reclassification.lockedBadge")}
            </Badge>
          )}
        </div>
        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
            <Download className="h-4 w-4 mr-1.5" />
            {t("common.exportExcel")}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportExcel}>
              {t("reclassification.exportExcel")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportJson}>
              {t("reclassification.exportJson")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Split view */}
      <div className="flex flex-1 min-h-0 gap-4">
        {/* Left panel — Tree */}
        <div className="w-full md:w-2/5 lg:w-1/3 border rounded-lg flex flex-col min-h-0">
          {/* Tree toolbar */}
          <div className="flex items-center gap-1 p-2 border-b shrink-0">
            <Input
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              placeholder={t("common.search")}
              className="h-7 text-xs flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleExpandAll}
              title={t("reclassification.expandAll")}
            >
              <ChevronsDownUp className="h-3.5 w-3.5 rotate-180" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleCollapseAll}
              title={t("reclassification.collapseAll")}
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-2">
          {tree.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground text-sm">
              <p>{t("reclassification.noTemplates")}</p>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddChild(null)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("reclassification.addRootNode")}
                </Button>
              )}
            </div>
          ) : (
            <NodeTree
              tree={tree}
              allNodes={nodes}
              baseNodes={baseNodes}
              nodeRefs={nodeRefs}
              selectedNodeId={selectedNodeId}
              expandedIds={expandedIds}
              onSelectNode={handleSelectNode}
              onToggleExpand={handleToggleExpand}
              onMoveNode={handleMoveNode}
              onReorderSiblings={handleReorder}
              onAddChild={handleAddChild}
              isAccountant={canEdit}
              isNonBaseSchema={isNonBaseSchema}
              searchQuery={treeSearch}
            />
          )}
          </div>
        </div>

        {/* Right panel — Node form (desktop only) */}
        {!isMobile && (
          <div className="hidden md:flex flex-1 border rounded-lg overflow-auto p-4">
            {selectedNode ? (
              <div className="w-full">
                <NodeDetailForm
                  node={selectedNode}
                  allNodes={nodes}
                  baseNodes={baseNodes}
                  nodeRefs={nodeRefs}
                  isAccountant={canEdit}
                  onNodeUpdated={handleNodeUpdated}
                  onNodeDeleted={handleNodeDeleted}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center w-full text-muted-foreground text-sm">
                {t("reclassification.selectNode")}
              </div>
            )}
          </div>
        )}

        {/* Mobile sheet for node detail */}
        {isMobile && (
          <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader>
                <SheetTitle>
                  {selectedNode?.full_code} — {selectedNode?.name}
                </SheetTitle>
              </SheetHeader>
              <div className="overflow-auto p-4">
                {selectedNode && (
                  <NodeDetailForm
                    node={selectedNode}
                    allNodes={nodes}
                    baseNodes={baseNodes}
                    nodeRefs={nodeRefs}
                    isAccountant={canEdit}
                    onNodeUpdated={handleNodeUpdated}
                    onNodeDeleted={handleNodeDeleted}
                  />
                )}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {/* New Node Dialog */}
      <Dialog open={newNodeOpen} onOpenChange={setNewNodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isNonBaseSchema
                ? t("reclassification.node.newTotalNode")
                : newNodeParentId
                  ? t("reclassification.node.newNode")
                  : t("reclassification.node.newRootNode")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("reclassification.node.code")}</Label>
              <Input
                value={newNodeCode}
                onChange={(e) => setNewNodeCode(e.target.value)}
                placeholder={t("reclassification.node.codePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("reclassification.node.name")}</Label>
              <Input
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder={t("reclassification.node.namePlaceholder")}
              />
            </div>
            {/* Sign — only for root nodes of base schemas */}
            {!newNodeParentId && !isNonBaseSchema && (
              <div className="space-y-2">
                <Label>{t("reclassification.node.sign")}</Label>
                <Select
                  value={newNodeSign}
                  onValueChange={(v) => setNewNodeSign(v as ReclassificationNodeSign)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {newNodeSign === "positive"
                        ? t("reclassification.node.positive")
                        : t("reclassification.node.negative")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">
                      {t("reclassification.node.positive")}
                    </SelectItem>
                    <SelectItem value="negative">
                      {t("reclassification.node.negative")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button
              onClick={handleCreateNode}
              disabled={isSubmitting || !newNodeCode.trim() || !newNodeName.trim()}
            >
              {isSubmitting ? t("common.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
