"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { banUser, setUserRole } from "@/lib/actions/admin";
import { toast } from "sonner";

interface User {
  id: string;
  username: string;
  email: string | null;
  role: string;
  verificationStatus: string;
  activityStatus: string;
  walletBalance: number;
  totalEarningsAllTime: number;
  createdAt: string;
}

export function UserList({ users }: { users: User[] }) {
  async function handleBan(userId: string) {
    try {
      await banUser(userId);
      toast.success("User banned");
    } catch {
      toast.error("Failed");
    }
  }

  async function handleToggleAdmin(userId: string, currentRole: string) {
    try {
      await setUserRole(userId, currentRole === "ADMIN" ? "USER" : "ADMIN");
      toast.success("Role updated");
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
            <TableCell className="text-right font-mono">
              ${(user.walletBalance / 100).toFixed(2)}
            </TableCell>
            <TableCell className="text-right font-mono">
              ${(user.totalEarningsAllTime / 100).toFixed(2)}
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
                  variant="destructive"
                  onClick={() => handleBan(user.id)}
                >
                  Ban
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
