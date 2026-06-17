import "server-only";

/**
 * Operator-facing vendor-photo grid (CF-20.1).
 *
 * Pure renderer — receives already-resolved photo rows (URL presigned
 * server-side, up-front, in the page loader) and never calls a reader
 * itself, mirroring components/vendor-invoice-documents.tsx.
 *
 * Each tile:
 *   - url present  -> thumbnail <img>, click opens full-size presigned URL
 *   - url null     -> muted "unavailable" tile (capture-provider / no R2 yet,
 *                     or a title-only placeholder row). Honest degrade — no
 *                     broken-image icon, no link to a non-fetchable URL.
 *
 * The url-null collapse covers all of the reader's
 * placeholder/unavailable/forbidden cases (the page maps each to url: null),
 * so this component stays presentation-only.
 */

export type JobPhotoTile = {
  id: string;
  title: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  url: string | null;
};

function formatSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function JobPhotosPanel({ photos }: { photos: JobPhotoTile[] }) {
  if (photos.length === 0) {
    return (
      <div className="mt-8">
        <h2 className="text-sm font-semibold">Photos</h2>
        <p className="mt-2 text-sm text-gray-500">
          No vendor photos on this job yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold">Photos</h2>
      <p className="mt-1 text-xs text-gray-500">
        Vendor-uploaded photos for this job. Internal — not client-visible.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo) => {
          const size = formatSize(photo.sizeBytes);
          const label = photo.title?.trim() || "Photo";

          if (photo.url) {
            return (
              <a
                key={photo.id}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={label}
                  className="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
                />
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-medium text-gray-700">
                    {label}
                  </p>
                  {size ? (
                    <p className="text-[11px] text-gray-400">{size}</p>
                  ) : null}
                </div>
              </a>
            );
          }

          return (
            <div
              key={photo.id}
              className="block overflow-hidden rounded-lg border border-dashed border-gray-200 bg-gray-50"
            >
              <div className="flex aspect-square w-full items-center justify-center bg-gray-100">
                <span className="text-[11px] text-gray-400">Unavailable</span>
              </div>
              <div className="px-2 py-1.5">
                <p className="truncate text-xs font-medium text-gray-600">
                  {label}
                </p>
                {size ? (
                  <p className="text-[11px] text-gray-400">{size}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
