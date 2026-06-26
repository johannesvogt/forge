'use client';

import ReactMarkdown from 'react-markdown';
import Link from 'next/link';

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          a({ href, children }) {
            if (href?.startsWith('/')) {
              return (
                <Link href={href} className="text-indigo-600 hover:underline">
                  {children}
                </Link>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                {children}
              </a>
            );
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          },
          ul({ children }) {
            return <ul className="mb-2 list-disc pl-5">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="mb-2 list-decimal pl-5">{children}</ol>;
          },
          li({ children }) {
            return <li className="mb-0.5">{children}</li>;
          },
          code({ children, className }) {
            const isBlock = className?.startsWith('language-');
            if (isBlock) {
              return (
                <pre className="mb-2 overflow-x-auto rounded bg-gray-100 p-3 text-xs font-mono">
                  <code>{children}</code>
                </pre>
              );
            }
            return <code className="rounded bg-gray-100 px-1 py-0.5 text-xs font-mono">{children}</code>;
          },
          strong({ children }) {
            return <strong className="font-semibold">{children}</strong>;
          },
          h1({ children }) {
            return <h1 className="mb-2 text-base font-semibold">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mb-1.5 text-sm font-semibold">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mb-1 text-sm font-medium">{children}</h3>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
