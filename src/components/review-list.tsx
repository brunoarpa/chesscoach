"use client";

import { Card, CardContent } from "@/components/ui/card";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  fromUser: { username: string };
  totalPaid?: number; // cents
}

interface Props {
  reviews: Review[];
  showTotalPaid?: boolean;
}

export function ReviewList({ reviews, showTotalPaid }: Props) {
  if (reviews.length === 0) {
    return <p className="text-muted-foreground text-sm">No reviews yet.</p>;
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <Card key={review.id}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {review.fromUser.username}
                </span>
                {showTotalPaid && review.totalPaid != null && review.totalPaid > 0 && (
                  <span className="text-xs text-muted-foreground">
                    · €{(review.totalPaid / 100).toFixed(2)} total paid
                  </span>
                )}
              </div>
              <div className="text-sm">
                {"★".repeat(review.rating)}
                {"☆".repeat(5 - review.rating)}
              </div>
            </div>
            {review.comment && (
              <p className="text-sm text-muted-foreground">{review.comment}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
