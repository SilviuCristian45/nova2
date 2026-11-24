"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, X } from "lucide-react";
import { Text, useLanguage } from "@/app/components/language-provider";
import { Badge, Button, Card, CardTitle, Message } from "@/app/components/ui";
import { respondToEnrollmentAction } from "./clients/actions";

export type PendingRequestItem = {
  id: string;
  clientId: string;
  clientName: string;
  programTitle: string;
  createdAt: string;
};

export function PendingRequestsCard({ requests }: { requests: PendingRequestItem[] }) {
  const router = useRouter();
  const { locale } = useLanguage();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) return null;

  async function respond(enrollmentId: string, decision: "active" | "rejected") {
    setBusyId(`${enrollmentId}-${decision}`);
    setError(null);
    try {
      const res = await respondToEnrollmentAction(enrollmentId, decision);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card tone="gold">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle
          description={
            <Text
              ro="Aprobă sau respinge cererile de înscriere direct de aici."
              en="Approve or reject enrollment requests directly from here."
            />
          }
        >
          <span className="flex items-center gap-2 text-foreground">
            <Clock className="size-5 text-gold-text" />
            <Text ro="Cereri noi de înscriere" en="Pending enrollment requests" />
          </span>
        </CardTitle>
        <Badge tone="gold">{requests.length}</Badge>
      </div>

      {error && <Message>{error}</Message>}

      <div className="flex flex-col gap-2">
        {requests.map((req) => {
          const dateLabel = new Date(req.createdAt).toLocaleDateString(locale, {
            day: "numeric",
            month: "short",
          });
          return (
            <div
              key={req.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-card p-3.5 text-foreground"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{req.clientName}</p>
                <p className="truncate text-xs text-muted">
                  {req.programTitle} · {dateLabel}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  small
                  icon={Check}
                  busy={busyId === `${req.id}-active`}
                  disabled={busyId !== null && busyId !== `${req.id}-active`}
                  onClick={() => respond(req.id, "active")}
                >
                  <Text ro="Aprobă" en="Approve" />
                </Button>
                <Button
                  variant="soft"
                  tone="red"
                  small
                  icon={X}
                  busy={busyId === `${req.id}-rejected`}
                  disabled={busyId !== null && busyId !== `${req.id}-rejected`}
                  onClick={() => respond(req.id, "rejected")}
                >
                  <Text ro="Respinge" en="Reject" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
