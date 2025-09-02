// src/new-ui/components/LinkPreviewCard.jsx
import React from "react";

/**
 * Minimal Facebook-like link preview.
 * Props: { meta: { url, canonicalUrl, domain, title, description, image, siteName } }
 */
export default function LinkPreviewCard({ meta }) {
  if (!meta || !meta.url) return null;
  const href = meta.canonicalUrl || meta.url;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 overflow-hidden"
    >
      {/* image on top (if any) */}
      {meta.image ? (
        <div className="w-full aspect-video bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img
            src={meta.image}
            className="w-full h-full object-cover"
          />
        </div>
      ) : null}

      {/* text area */}
      <div className="p-3">
        <div className="text-xs text-zinc-500 mb-1">{meta.siteName || meta.domain}</div>
        <div className="font-semibold leading-snug line-clamp-2">
          {meta.title || meta.domain}
        </div>
        {meta.description ? (
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
            {meta.description}
          </div>
        ) : null}
      </div>
    </a>
  );
}
