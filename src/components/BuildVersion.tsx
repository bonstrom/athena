import { JSX, useEffect, useState } from "react";

export function BuildVersion(): JSX.Element {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(process.env.PUBLIC_URL + "/build-version.txt")
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.text();
      })
      .then((text) => {
        if (text.includes("<!DOCTYPE")) throw new Error("HTML returned");
        setVersion(text);
      })
      .catch(() => setVersion("unknown"));
  }, []);

  return <small style={{ opacity: 0.6 }}>{version && `${version}`}</small>;
}
