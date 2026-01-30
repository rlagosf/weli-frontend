// src/services/linkify.jsx
import React from "react";

export function linkifyText(text) {
  const s = String(text || "");
  if (!s) return null;

  // Match: http(s)://... o www....
  const urlRegex = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

  const parts = [];
  let lastIndex = 0;

  s.replace(urlRegex, (match, _g, offset) => {
    if (offset > lastIndex) parts.push(s.slice(lastIndex, offset));

    // recorta puntuación final típica pegada al link
    let raw = match;
    while (/[),.;!?]$/.test(raw)) raw = raw.slice(0, -1);
    const trailing = match.slice(raw.length);

    // si empieza con www. => https://
    const href = raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw;

    parts.push(
      <a
        key={`url-${offset}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="underline font-semibold break-words text-[#24C6FF] hover:text-[#7de3ff]"
      >
        {raw}
      </a>
    );

    if (trailing) parts.push(trailing);

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < s.length) parts.push(s.slice(lastIndex));

  // mantener saltos de línea sin whitespace-pre-wrap
  return parts.flatMap((p, i) =>
    typeof p === "string"
      ? p.split("\n").flatMap((line, j, arr) =>
          j < arr.length - 1 ? [line, <br key={`br-${i}-${j}`} />] : [line]
        )
      : [p]
  );
}
