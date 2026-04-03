"use client";

import { useEffect, useState } from "react";
import { SubjectForm } from "../_components/subject-form";
import { useTranslation } from "@/lib/i18n/context";
import type { Tag } from "@/types/supabase";

export default function NewSubjectPage() {
  const { t } = useTranslation();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const userRes = await fetch("/api/user-info");
        const userData = await userRes.json();
        const orgId = userData.profile?.organization_id;
        if (orgId) {
          const tagsRes = await fetch(`/api/tags?orgId=${orgId}`);
          const tagsData = await tagsRes.json();
          setTags(tagsData.tags ?? []);
        }
      } catch {
        // Tags will be empty, form still works
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  return <SubjectForm tags={tags} />;
}
