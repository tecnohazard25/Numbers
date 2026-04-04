"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { useIsMobile } from "@/hooks/use-mobile";

export interface SubjectPickerOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  type: string;
  tax_code?: string | null;
  vat_number?: string | null;
  subject_contacts?: { type: string; value: string }[];
}

function getLabel(s: SubjectPickerOption): string {
  if (s.type === "person") return `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim();
  return s.business_name ?? "";
}

function getPhone(s: SubjectPickerOption): string {
  const phone = s.subject_contacts?.find((c) => c.type === "mobile" || c.type === "phone");
  return phone?.value ?? "";
}

function getTaxId(s: SubjectPickerOption): string {
  if (s.tax_code) return s.tax_code;
  if (s.vat_number) return s.vat_number;
  return "";
}

function matchesSearch(s: SubjectPickerOption, q: string): boolean {
  const lower = q.toLowerCase();
  if (getLabel(s).toLowerCase().includes(lower)) return true;
  if (s.tax_code?.toLowerCase().includes(lower)) return true;
  if (s.vat_number?.toLowerCase().includes(lower)) return true;
  if (s.subject_contacts?.some((c) => c.value.toLowerCase().includes(lower))) return true;
  return false;
}

interface SubjectPickerProps {
  subjects: SubjectPickerOption[];
  value: string;
  onChange: (id: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
}

function SubjectList({
  subjects,
  filtered,
  value,
  allowNone,
  noneLabel,
  t,
  onSelect,
}: {
  subjects: SubjectPickerOption[];
  filtered: SubjectPickerOption[];
  value: string;
  allowNone: boolean;
  noneLabel?: string;
  t: (key: string) => string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {allowNone && (
        <button
          type="button"
          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors ${!value ? "text-primary font-medium" : ""}`}
          onClick={() => onSelect("")}
        >
          {noneLabel ?? t("transactions.noSubject")}
        </button>
      )}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">{t("common.noData")}</p>
      ) : (
        filtered.map((s) => {
          const phone = getPhone(s);
          const taxId = getTaxId(s);
          const isSelected = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              className={`w-full text-left px-3 py-2.5 hover:bg-muted transition-colors ${isSelected ? "bg-primary/5" : ""}`}
              onClick={() => onSelect(s.id)}
            >
              <div className="text-sm font-medium truncate">{getLabel(s)}</div>
              {(taxId || phone) && (
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {taxId && <span>{taxId}</span>}
                  {phone && <span>{phone}</span>}
                </div>
              )}
            </button>
          );
        })
      )}
    </>
  );
}

export function SubjectPicker({
  subjects,
  value,
  onChange,
  allowNone = true,
  noneLabel,
  placeholder,
}: SubjectPickerProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(
    () => (search ? subjects.filter((s) => matchesSearch(s, search)) : subjects),
    [subjects, search]
  );

  const selectedSubject = subjects.find((s) => s.id === value);

  const handleOpen = () => {
    if (!isMobile && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
    setOpen(true);
  };

  const handleClose = () => { setOpen(false); setSearch(""); };

  const handleSelect = (id: string) => { onChange(id); handleClose(); };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="flex items-center w-full h-8 px-3 rounded-md border bg-background text-sm text-left hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={handleOpen}
      >
        <span className="flex-1 truncate">
          {value && selectedSubject ? (
            <span className="flex items-center gap-2">
              <span>{getLabel(selectedSubject)}</span>
              {getTaxId(selectedSubject) && (
                <span className="text-xs text-muted-foreground">{getTaxId(selectedSubject)}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder ?? t("transactions.selectSubject")}</span>
          )}
        </span>
        {value ? (
          <X
            className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2 hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
          />
        ) : (
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
        )}
      </button>

      {open && createPortal(
        isMobile ? (
          /* Mobile: full-screen panel */
          <div className="fixed inset-0 z-[100] bg-background flex flex-col">
            <div className="flex items-center gap-2 p-3 border-b">
              <Button variant="ghost" size="icon-sm" onClick={handleClose}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("common.search")}
                  className="pl-7 h-9 text-sm"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SubjectList
                subjects={subjects}
                filtered={filtered}
                value={value}
                allowNone={allowNone}
                noneLabel={noneLabel}
                t={t}
                onSelect={handleSelect}
              />
            </div>
          </div>
        ) : (
          /* Desktop: positioned dropdown */
          <>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div className="fixed inset-0 z-[100]" onClick={handleClose} />
            <div className="z-[101] rounded-md border bg-popover shadow-md" style={dropdownStyle}>
              <div className="p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("common.search")}
                    className="pl-7 h-8 text-sm"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-[250px] overflow-y-auto">
                <SubjectList
                  subjects={subjects}
                  filtered={filtered}
                  value={value}
                  allowNone={allowNone}
                  noneLabel={noneLabel}
                  t={t}
                  onSelect={handleSelect}
                />
              </div>
            </div>
          </>
        ),
        document.body
      )}
    </div>
  );
}
