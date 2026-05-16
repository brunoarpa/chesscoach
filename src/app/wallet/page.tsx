import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DepositForm } from "@/components/deposit-form";
import { WithdrawForm } from "@/components/withdraw-form";
import { StripeConnectSetup } from "@/components/stripe-connect-setup";

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      walletBalance: true,
      reservedBalance: true,
      pendingEarnings: true,
      totalEarningsAllTime: true,
      verificationStatus: true,
      coachChatPrice: true,
      coachCallPrice: true,
    },
  });

  if (!user) redirect("/login");

  const transactions = await prisma.transaction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      lessonRequest: {
        select: {
          type: true,
          coach: { select: { username: true } },
          student: { select: { username: true } },
        },
      },
    },
  });

  const available = user.walletBalance - user.reservedBalance;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-8">Wallet</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">€{(available / 100).toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">Available</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">€{(user.reservedBalance / 100).toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">Reserved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">€{(user.pendingEarnings / 100).toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">Pending Earnings</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">€{(user.totalEarningsAllTime / 100).toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">Total Earned</div>
          </CardContent>
        </Card>
      </div>

      <DepositForm />

      {(user.coachChatPrice || user.coachCallPrice) && (
        <>
          <Separator className="my-8" />
          <StripeConnectSetup />
          <div className="mt-4">
            <WithdrawForm pendingEarnings={user.pendingEarnings} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Coaching earnings are paid out via your connected Stripe account. <strong>You are responsible for declaring this income</strong> to your local tax authority — ChessCoach does not withhold or remit taxes on your behalf.
          </p>
        </>
      )}

      <Separator className="my-8" />

      <h2 className="text-xl font-semibold mb-4">Transaction History</h2>

      {transactions.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No transactions yet.</p>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <Card key={tx.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">
                    {tx.type === "DEPOSIT" && "Deposit"}
                    {tx.type === "LESSON_PAYMENT" && (
                      <>
                        {tx.amount > 0 ? "Earned from" : "Paid for"}{" "}
                        lesson
                        {tx.amount > 0
                          ? ` (${tx.lessonRequest?.student?.username})`
                          : ` (${tx.lessonRequest?.coach?.username})`}
                      </>
                    )}
                    {tx.type === "LESSON_REFUND" && "Refund"}
                    {tx.type === "PAYOUT" && "Withdrawal"}
                  </span>
                  <div className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span
                  className={`font-mono font-medium ${
                    tx.amount > 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {tx.amount > 0 ? "+" : ""}€{(tx.amount / 100).toFixed(2)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
