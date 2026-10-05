"use client";

import { useEffect } from "react";
import { sentenceCase } from "@/lib/text";

/** Aplica el mismo formato al salir de cualquier campo descriptivo de la app. */
export function SentenceCaseInputs() {
  useEffect(() => {
    const normalize = (event: FocusEvent) => {
      const field = event.target;
      const isTextInput = field instanceof HTMLInputElement && (field.type === "text" || field.type === "tel");
      if (!(field instanceof HTMLTextAreaElement) && !isTextInput) return;
      if (field.dataset.preserveCase !== undefined) return;

      const value = sentenceCase(field.value);
      if (value === field.value) return;
      const setter = field instanceof HTMLTextAreaElement
        ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
        : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    };
    document.addEventListener("blur", normalize, true);
    return () => document.removeEventListener("blur", normalize, true);
  }, []);

  return null;
}
