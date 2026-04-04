"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Copy, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "@/lib/i18n/context";

interface Props {
  xmlContent: string;
  invoiceNumber: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HighlighterComponent = React.ComponentType<any>;

export function XmlTab({ xmlContent, invoiceNumber }: Props) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [Highlighter, setHighlighter] = useState<HighlighterComponent | null>(null);
  const [lightStyle, setLightStyle] = useState<Record<string, React.CSSProperties> | null>(null);
  const [darkStyle, setDarkStyle] = useState<Record<string, React.CSSProperties> | null>(null);

  useEffect(() => {
    // Dynamic import to avoid SSR and reduce bundle
    Promise.all([
      import("react-syntax-highlighter").then((mod) => mod.Light),
      import("react-syntax-highlighter/dist/esm/styles/hljs/vs").then((mod) => mod.default),
      import("react-syntax-highlighter/dist/esm/styles/hljs/vs2015").then((mod) => mod.default),
      import("react-syntax-highlighter/dist/esm/languages/hljs/xml").then((mod) => mod.default),
    ]).then(([LightComp, vs, vs2015, xmlLang]) => {
      LightComp.registerLanguage("xml", xmlLang);
      setHighlighter(() => LightComp);
      setLightStyle(vs);
      setDarkStyle(vs2015);
    });
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(xmlContent);
    setCopied(true);
    toast.success(t("invoices.detail.copied"));
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fattura_${invoiceNumber}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const style = resolvedTheme === "dark" ? darkStyle : lightStyle;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="cursor-pointer" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-1" />
          {t("invoices.detail.downloadXml")}
        </Button>
        <Button size="sm" variant="outline" className="cursor-pointer" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
          {t("invoices.detail.copyXml")}
        </Button>
      </div>
      <div className="rounded-lg border overflow-auto max-h-[600px]">
        {Highlighter && style ? (
          <Highlighter
            language="xml"
            style={style}
            showLineNumbers
            wrapLongLines
            customStyle={{ margin: 0, fontSize: "0.8rem" }}
          >
            {xmlContent}
          </Highlighter>
        ) : (
          <pre className="p-4 text-sm overflow-auto whitespace-pre-wrap font-mono bg-muted">{xmlContent}</pre>
        )}
      </div>
    </div>
  );
}
