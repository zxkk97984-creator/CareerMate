import type { SVGProps } from "react";

/** Shared CareerMate mark for public pages and the signed-in workspace. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" width="35" height="35" viewBox="0 0 40 40" {...props}>
      <path d="M21 19V13C21 5 29 1 37 3c2 8-2 16-10 16Z" fill="#2367FF" />
      <path d="M19 21v6C19 35 11 39 3 37c-2-8 2-16 10-16Z" fill="#2367FF" />
      <path d="M19 19h-6C5 19 1 11 3 3c8-2 16 2 16 10Z" fill="#7EACFF" />
      <path d="M21 21h6c8 0 12 8 10 16-8 2-16-2-16-10Z" fill="#C5DBFF" />
    </svg>
  );
}
