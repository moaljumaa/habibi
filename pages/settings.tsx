// Settings lives in a dialog over the app (see components/SettingsModal). This route only
// exists so /settings and old bookmarks still land somewhere sensible: the Overview with the
// dialog open.
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function SettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/?settings=1");
  }, [router]);

  return null;
}
