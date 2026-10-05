import { type Permission, whoCan } from "@mostrador/shared";
import { NoPermission } from "../ui/States";

/** Estado sin permiso: dice qué rol puede. */
export function NoPermissionFor({ perm }: { perm: Permission }) {
  return (
    <div className="p-4 lg:p-6">
      <NoPermission who={whoCan(perm)} />
    </div>
  );
}
