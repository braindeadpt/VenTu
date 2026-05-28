'use client';

import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

interface NewsPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  locale: string;
}

export default function NewsPagination({ currentPage, totalPages, onPageChange, locale }: NewsPaginationProps) {
  const isPt = locale === 'pt';

  if (totalPages <= 1) return null;

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);

    if (currentPage > 3) pages.push('ellipsis');

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) pages.push(i);

    if (currentPage < totalPages - 2) pages.push('ellipsis');

    pages.push(totalPages);

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav aria-label={isPt ? 'Paginação' : 'Pagination'} className="flex items-center justify-center gap-1 py-8">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="inline-flex items-center justify-center w-10 h-10 rounded-md text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-fg-muted hover:text-fg hover:bg-surface-1/[0.04]"
        aria-label={isPt ? 'Página anterior' : 'Previous page'}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {pageNumbers.map((page, idx) => {
        if (page === 'ellipsis') {
          return (
            <span
              key={`ellipsis-${idx}`}
              className="inline-flex items-center justify-center w-10 h-10 text-fg-subtle"
              aria-hidden="true"
            >
              <MoreHorizontal className="w-4 h-4" />
            </span>
          );
        }

        const isCurrent = page === currentPage;
        return (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            aria-current={isCurrent ? 'page' : undefined}
            className={[
              'inline-flex items-center justify-center w-10 h-10 rounded-md text-sm font-medium min-h-[44px] min-w-[44px]',
              'transition-all duration-200',
              isCurrent
                ? 'bg-surface-2/[0.08] border border-divider-strong text-fg'
                : 'text-fg-muted hover:text-fg hover:bg-surface-1/[0.04]',
            ].join(' ')}
          >
            {page}
          </button>
        );
      })}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="inline-flex items-center justify-center w-10 h-10 rounded-md text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-fg-muted hover:text-fg hover:bg-surface-1/[0.04]"
        aria-label={isPt ? 'Próxima página' : 'Next page'}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}
