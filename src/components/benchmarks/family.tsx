/**
 * FamilyLogo — inline family mark for benchmark surfaces.
 *
 * Reuses the platform's `getFamilyLogoUrl` map + `cm-family-icon` class
 * (fixed 0.85rem, flex-none, object-fit contain). Renders nothing for
 * unmapped families so the text-only fallback layout never shifts.
 */
import { getFamilyLogoUrl } from "@/lib/models";

export function FamilyLogo({ family }: { family: string }) {
    const logoUrl = getFamilyLogoUrl(family);
    if (!logoUrl) return null;
    return (
        <img
            src={logoUrl}
            alt={family}
            className="cm-family-icon"
            loading="lazy"
            decoding="async"
        />
    );
}
