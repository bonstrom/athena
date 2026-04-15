import { JSX, useEffect, useState } from 'react';

export function BuildVersion(): JSX.Element {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(process.env.PUBLIC_URL + '/build-version.txt')
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        const contentType = res.headers.get('content-type') ?? '';
        if (contentType.includes('text/html')) throw new Error('HTML response');
        return res.text();
      })
      .then((text) => {
        setVersion(text.trim());
      })
      .catch((err: unknown) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to fetch build version:', err);
        }
        setVersion('unknown');
      });
  }, []);

  return <small style={{ opacity: 0.6 }}>{version && `${version}`}</small>;
}
