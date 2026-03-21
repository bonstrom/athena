import { JSX, useEffect, useState } from "react";

export function BuildVersion(): JSX.Element {
  const [version, setVersion] = useState<string | null>("2025");

  useEffect(() => {
    fetch("/build-version.txt")
      .then((res) => res.text())
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  return <small style={{ opacity: 0.6 }}>{version && `${version}`}</small>;
}
