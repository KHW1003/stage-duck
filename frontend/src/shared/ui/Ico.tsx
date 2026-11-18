/**
 * 목업 v4 아이콘 그대로 (<svg class="icon">). 목업 CSS(kit.css)의 `.notice > .icon`, `.status .icon` 같은 규칙이 그대로 먹는다.
 * 목업의 `<span data-icon="lock" class="icon--sm">` → `<Ico name="lock" sm />`
 */
import { KIT_ICONS, type KitIconName } from "./kitIcons";

export type { KitIconName };

export function Ico({ name, sm = false, className }: { name: KitIconName; sm?: boolean; className?: string }) {
  return (
    <svg className={["icon", sm && "icon--sm", className].filter(Boolean).join(" ")} viewBox="0 0 24 24" aria-hidden="true">
      {KIT_ICONS[name]}
    </svg>
  );
}
