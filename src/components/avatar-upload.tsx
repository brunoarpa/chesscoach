"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { uploadAvatar, removeAvatar } from "@/lib/actions/avatar";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

interface Props {
  username: string | null;
  image: string | null;
  customAvatar: boolean;
  // What the photo falls back to when no custom upload exists, for the helper text.
  hasChessComUsername: boolean;
}

export function AvatarUpload({ username, image, customAvatar, hasChessComUsername }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(image);
  const [isCustom, setIsCustom] = useState(customAvatar);
  const [pending, startTransition] = useTransition();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Use a JPG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be under 4MB.");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const res = await uploadAvatar(formData);
      if ("error" in res) {
        toast.error(res.error);
        setPreview(image); // revert on failure
        return;
      }
      setPreview(res.url);
      setIsCustom(true);
      toast.success("Photo updated.");
    });
  }

  function onRemove() {
    startTransition(async () => {
      const res = await removeAvatar();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setPreview(null);
      setIsCustom(false);
      toast.success("Photo removed.");
    });
  }

  const helper = isCustom
    ? "Your uploaded photo. It won't be overwritten."
    : hasChessComUsername
      ? "Currently synced from your chess.com avatar. Upload one to override it."
      : "Upload a photo, or verify chess.com to pull in your avatar automatically.";

  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <UserAvatar username={username} image={preview} size="xl" />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending ? "Uploading…" : isCustom ? "Change photo" : "Upload photo"}
          </Button>
          {isCustom && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
