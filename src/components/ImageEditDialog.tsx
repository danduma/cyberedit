import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImageEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialAttrs: any;
  isEditMode: boolean;
  onSave: (attrs: any) => void;
  onRemove: () => void;
}

export default function ImageEditDialog({
  isOpen,
  onClose,
  initialAttrs,
  onSave,
  onRemove,
}: ImageEditDialogProps) {
  const [alt, setAlt] = React.useState(initialAttrs?.alt || "");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Image</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="alt" className="text-right">
              Alt Text
            </Label>
            <Input
              id="alt"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={onRemove}>Remove</Button>
          <Button onClick={() => onSave({ alt })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


