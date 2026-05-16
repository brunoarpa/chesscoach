"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setUserRole, suspendUser, unsuspendUser } from "@/lib/actions/admin";
import { toast } from "sonner";

interface User {
  id: string;
  username: string;
  email: string | null;
  role: string;
  verificationStatus: string;
  activityStatus: string;
  isSuspended: boolean;
  walletBalance: number;
  totalEarningsAllTime: number;
  createdAt: string;
  _count: { abuseFlags: number };
}

export function UserList({ users, linkedAccountsMap }: { users: User[]; linkedAccountsMap: Record<string, number> }) {
  async function handleToggleAdmin(userId: string, currentRole: string) {
    const action = currentRole === "ADMIN" ? "demote" : "promote";
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      await setUserRole(userId, currentRole === "ADMIN" ? "USER" : "ADMIN");
      toast.success("Role updated");
    } catch {
      toast.error("Failed");
    }
  }

  async function handleToggleSuspend(userId: string, isSuspended: boolean) {
    const action = isSuspended ? "unsuspend" : "suspend";
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      if (isSuspended) {
        await unsuspendUser(userId);
      } else {
        await suspendUser(userId);
      }
      toast.success(isSuspended ? "User unsuspended" : "User suspended");
    } catch {
      toast.error("Failed");
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Verification</TableHead>
          <TableHead>Flags</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead className="text-right">Total Earned</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="font-medium">{user.username}</div>
            </TableCell>
            <TableCell className="text-xs">{user.email || "—"}</TableCell>
            <TableCell>
              <Badge variant={user.role === "ADMIN" ? "destructive" : "outline"}>
                {user.role}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-1 flex-wrap">
                <Badge
                  variant={
                    user.activityStatus === "ACTIVE"
                      ? "default"
                      : user.activityStatus === "AWAY"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {user.activityStatus}
                </Badge>
                {user.isSuspended && (
                  <Badge variant="destructive">SUSPENDED</Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  user.verificationStatus === "VERIFIED"
                    ? "default"
                    : user.verificationStatus === "PENDING"
                    ? "secondary"
                    : "outline"
                }
              >
                {user.verificationStatus}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-1 flex-wrap">
                {user._count.abuseFlags > 0 && (
                  <Badge variant="destructive">{user._count.abuseFlags} flag{user._count.abuseFlags !== 1 ? "s" : ""}</Badge>
                )}
                {linkedAccountsMap[user.id] > 0 && (
                  <Badge variant="secondary">{linkedAccountsMap[user.id]} linked</Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right font-mono">
              €{(user.walletBalance / 100).toFixed(2)}
            </TableCell>
            <TableCell className="text-right font-mono">
              €{(user.totalEarningsAllTime / 100).toFixed(2)}
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleAdmin(user.id, user.role)}
                >
                  {user.role === "ADMIN" ? "Demote" : "Promote"}
                </Button>
                <Button
                  size="sm"
                  variant={user.isSuspended ? "default" : "destructive"}
                  onClick={() => handleToggleSuspend(user.id, user.isSuspended)}
                >
                  {user.isSuspended ? "Unsuspend" : "Suspend"}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
