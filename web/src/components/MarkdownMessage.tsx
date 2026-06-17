import { marked } from "marked";
import { useMemo } from "react";

marked.setOptions({ breaks: true, gfm: true });

interface Props {
  content: string;
  className?: string;
}

export function MarkdownMessage({ content, className = "" }: Props) {
  const html = useMemo(() => marked.parse(content, { async: false }) as string, [content]);

  return (
    <div
      className={`markdown-msg ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}