import { useEffect, useState } from 'react';
import { getAssetBlob } from '../lib/api/client';

export function useAuthenticatedBlobUrl(url: string | null | undefined): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setObjectUrl(null);
      return;
    }
    if (!url.startsWith('/api/')) {
      setObjectUrl(url);
      return;
    }
    let revoked = false;
    let created: string | null = null;
    void getAssetBlob(url)
      .then((blob) => {
        if (revoked) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        if (!revoked) setObjectUrl(null);
      });
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  return objectUrl;
}
